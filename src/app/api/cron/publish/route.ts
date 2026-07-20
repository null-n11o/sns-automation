import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishAndLog } from '@/lib/publish-log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const { data: posts } = await supabase
    .from('posts')
    .select('*, accounts(*)')
    .eq('status', 'ready')
    .lte('scheduled_date', now)

  if (!posts?.length) {
    await cleanupOldLogs(supabase)
    return NextResponse.json({ published: 0 })
  }

  const results = await Promise.allSettled(
    posts.map(async post => {
      const account = post.accounts as Record<string, string | null>
      const { platformPostId, error } = await publishAndLog(supabase, {
        post: { id: post.id, account_id: post.account_id, content: post.content, image_url: post.image_url ?? null },
        account: {
          platform: account.platform as never,
          access_token: account.access_token,
          access_token_secret: account.access_token_secret,
          api_key: account.api_key,
          api_secret: account.api_secret,
          platform_user_id: account.platform_user_id,
        },
        trigger: 'cron',
      })

      if (error) {
        await supabase.from('posts').update({ status: 'failed', error_message: error }).eq('id', post.id)
        return { id: post.id, ok: false, error }
      }

      await supabase
        .from('posts')
        .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId })
        .eq('id', post.id)
      return { id: post.id, ok: true }
    })
  )

  await cleanupOldLogs(supabase)

  const published = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length
  return NextResponse.json({ published, total: posts.length })
}

async function cleanupOldLogs(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('publish_logs').delete().lt('created_at', cutoff)
  } catch {
    // クリーンアップ失敗はpublishに影響させない
  }
}
