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
  publish: PublishStepMeta | null
  failedStep: 'create' | 'publish' | null
}

export class PublishError extends Error {
  meta: PublishMeta
  constructor(message: string, meta: PublishMeta) {
    super(message)
    this.name = 'PublishError'
    this.meta = meta
  }
}

export async function postToThreads(
  { accessToken, userId, content, imageUrl }: ThreadsPostOptions,
): Promise<{ platformPostId: string; meta: PublishMeta }> {
  const meta: PublishMeta = { containerId: null, create: null, publish: null, failedStep: null }

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

  // Step 2: Publish the container
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
