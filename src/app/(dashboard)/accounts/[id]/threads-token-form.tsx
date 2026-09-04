'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateThreadsAccessToken } from '../actions'

interface Props {
  accountId: string
  initialHasToken: boolean
}

export function ThreadsTokenForm({ accountId, initialHasToken }: Props) {
  const [accessToken, setAccessToken] = useState('')
  const [hasToken, setHasToken] = useState(initialHasToken)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    const result = await updateThreadsAccessToken(accountId, accessToken)
    setLoading(false)

    if (result.error) {
      setMessage(`エラー: ${result.error}`)
      return
    }

    setAccessToken('')
    setHasToken(true)
    setMessage(
      result.username
        ? `@${result.username} のアクセストークンを更新しました`
        : 'アクセストークンを更新しました',
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="threads-access-token">Access Token</Label>
        <span className={`text-xs ${hasToken ? 'text-green-700' : 'text-amber-700'}`}>
          {hasToken ? '登録済み' : '未登録'}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Input
            id="threads-access-token"
            type="password"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
            aria-describedby="threads-access-token-help"
          />
        </div>
        <Button type="submit" disabled={loading || !accessToken.trim()}>
          {loading ? '確認中...' : '更新'}
        </Button>
      </div>
      <p id="threads-access-token-help" className="text-xs leading-relaxed text-gray-500">
        Threadsで有効性とユーザーを確認してから暗号化保存します。現在の値は表示されません。
      </p>
      {message && (
        <p
          aria-live="polite"
          className={`text-sm ${message.startsWith('エラー') ? 'text-red-500' : 'text-green-600'}`}
        >
          {message}
        </p>
      )}
    </form>
  )
}
