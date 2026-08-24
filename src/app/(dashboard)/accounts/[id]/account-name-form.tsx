'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAccountName } from '../actions'

interface Props {
  accountId: string
  initialName: string
}

export function AccountNameForm({ accountId, initialName }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const result = await updateAccountName(accountId, name)
    setLoading(false)
    if (result.error) {
      setMessage(`エラー: ${result.error}`)
    } else {
      setMessage('アカウント名を変更しました')
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="account-name">アカウント名</Label>
          <Input
            id="account-name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={loading || name.trim() === initialName}>
          {loading ? '保存中...' : '保存'}
        </Button>
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
    </form>
  )
}
