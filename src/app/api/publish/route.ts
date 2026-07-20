import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishAndLog } from '@/lib/publish-log'

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
    trigger: 'manual',
  })

  if (error) {
    await supabase.from('posts').update({ status: 'failed', error_message: error }).eq('id', post_id)
    return NextResponse.json({ error }, { status: 500 })
  }

  await supabase
    .from('posts')
    .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId })
    .eq('id', post_id)

  return NextResponse.json({ ok: true })
}
