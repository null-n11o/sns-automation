import type { Post, PostMetrics } from '@/types'

interface PostWithMetrics extends Post {
  latest_metrics: PostMetrics | null
  account_name?: string
}

interface Props {
  posts: PostWithMetrics[]
}

export function MetricsTable({ posts }: Props) {
  if (!posts.length) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        メトリクスデータがありません。投稿が公開されるとここに表示されます。
      </p>
    )
  }

  return (
    <div className="bg-white rounded shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left p-3 font-medium">投稿内容</th>
            <th className="text-left p-3 font-medium">投稿日</th>
            <th className="text-right p-3 font-medium">表示</th>
            <th className="text-right p-3 font-medium">いいね</th>
            <th className="text-right p-3 font-medium">リポスト</th>
            <th className="text-right p-3 font-medium">リプライ</th>
          </tr>
        </thead>
        <tbody>
          {posts.map(post => (
            <tr key={post.id} className="border-t hover:bg-gray-50">
              <td className="p-3 max-w-xs">
                <p className="line-clamp-2 text-gray-800">{post.content}</p>
              </td>
              <td className="p-3 text-gray-500 whitespace-nowrap">
                {post.published_at
                  ? new Date(post.published_at).toLocaleDateString('ja-JP')
                  : '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.impressions ?? '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.likes ?? '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.reposts ?? '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.replies ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
