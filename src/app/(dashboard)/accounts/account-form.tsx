'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createAccount } from './actions'

export function AccountForm() {
  const [platform, setPlatform] = useState<'x' | 'threads'>('x')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const fd = new FormData(e.currentTarget)
    fd.set('platform', platform)
    const result = await createAccount(fd)
    setLoading(false)
    if (result.error) {
      setMessage(`エラー: ${result.error}`)
    } else {
      setMessage('アカウントを追加しました')
      formRef.current?.reset()
      setPlatform('x')
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>プラットフォーム</Label>
          <Select value={platform} onValueChange={v => v && setPlatform(v as 'x' | 'threads')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="x">X (Twitter)</SelectItem>
              <SelectItem value="threads">Threads</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="account-name">アカウント名</Label>
          <Input id="account-name" name="account_name" required />
        </div>
      </div>

      <div>
        <Label htmlFor="posting-times">投稿時刻（HH:MM形式、カンマ区切り）</Label>
        <Input
          id="posting-times"
          name="posting_times"
          placeholder="例: 09:00, 12:00, 18:00"
        />
      </div>

      <div className="border-t pt-4">
        <p className="text-xs text-gray-500 mb-3">
          APIキー（入力した値はAES-256-GCMで暗号化して保存されます）
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="api-key">API Key</Label>
            <Input id="api-key" name="api_key" />
          </div>
          <div>
            <Label htmlFor="api-secret">API Secret</Label>
            <Input id="api-secret" name="api_secret" type="password" />
          </div>
          <div>
            <Label htmlFor="access-token">Access Token</Label>
            <Input id="access-token" name="access_token" />
          </div>
          <div>
            <Label htmlFor="access-token-secret">Access Token Secret</Label>
            <Input id="access-token-secret" name="access_token_secret" type="password" />
          </div>
        </div>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.startsWith('エラー') ? 'text-red-500' : 'text-green-600'
          }`}
        >
          {message}
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? '追加中...' : 'アカウントを追加'}
      </Button>
    </form>
  )
}
