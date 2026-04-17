import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishPost } from '@/lib/publish'
import type { Platform } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { post_id } = await request.json()

  const { data: post } = await supabase
    .from('posts')
    .select('*, accounts(*)')
    .eq('id', post_id)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

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

    await supabase.from('posts').update({ status: 'published' }).eq('id', post_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase.from('posts').update({ status: 'failed', error_message: message }).eq('id', post_id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
