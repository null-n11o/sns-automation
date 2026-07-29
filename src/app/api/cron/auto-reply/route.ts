import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchThreadsPostMetrics } from '@/lib/threads-metrics'
import { postToThreads } from '@/lib/threads-api'
import { decrypt } from '@/lib/crypto'

interface AutoReplyConfig {
  enabled?: boolean
  threshold?: number
  window_minutes?: number
  templates?: string[]
}

interface AccountShape {
  platform: string
  access_token: string | null
  platform_user_id: string | null
  auto_reply_config: AutoReplyConfig | null
}

function pickTemplate(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)]
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('id, platform_post_id, published_at, cta_reply_posted, accounts(platform, access_token, platform_user_id, auto_reply_config)')
    .eq('status', 'published')
    .eq('cta_reply_posted', false)
    .not('platform_post_id', 'is', null)
    .not('published_at', 'is', null)

  if (!posts?.length) return NextResponse.json({ replied: 0, checked: 0 })

  const now = Date.now()

  // 対象を絞り込む（enabled / threads / ウィンドウ内）
  const candidates = posts.filter((post) => {
    const accountRaw = post.accounts as unknown
    const account = (Array.isArray(accountRaw) ? accountRaw[0] : accountRaw) as AccountShape | undefined
    const config = account?.auto_reply_config
    if (!account || account.platform !== 'threads' || !config?.enabled) return false
    if (!account.access_token || !account.platform_user_id) return false
    const windowMs = (config.window_minutes ?? 60) * 60 * 1000
    const elapsed = now - new Date(post.published_at as string).getTime()
    return elapsed >= 0 && elapsed <= windowMs
  })

  if (!candidates.length) return NextResponse.json({ replied: 0, checked: 0 })

  const results = await Promise.allSettled(
    candidates.map(async (post) => {
      const accountRaw = post.accounts as unknown
      const account = (Array.isArray(accountRaw) ? accountRaw[0] : accountRaw) as AccountShape
      const config = account.auto_reply_config as AutoReplyConfig
      const threshold = config.threshold ?? 500
      const templates = config.templates ?? []
      if (!templates.length) return { replied: false }

      const accessToken = decrypt(account.access_token as string)
      const mediaId = post.platform_post_id as string

      const metrics = await fetchThreadsPostMetrics({ mediaId, accessToken })
      if (metrics.impressions < threshold) return { replied: false }

      const { platformPostId } = await postToThreads({
        accessToken,
        userId: account.platform_user_id as string,
        content: pickTemplate(templates),
        replyToId: mediaId,
      })

      await supabase
        .from('posts')
        .update({ cta_reply_posted: true, cta_reply_post_id: platformPostId })
        .eq('id', post.id)

      return { replied: true }
    }),
  )

  const replied = results.filter(
    (r) => r.status === 'fulfilled' && (r.value as { replied: boolean }).replied,
  ).length

  return NextResponse.json({ replied, checked: candidates.length })
}
