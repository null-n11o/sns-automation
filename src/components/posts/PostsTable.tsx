'use client'

import { useState } from 'react'
import { PostStatusBadge } from './PostStatusBadge'
import { CreatePostModal } from './CreatePostModal'
import { Button } from '@/components/ui/button'
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
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const filteredPosts = posts
    .filter(p => p.account_id === selectedAccountId)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

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
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: editContent } : p))
    setEditingId(null)
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

  const canEdit = (status: PostStatus) => status === 'draft' || status === 'review'

  return (
    <div>
      {/* アカウントタブ */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedAccountId(a.id)}
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
        <Button onClick={() => setShowCreateModal(true)}>+ 新規投稿</Button>
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
            {filteredPosts.map(post => (
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
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(post.id)}>保存</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>キャンセル</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm line-clamp-2">{post.content}</p>
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
                        onClick={() => { setEditingId(post.id); setEditContent(post.content) }}
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
                    {post.status === 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(post.id, 'draft')}
                      >
                        差し戻し
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
