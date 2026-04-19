const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsMetrics {
  impressions: number
  likes: number
  replies: number
  reposts: number
}

export async function fetchThreadsPostMetrics({
  mediaId,
  accessToken,
}: {
  mediaId: string
  accessToken: string
}): Promise<ThreadsMetrics> {
  const url = new URL(`${THREADS_API_BASE}/${mediaId}/insights`)
  url.searchParams.set('metric', 'views,likes,replies,reposts,quotes')
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString())
  const data = await res.json()

  if (!res.ok) {
    throw new Error(`Threads Insights API error: ${data.error?.message ?? 'Unknown error'}`)
  }

  const getValue = (name: string): number => {
    const item = (data.data as Array<{ name: string; values: Array<{ value: number }> }>)
      .find(d => d.name === name)
    return item?.values[0]?.value ?? 0
  }

  return {
    impressions: getValue('views'),
    likes: getValue('likes'),
    replies: getValue('replies'),
    reposts: getValue('reposts'),
  }
}
