import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generatePosts } from '@/lib/claude'
import type { Platform } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { account_id } = body
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const { data: account } = await supabase
    .from('accounts')
    .select('id, platform, account_name')
    .eq('id', account_id)
    .single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { data: promptConfig } = await supabase
    .from('prompt_configs')
    .select('system_prompt, reference_data')
    .eq('account_id', account_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = promptConfig ?? {
    system_prompt: `あなたは${account.account_name}の${account.platform === 'threads' ? 'Threads' : 'X'}アカウントの運用担当者です。エンゲージメントの高い投稿を生成してください。`,
    reference_data: '',
  }

  const weekDates: string[] = []
  const base = new Date()
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    weekDates.push(d.toISOString().slice(0, 10))
  }

  const contents = await generatePosts({
    systemPrompt: config.system_prompt,
    referenceData: config.reference_data,
    platform: account.platform as Platform,
    weekDates,
  })

  const postsToInsert = contents.map((content, i) => ({
    account_id,
    content,
    scheduled_date: weekDates[i],
    status: 'draft' as const,
    source: 'ai' as const,
  }))

  const { data: posts, error } = await supabase
    .from('posts')
    .insert(postsToInsert)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ posts, count: posts?.length ?? 0 })
}
