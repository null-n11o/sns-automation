import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PostsTable } from '@/components/posts/PostsTable'
import { withLatestMetrics } from '@/lib/analytics/latest-metrics'
import type { Post, PostMetrics } from '@/types'

export default async function PostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const { data: posts } = await supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
    // Fetch newest posts first so the database row limit does not discard them.
    .order('scheduled_date', { ascending: false })

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">投稿管理</h1>
      {!accounts?.length ? (
        <p className="text-gray-500 text-sm">
          アカウントがありません。先に<Link href="/accounts" className="underline">アカウントを登録</Link>してください。
        </p>
      ) : (
        <PostsTable
          initialPosts={withLatestMetrics(
            (posts ?? []) as (Post & { post_metrics: PostMetrics[] })[]
          )}
          accounts={accounts}
          isAdmin={profile?.role === 'admin'}
        />
      )}
    </div>
  )
}
