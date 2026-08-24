'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PostStatusBadge } from './PostStatusBadge'
import { CreatePostModal } from './CreatePostModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Post, PostSource, PostStatus } from '@/types'

interface Account {
  id: string
  account_name: string
  platform: string
}

const PLATFORM_LABELS: Record<string, string> = {
  x: 'X',
  threads: 'Threads',
}

const platformLabel = (platform: string) => PLATFORM_LABELS[platform] ?? platform

interface Props {
  initialPosts: Post[]
  accounts: Account[]
  isAdmin?: boolean
}

const STATUSES: PostStatus[] = ['draft', 'review', 'ready', 'published', 'failed']
const STATUS_LABELS: Record<PostStatus, string> = {
  draft: '下書き',
  review: 'レビュー',
  ready: '投稿待ち',
  published: '公開済み',
  failed: '失敗',
}
const SOURCE_LABELS: Record<PostSource, string> = {
  ai: 'AI',
  manual: '手動',
}
type StatusFilter = 'all' | PostStatus
type SourceFilter = 'all' | PostSource
type SortOrder = 'scheduled_desc' | 'scheduled_asc' | 'created_desc' | 'created_asc'

export function PostsTable({ initialPosts, accounts, isAdmin = false }: Props) {
  const [posts, setPosts] = useState(initialPosts)
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editScheduledDate, setEditScheduledDate] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('scheduled_desc')

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)

  const filteredPosts = posts
    .filter(p => p.account_id === selectedAccountId)
    .filter(p => statusFilter === 'all' || p.status === statusFilter)
    .filter(p => sourceFilter === 'all' || p.source === sourceFilter)
    .filter(p => p.content.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => {
      const [field, direction] = sortOrder.split('_') as ['scheduled' | 'created', 'asc' | 'desc']
      const aDate = field === 'scheduled' ? a.scheduled_date : a.created_at
      const bDate = field === 'scheduled' ? b.scheduled_date : b.created_at
      const diff = new Date(aDate).getTime() - new Date(bDate).getTime()
      return direction === 'asc' ? diff : -diff
    })

  const itemsPerPage = 50
  const totalItems = filteredPosts.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const activePage = currentPage > totalPages ? totalPages : currentPage

  const startIndex = (activePage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex)

  const getPageNumbers = () => {
    const pageNumbers = []
    const maxButtons = 5
    
    if (totalPages <= maxButtons) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i)
      }
    } else {
      pageNumbers.push(1)
      
      let start = Math.max(2, activePage - 1)
      let end = Math.min(totalPages - 1, activePage + 1)
      
      if (activePage <= 2) {
        end = 4
      } else if (activePage >= totalPages - 1) {
        start = totalPages - 3
      }
      
      if (start > 2) {
        pageNumbers.push('ellipsis-start')
      }
      
      for (let i = start; i <= end; i++) {
        pageNumbers.push(i)
      }
      
      if (end < totalPages - 1) {
        pageNumbers.push('ellipsis-end')
      }
      
      pageNumbers.push(totalPages)
    }
    return pageNumbers
  }

  async function refreshPosts() {
    const res = await fetch(`/api/posts?account_id=${selectedAccountId}`)
    const data = await res.json()
    setPosts(prev => {
      const others = prev.filter(p => p.account_id !== selectedAccountId)
      return [...others, ...data]
    })
  }

  async function updateStatus(postId: string, status: PostStatus) {
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status } : p))
  }

  async function saveEdit(postId: string) {
    const utcScheduledDate = new Date(editScheduledDate).toISOString()
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent, image_url: editImageUrl, scheduled_date: utcScheduledDate }),
    })
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, content: editContent, image_url: editImageUrl.trim() || null, scheduled_date: utcScheduledDate } : p
    ))
    setEditingId(null)
  }

  async function generateWeeklyPosts() {
    setGenerating(true)
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAccountId }),
    })
    const data = await res.json()
    if (res.ok) {
      await refreshPosts()
    } else {
      alert(`生成エラー: ${data.error}`)
    }
    setGenerating(false)
  }

  async function publishNow(postId: string) {
    setPublishingId(postId)
    await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    })
    await refreshPosts()
    setPublishingId(null)
  }

  const canEdit = (status: PostStatus) => status === 'draft' || status === 'review' || status === 'ready'

  const resetPage = () => setCurrentPage(1)

  return (
    <div>
      {/* アカウントタブ */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => {
              setSelectedAccountId(a.id)
              setCurrentPage(1)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${
              selectedAccountId === a.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 border hover:bg-gray-50'
            }`}
          >
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                selectedAccountId === a.id
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {platformLabel(a.platform)}
            </span>
            {a.account_name}
          </button>
        ))}
      </div>

      {/* アクション */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{filteredPosts.length} 件</p>
          {selectedAccount && (
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-900">{selectedAccount.account_name}</span>
              <span className="ml-1">（{platformLabel(selectedAccount.platform)}）</span>
              {isAdmin && (
                <Link
                  href={`/accounts/${selectedAccount.id}`}
                  className="ml-2 text-blue-600 hover:underline"
                >
                  アカウント名を変更
                </Link>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={generateWeeklyPosts}
            disabled={generating}
          >
            {generating ? '生成中...' : '1週間分を生成'}
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>+ 新規投稿</Button>
        </div>
      </div>

      {/* フィルタ・ソート */}
      <div className="grid gap-3 mb-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          本文検索
          <Input
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              resetPage()
            }}
            placeholder="キーワード"
            className="h-9 text-sm font-normal text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          ステータス
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value as StatusFilter)
              resetPage()
            }}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm font-normal text-gray-900"
          >
            <option value="all">すべて</option>
            {STATUSES.map(status => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          ソース
          <select
            value={sourceFilter}
            onChange={e => {
              setSourceFilter(e.target.value as SourceFilter)
              resetPage()
            }}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm font-normal text-gray-900"
          >
            <option value="all">すべて</option>
            <option value="ai">{SOURCE_LABELS.ai}</option>
            <option value="manual">{SOURCE_LABELS.manual}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          並び替え
          <select
            value={sortOrder}
            onChange={e => {
              setSortOrder(e.target.value as SortOrder)
              resetPage()
            }}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm font-normal text-gray-900"
          >
            <option value="scheduled_desc">予約日時が新しい順</option>
            <option value="scheduled_asc">予約日時が古い順</option>
            <option value="created_desc">作成日が新しい順</option>
            <option value="created_asc">作成日が古い順</option>
          </select>
        </label>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 text-sm font-medium">本文</th>
              <th className="text-left p-4 text-sm font-medium">予約日時</th>
              <th className="text-left p-4 text-sm font-medium">ステータス</th>
              <th className="text-left p-4 text-sm font-medium">ソース</th>
              <th className="text-left p-4 text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedPosts.map(post => (
              <tr key={post.id} className="border-t hover:bg-gray-50">
                <td className="p-4 max-w-xs">
                  {editingId === post.id ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                      <Input
                        type="url"
                        value={editImageUrl}
                        onChange={e => setEditImageUrl(e.target.value)}
                        placeholder="画像URL"
                        className="text-sm"
                      />
                      <Input
                        type="datetime-local"
                        value={editScheduledDate}
                        onChange={e => setEditScheduledDate(e.target.value)}
                        className="text-sm border rounded px-2 py-1"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(post.id)}>保存</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>キャンセル</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm line-clamp-2">{post.content}</p>
                      {post.image_url && (
                        <div className="flex items-center gap-2">
                          <div
                            aria-label="添付画像"
                            className="h-10 w-10 rounded border bg-cover bg-center"
                            style={{ backgroundImage: `url(${post.image_url})` }}
                          />
                          <span className="text-xs text-gray-500">画像あり</span>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                  {new Date(post.scheduled_date).toLocaleString('ja-JP')}
                </td>
                <td className="p-4">
                  <Select
                    value={post.status}
                    onValueChange={v => updateStatus(post.id, v as PostStatus)}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue>
                        <PostStatusBadge status={post.status} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => (
                        <SelectItem key={s} value={s}>
                          <PostStatusBadge status={s} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-4">
                  <span className="text-xs text-gray-500">{post.source === 'ai' ? 'AI' : '手動'}</span>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {canEdit(post.status) && editingId !== post.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(post.id)
                          setEditContent(post.content)
                          setEditImageUrl(post.image_url ?? '')
                          const d = new Date(post.scheduled_date)
                          const pad = (n: number) => String(n).padStart(2, '0')
                          setEditScheduledDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
                        }}
                      >
                        編集
                      </Button>
                    )}
                    {post.status === 'ready' && (
                      <Button
                        size="sm"
                        onClick={() => publishNow(post.id)}
                        disabled={publishingId === post.id}
                      >
                        {publishingId === post.id ? '投稿中...' : '今すぐ投稿'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredPosts.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400 text-sm">
                  投稿がありません。「+ 新規投稿」から作成してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ページネーションコントロール */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-gray-700 text-sm">
            <div>
              <p className="text-sm text-gray-500">
                全 <span className="font-medium text-gray-900">{totalItems}</span> 件中{' '}
                <span className="font-medium text-gray-900">{startIndex + 1}</span> 〜{' '}
                <span className="font-medium text-gray-900">{Math.min(endIndex, totalItems)}</span> 件を表示
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={activePage === 1}
                className="h-8 px-2 text-xs"
              >
                最初
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={activePage === 1}
                className="h-8 px-2 text-xs"
              >
                前へ
              </Button>
              
              {getPageNumbers().map((page, index) => {
                if (page === 'ellipsis-start' || page === 'ellipsis-end') {
                  return (
                    <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                      ...
                    </span>
                  )
                }
                
                return (
                  <Button
                    key={`page-${page}`}
                    variant={activePage === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(page as number)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    {page}
                  </Button>
                )
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={activePage === totalPages}
                className="h-8 px-2 text-xs"
              >
                次へ
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={activePage === totalPages}
                className="h-8 px-2 text-xs"
              >
                最後
              </Button>
            </div>
          </div>
        )}
      </div>

      <CreatePostModal
        accountId={selectedAccountId}
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refreshPosts}
      />
    </div>
  )
}
