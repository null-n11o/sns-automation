const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

// Threads ユーザーインサイトの followers_count を取得する。
// followers_count は total_value 型で返る（投稿単位 /insights の values[0].value とは形が異なる）。
// 取得できない場合（メトリクス非返却 / 権限・API エラー / 値欠損・不正）は null を返し、例外は投げない。
export async function fetchThreadsFollowersCount({
  userId,
  accessToken,
}: {
  userId: string
  accessToken: string
}): Promise<number | null> {
  try {
    const url = new URL(`${THREADS_API_BASE}/${userId}/threads_insights`)
    url.searchParams.set('metric', 'followers_count')
    url.searchParams.set('access_token', accessToken)

    const res = await fetch(url.toString())
    const data = await res.json()

    if (!res.ok) return null

    const item = (data.data as Array<{ name: string; total_value?: { value?: number } }> | undefined)
      ?.find(d => d.name === 'followers_count')
    const value = item?.total_value?.value
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}
