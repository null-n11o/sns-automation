'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateCompanyName } from './actions'

interface CompanyFormProps {
  companyId: string
  currentName: string
}

export function CompanyForm({ companyId, currentName }: CompanyFormProps) {
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setMessage(null)
    const result = await updateCompanyName(companyId, name)
    setSaving(false)
    if (result.error) {
      setMessage(`エラー: ${result.error}`)
    } else {
      setMessage('保存しました')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label htmlFor="company-name">企業名</Label>
        <Input
          id="company-name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
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
      <Button type="submit" disabled={saving}>
        {saving ? '保存中...' : '保存'}
      </Button>
    </form>
  )
}
