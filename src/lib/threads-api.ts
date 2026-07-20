const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsPostOptions {
  accessToken: string
  userId: string
  content: string
  imageUrl?: string | null
}

export interface PublishStepMeta {
  httpStatus: number | null
  ms: number | null
  response: unknown | null
}

export interface PublishMeta {
  containerId: string | null
  create: PublishStepMeta | null
  status: PublishStepMeta | null
  publish: PublishStepMeta | null
  failedStep: 'create' | 'status' | 'publish' | null
}

export class PublishError extends Error {
  meta: PublishMeta
  constructor(message: string, meta: PublishMeta) {
    super(message)
    this.name = 'PublishError'
    this.meta = meta
  }
}

const CONTAINER_POLL_MAX_ATTEMPTS = 10
const CONTAINER_POLL_INTERVAL_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// コンテナ作成は非同期で処理されるため、status=FINISHED を待たずに
// threads_publish を呼ぶと "The requested resource does not exist" で失敗する。
async function waitForContainerFinished(
  containerId: string,
  accessToken: string,
): Promise<PublishStepMeta> {
  const start = Date.now()
  let lastMeta: PublishStepMeta = { httpStatus: null, ms: null, response: null }

  for (let attempt = 1; attempt <= CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
    const statusUrl = new URL(`${THREADS_API_BASE}/${containerId}`)
    statusUrl.searchParams.set('fields', 'status,error_message')
    statusUrl.searchParams.set('access_token', accessToken)

    const res = await fetch(statusUrl.toString())
    const data = await res.json()
    lastMeta = { httpStatus: res.status, ms: Date.now() - start, response: data }

    if (!res.ok || data.status === 'FINISHED' || data.status === 'ERROR' || data.status === 'EXPIRED') {
      return lastMeta
    }

    if (attempt < CONTAINER_POLL_MAX_ATTEMPTS) {
      await sleep(CONTAINER_POLL_INTERVAL_MS)
    }
  }

  return lastMeta
}

export async function postToThreads(
  { accessToken, userId, content, imageUrl }: ThreadsPostOptions,
): Promise<{ platformPostId: string; meta: PublishMeta }> {
  const meta: PublishMeta = { containerId: null, create: null, status: null, publish: null, failedStep: null }

  // Step 1: Create media container
  const createUrl = new URL(`${THREADS_API_BASE}/${userId}/threads`)
  createUrl.searchParams.set('media_type', imageUrl ? 'IMAGE' : 'TEXT')
  createUrl.searchParams.set('text', content)
  if (imageUrl) createUrl.searchParams.set('image_url', imageUrl)
  createUrl.searchParams.set('access_token', accessToken)

  const createStart = Date.now()
  const createRes = await fetch(createUrl.toString(), { method: 'POST' })
  const createData = await createRes.json()
  meta.create = { httpStatus: createRes.status, ms: Date.now() - createStart, response: createData }

  if (!createRes.ok) {
    meta.failedStep = 'create'
    throw new PublishError(`Threads API error: ${createData.error?.message ?? 'Unknown error'}`, meta)
  }

  const containerId = createData.id
  meta.containerId = containerId

  // Step 2: Wait for the container to finish processing before publishing
  const statusMeta = await waitForContainerFinished(containerId, accessToken)
  meta.status = statusMeta
  const statusData = statusMeta.response as { status?: string; error_message?: string; error?: { message?: string } } | null

  if (statusData?.status !== 'FINISHED') {
    meta.failedStep = 'status'
    const reason = statusData?.error_message
      ?? statusData?.error?.message
      ?? `Threads container did not finish processing in time (status: ${statusData?.status ?? 'unknown'})`
    throw new PublishError(`Threads container error: ${reason}`, meta)
  }

  // Step 3: Publish the container
  const publishUrl = new URL(`${THREADS_API_BASE}/${userId}/threads_publish`)
  publishUrl.searchParams.set('creation_id', containerId)
  publishUrl.searchParams.set('access_token', accessToken)

  const publishStart = Date.now()
  const publishRes = await fetch(publishUrl.toString(), { method: 'POST' })
  const publishData = await publishRes.json()
  meta.publish = { httpStatus: publishRes.status, ms: Date.now() - publishStart, response: publishData }

  if (!publishRes.ok) {
    meta.failedStep = 'publish'
    throw new PublishError(`Threads publish error: ${publishData.error?.message ?? 'Unknown error'}`, meta)
  }

  return { platformPostId: publishData.id, meta }
}
