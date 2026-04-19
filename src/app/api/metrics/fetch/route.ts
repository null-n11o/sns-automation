import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchThreadsPostMetrics } from '@/lib/threads-metrics'
import { decrypt } from '@/lib/crypto'

// 各マイルストーン（ミリ秒）: 1h, 24h, 7d
const MILESTONES_MS = [
  1 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // published_at と platform_post_id がある Threads 投稿を取得
  const { data: posts } = await supabase
    .from('posts')
    .select('id, platform_post_id, published_at, accounts(platform, access_token, platform_user_id), post_metrics(fetched_at)')

  if (!posts?.length) return NextResponse.json({ fetched: 0 })

  const now = Date.now()
  const toFetch: Array<{ postId: string; mediaId: string; accessToken: string }> = []

  for (const post of posts) {
    const accountRaw = post.accounts as unknown
    const account = (Array.isArray(accountRaw) ? accountRaw[0] : accountRaw) as { platform: string; access_token: string | null; platform_user_id: string | null }
    if (account.platform !== 'threads' || !account.access_token) continue

    const publishedAt = new Date(post.published_at as string).getTime()
    const elapsed = now - publishedAt
    const existingCount = Array.isArray(post.post_metrics) ? post.post_metrics.length : 0

    // 次のマイルストーンに達していれば取得
    const nextMilestone = MILESTONES_MS[existingCount]
    if (nextMilestone !== undefined && elapsed >= nextMilestone) {
      toFetch.push({
        postId: post.id,
        mediaId: post.platform_post_id as string,
        accessToken: decrypt(account.access_token),
      })
    }
  }

  if (!toFetch.length) return NextResponse.json({ fetched: 0 })

  const results = await Promise.allSettled(
    toFetch.map(async ({ postId, mediaId, accessToken }) => {
      const metrics = await fetchThreadsPostMetrics({ mediaId, accessToken })
      return supabase.from('post_metrics').insert([{ post_id: postId, ...metrics }])
    })
  )

  const fetched = results.filter(r => r.status === 'fulfilled').length
  return NextResponse.json({ fetched, total: toFetch.length })
}
