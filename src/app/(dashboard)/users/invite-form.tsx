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
import { inviteUser } from './actions'

export function InviteUserForm() {
  const [role, setRole] = useState('operator')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const fd = new FormData(e.currentTarget)
    fd.set('role', role)
    const result = await inviteUser(fd)
    setLoading(false)
    if (result.error) {
      setMessage(`エラー: ${result.error}`)
    } else {
      setMessage('ユーザーを追加しました')
      formRef.current?.reset()
      setRole('operator')
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="invite-email">メールアドレス</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="invite-password">初期パスワード</Label>
          <Input id="invite-password" name="password" type="password" required minLength={8} />
        </div>
      </div>
      <div>
        <Label>ロール</Label>
        <Select value={role} onValueChange={v => v && setRole(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="operator">オペレーター</SelectItem>
            <SelectItem value="admin">管理者</SelectItem>
          </SelectContent>
        </Select>
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
        {loading ? '追加中...' : 'ユーザーを追加'}
      </Button>
    </form>
  )
}
