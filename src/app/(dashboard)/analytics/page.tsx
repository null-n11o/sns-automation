import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MetricsTable } from '@/components/analytics/MetricsTable'
import type { PostMetrics } from '@/types'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  // published 投稿を最新メトリクスとともに取得
  const { data: posts } = await supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(100)

  // 各投稿の最新メトリクスだけ残す
  const postsWithLatestMetrics = (posts ?? []).map(post => {
    const metrics = (post.post_metrics as PostMetrics[]).sort(
      (a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime()
    )
    return { ...post, latest_metrics: metrics[0] ?? null }
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">分析</h1>
        <a
          href="/analytics/report"
          target="_blank"
          className="text-sm text-blue-600 hover:underline"
        >
          レポートを印刷
        </a>
      </div>

      {!accounts?.length ? (
        <p className="text-sm text-gray-500">アカウントがありません。</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded shadow p-4">
              <p className="text-xs text-gray-500 mb-1">総投稿数</p>
              <p className="text-2xl font-bold">{postsWithLatestMetrics.length}</p>
            </div>
            <div className="bg-white rounded shadow p-4">
              <p className="text-xs text-gray-500 mb-1">総表示回数</p>
              <p className="text-2xl font-bold">
                {postsWithLatestMetrics
                  .reduce((sum, p) => sum + (p.latest_metrics?.impressions ?? 0), 0)
                  .toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded shadow p-4">
              <p className="text-xs text-gray-500 mb-1">総いいね数</p>
              <p className="text-2xl font-bold">
                {postsWithLatestMetrics
                  .reduce((sum, p) => sum + (p.latest_metrics?.likes ?? 0), 0)
                  .toLocaleString()}
              </p>
            </div>
          </div>

          <MetricsTable posts={postsWithLatestMetrics} />
        </>
      )}
    </div>
  )
}
