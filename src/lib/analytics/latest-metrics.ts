import type { Post, PostMetrics } from '@/types'

export type PostWithLatestMetrics = Post & { latest_metrics: PostMetrics | null }

export function withLatestMetrics<T extends { post_metrics: PostMetrics[] }>(
  posts: T[]
): (T & { latest_metrics: PostMetrics | null })[] {
  return posts.map(post => {
    const metrics = [...post.post_metrics].sort(
      (a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime()
    )
    return { ...post, latest_metrics: metrics[0] ?? null }
  })
}
