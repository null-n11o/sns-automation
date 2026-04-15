'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteAccount } from './actions'

interface DeleteAccountButtonProps {
  accountId: string
  accountName: string
}

export function DeleteAccountButton({ accountId, accountName }: DeleteAccountButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm(`「${accountName}」を削除しますか？この操作は取り消せません。`)) return
    setLoading(true)
    await deleteAccount(accountId)
    setLoading(false)
  }

  return (
    <Button variant="destructive" size="sm" disabled={loading} onClick={handleDelete}>
      {loading ? '削除中...' : '削除'}
    </Button>
  )
}
