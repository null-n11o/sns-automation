import type { PostStatus } from '@/types'

const statusStyles: Record<PostStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

const statusLabels: Record<PostStatus, string> = {
  draft: 'ドラフト',
  review: 'レビュー中',
  ready: '準備完了',
  published: '公開済み',
  failed: '失敗',
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  )
}
