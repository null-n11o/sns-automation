import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withLatestMetrics } from '@/lib/analytics/latest-metrics'
import type { Post, PostMetrics } from '@/types'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')

  let query = supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
    .order('scheduled_date')
  if (accountId) query = query.eq('account_id', accountId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(
    withLatestMetrics((data ?? []) as (Post & { post_metrics: PostMetrics[] })[])
  )
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { account_id, content, scheduled_date, source = 'manual', image_url } = body

  const { data, error } = await supabase.from('posts').insert({
    account_id,
    content,
    image_url: normalizeImageUrl(image_url),
    scheduled_date,
    source,
    status: 'draft',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

function normalizeImageUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
