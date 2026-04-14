'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteUser } from './actions'

interface DeleteButtonProps {
  userId: string
  email: string
  isSelf: boolean
}

export function DeleteButton({ userId, email, isSelf }: DeleteButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm(`「${email}」を削除しますか？この操作は取り消せません。`)) return
    setLoading(true)
    await deleteUser(userId)
    setLoading(false)
  }

  if (isSelf) {
    return <span className="text-xs text-gray-400">（自分）</span>
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={loading}
      onClick={handleDelete}
    >
      {loading ? '削除中...' : '削除'}
    </Button>
  )
}
