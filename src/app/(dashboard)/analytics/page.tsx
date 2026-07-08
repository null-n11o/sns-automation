import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MetricsView } from '@/components/analytics/MetricsView'
import { withLatestMetrics, type PostWithLatestMetrics } from '@/lib/analytics/latest-metrics'
import type { Post, PostMetrics } from '@/types'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const firstAccountId = accounts?.[0]?.id

  const { data: posts } = firstAccountId
    ? await supabase
        .from('posts')
        .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
        .eq('status', 'published')
        .eq('account_id', firstAccountId)
        .order('published_at', { ascending: false })
        .limit(100)
    : { data: [] }

  const initialPosts: PostWithLatestMetrics[] = withLatestMetrics(
    (posts ?? []) as (Post & { post_metrics: PostMetrics[] })[]
  )

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">分析</h1>
        <Link href="/analytics/reports" className="text-sm text-blue-600 hover:underline">
          分析レポート
        </Link>
      </div>

      {!accounts?.length ? (
        <p className="text-sm text-gray-500">アカウントがありません。</p>
      ) : (
        <MetricsView accounts={accounts} initialPosts={initialPosts} />
      )}
    </div>
  )
}
