import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishPost } from '@/lib/publish'
import type { Platform } from '@/types'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Find all ready posts scheduled for today or earlier
  const { data: posts } = await supabase
    .from('posts')
    .select('*, accounts(*)')
    .eq('status', 'ready')
    .lte('scheduled_date', today)

  if (!posts?.length) {
    return NextResponse.json({ published: 0 })
  }

  const results = await Promise.allSettled(
    posts.map(async post => {
      const account = post.accounts as Record<string, string | null>
      try {
        await publishPost({
          platform: account.platform as Platform,
          content: post.content,
          access_token: account.access_token,
          access_token_secret: account.access_token_secret,
          api_key: account.api_key,
          api_secret: account.api_secret,
          platform_user_id: account.platform_user_id,
        })

        await supabase.from('posts').update({ status: 'published' }).eq('id', post.id)
        return { id: post.id, ok: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await supabase.from('posts').update({ status: 'failed', error_message: message }).eq('id', post.id)
        return { id: post.id, ok: false, error: message }
      }
    })
  )

  const published = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length
  return NextResponse.json({ published, total: posts.length })
}
