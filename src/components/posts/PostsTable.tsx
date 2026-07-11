'use client'

import { useState } from 'react'
import { PostStatusBadge } from './PostStatusBadge'
import { CreatePostModal } from './CreatePostModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Post, PostStatus } from '@/types'

interface Account {
  id: string
  account_name: string
  platform: string
}

interface Props {
  initialPosts: Post[]
  accounts: Account[]
}

const STATUSES: PostStatus[] = ['draft', 'review', 'ready', 'published', 'failed']

export function PostsTable({ initialPosts, accounts }: Props) {
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

  const filteredPosts = posts
    .filter(p => p.account_id === selectedAccountId)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

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
            className={`px-4 py-2 rounded text-sm font-medium ${
              selectedAccountId === a.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 border hover:bg-gray-50'
            }`}
          >
            {a.account_name}
          </button>
        ))}
      </div>

      {/* アクション */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{filteredPosts.length} 件</p>
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
