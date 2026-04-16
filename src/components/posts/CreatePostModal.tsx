'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  accountId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreatePostModal({ accountId, open, onClose, onCreated }: Props) {
  const [content, setContent] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        content,
        scheduled_date: scheduledDate,
        source: 'manual',
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? '投稿の作成に失敗しました')
    } else {
      setContent('')
      setScheduledDate('')
      onCreated()
      onClose()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>投稿を作成</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>本文</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              required
              placeholder="投稿内容を入力..."
            />
            <p className="text-xs text-gray-500 mt-1">{content.length} 文字</p>
          </div>
          <div>
            <Label>予約日時</Label>
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : 'ドラフトとして保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
