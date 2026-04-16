const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsPostOptions {
  accessToken: string
  userId: string
  content: string
}

export async function postToThreads({ accessToken, userId, content }: ThreadsPostOptions): Promise<string> {
  // Step 1: Create media container
  const createUrl = new URL(`${THREADS_API_BASE}/${userId}/threads`)
  createUrl.searchParams.set('media_type', 'TEXT')
  createUrl.searchParams.set('text', content)
  createUrl.searchParams.set('access_token', accessToken)

  const createRes = await fetch(createUrl.toString(), { method: 'POST' })
  const createData = await createRes.json()

  if (!createRes.ok) {
    throw new Error(`Threads API error: ${createData.error?.message ?? 'Unknown error'}`)
  }

  const containerId = createData.id

  // Step 2: Publish the container
  const publishUrl = new URL(`${THREADS_API_BASE}/${userId}/threads_publish`)
  publishUrl.searchParams.set('creation_id', containerId)
  publishUrl.searchParams.set('access_token', accessToken)

  const publishRes = await fetch(publishUrl.toString(), { method: 'POST' })
  const publishData = await publishRes.json()

  if (!publishRes.ok) {
    throw new Error(`Threads publish error: ${publishData.error?.message ?? 'Unknown error'}`)
  }

  return publishData.id
}
