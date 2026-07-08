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
  if (!accountId) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
    .eq('status', 'published')
    .eq('account_id', accountId)
    .order('published_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const posts = withLatestMetrics(
    (data ?? []) as (Post & { post_metrics: PostMetrics[] })[]
  )
  return NextResponse.json(posts)
}
