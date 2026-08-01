'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { updateAutoReplyConfig } from '../actions'

const MAX_TIERS = 4

interface TierRow {
  hours: string
  threshold: string
}

interface Props {
  accountId: string
  initial: {
    enabled: boolean
    tiers: { window_minutes: number; threshold: number }[]
    templates: string[]
  }
}

export function AutoReplyForm({ accountId, initial }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [tiers, setTiers] = useState<TierRow[]>(
    initial.tiers.length
      ? initial.tiers.map((t) => ({
          hours: String(t.window_minutes / 60),
          threshold: String(t.threshold),
        }))
      : [{ hours: '', threshold: '' }],
  )
  const [templates, setTemplates] = useState<string[]>(
    initial.templates.length ? initial.templates : [''],
  )
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function updateTier(i: number, field: keyof TierRow, value: string) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
  }
  function addTier() {
    setTiers((prev) => (prev.length < MAX_TIERS ? [...prev, { hours: '', threshold: '' }] : prev))
  }
  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i))
  }
  function updateTemplate(i: number, value: string) {
    setTemplates((prev) => prev.map((t, idx) => (idx === i ? value : t)))
  }
  function addTemplate() {
    setTemplates((prev) => [...prev, ''])
  }
  function removeTemplate(i: number) {
    setTemplates((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setLoading(true)
    setMessage(null)
    const result = await updateAutoReplyConfig(accountId, {
      enabled,
      tiers: tiers.map((t) => ({ hours: Number(t.hours), threshold: Number(t.threshold) })),
      templates,
    })
    setLoading(false)
    setMessage(result.error ? `エラー: ${result.error}` : '保存しました')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <Label>自動リプライを有効にする</Label>
      </div>

      <div className={enabled ? '' : 'opacity-50'}>
        <div className="mb-6">
          <p className="text-sm font-medium mb-1">発火条件（いずれか成立で発火・最大{MAX_TIERS}個）</p>
          <p className="text-xs text-gray-500 mb-3">
            「投稿後 経過時間（h）以内 かつ インプレッションが閾値以上」で発火します。
          </p>
          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-end gap-2">
                <div>
                  <Label htmlFor={`tier-hours-${i}`}>経過時間（h）</Label>
                  <Input
                    id={`tier-hours-${i}`}
                    type="number"
                    step="0.5"
                    min="0"
                    value={tier.hours}
                    onChange={(e) => updateTier(i, 'hours', e.target.value)}
                    className="w-28"
                  />
                </div>
                <div>
                  <Label htmlFor={`tier-threshold-${i}`}>インプレ閾値</Label>
                  <Input
                    id={`tier-threshold-${i}`}
                    type="number"
                    min="0"
                    value={tier.threshold}
                    onChange={(e) => updateTier(i, 'threshold', e.target.value)}
                    className="w-32"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeTier(i)}
                  disabled={tiers.length <= 1}
                >
                  削除
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addTier}
            disabled={tiers.length >= MAX_TIERS}
            className="mt-2"
          >
            条件を追加
          </Button>
        </div>

        <div>
          <p className="text-sm font-medium mb-1">リプ文面</p>
          <p className="text-xs text-gray-500 mb-3">複数登録した場合はランダムで1つが選ばれます。</p>
          <div className="space-y-2">
            {templates.map((tpl, i) => (
              <div key={i} className="flex items-start gap-2">
                <Textarea
                  value={tpl}
                  onChange={(e) => updateTemplate(i, e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeTemplate(i)}
                  disabled={templates.length <= 1}
                >
                  削除
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={addTemplate} className="mt-2">
            文面を追加
          </Button>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith('エラー') ? 'text-red-500' : 'text-green-600'}`}>
          {message}
        </p>
      )}

      <Button type="button" onClick={handleSave} disabled={loading}>
        {loading ? '保存中...' : '保存'}
      </Button>
    </div>
  )
}
