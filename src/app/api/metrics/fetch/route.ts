import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchThreadsPostMetrics } from '@/lib/threads-metrics'
import { fetchXPostMetrics } from '@/lib/x-metrics'
import { decrypt } from '@/lib/crypto'

const MILESTONES_MS = [
  1 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]

type FetchTarget =
  | { postId: string; mediaId: string; platform: 'threads'; accessToken: string }
  | {
      postId: string
      mediaId: string
      platform: 'x'
      apiKey: string
      apiSecret: string
      accessToken: string
      accessTokenSecret: string
    }

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('id, platform_post_id, published_at, accounts(platform, access_token, api_key, api_secret, access_token_secret, platform_user_id), post_metrics(fetched_at)')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .not('platform_post_id', 'is', null)

  if (!posts?.length) return NextResponse.json({ fetched: 0 })

  const now = Date.now()
  const toFetch: FetchTarget[] = []

  for (const post of posts) {
    const accountRaw = post.accounts as unknown
    const account = (Array.isArray(accountRaw) ? accountRaw[0] : accountRaw) as {
      platform: string
      access_token: string | null
      api_key: string | null
      api_secret: string | null
      access_token_secret: string | null
      platform_user_id: string | null
    }

    const publishedAt = new Date(post.published_at as string).getTime()
    const elapsed = now - publishedAt
    const existingCount = Array.isArray(post.post_metrics) ? post.post_metrics.length : 0
    const nextMilestone = MILESTONES_MS[existingCount]
    if (nextMilestone === undefined || elapsed < nextMilestone) continue

    if (account.platform === 'threads' && account.access_token) {
      toFetch.push({
        postId: post.id,
        mediaId: post.platform_post_id as string,
        platform: 'threads',
        accessToken: decrypt(account.access_token),
      })
    } else if (
      account.platform === 'x' &&
      account.api_key &&
      account.api_secret &&
      account.access_token &&
      account.access_token_secret
    ) {
      toFetch.push({
        postId: post.id,
        mediaId: post.platform_post_id as string,
        platform: 'x',
        apiKey: decrypt(account.api_key),
        apiSecret: decrypt(account.api_secret),
        accessToken: decrypt(account.access_token),
        accessTokenSecret: decrypt(account.access_token_secret),
      })
    }
  }

  if (!toFetch.length) return NextResponse.json({ fetched: 0 })

  const results = await Promise.allSettled(
    toFetch.map(async (target) => {
      const metrics =
        target.platform === 'threads'
          ? await fetchThreadsPostMetrics({ mediaId: target.mediaId, accessToken: target.accessToken })
          : await fetchXPostMetrics({
              tweetId: target.mediaId,
              apiKey: target.apiKey,
              apiSecret: target.apiSecret,
              accessToken: target.accessToken,
              accessTokenSecret: target.accessTokenSecret,
            })
      return supabase.from('post_metrics').insert([{ post_id: target.postId, ...metrics }])
    })
  )

  const fetched = results.filter(r => r.status === 'fulfilled').length
  return NextResponse.json({ fetched, total: toFetch.length })
}
