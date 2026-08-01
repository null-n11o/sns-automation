# 自動リプライ設定 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アカウントごとの設定ページ `/accounts/[id]` から、Threads 自動リプライの ON/OFF・発火条件（tiers 最大4）・リプ文面（templates）を編集できるようにする。

**Architecture:** 設定ページはサーバーコンポーネントで account を取得（admin + company スコープでガード）。編集フォームはクライアントコンポーネントで、保存は Server Action `updateAutoReplyConfig` が `accounts.auto_reply_config` (JSONB) を丸ごと更新する。保存形式は cron (`src/app/api/cron/auto-reply/route.ts`) が読む既存型 `{ enabled, tiers: [{window_minutes, threshold}], templates }` と完全一致させる。

**Tech Stack:** Next.js (App Router, Server Actions), React client components, Supabase (service client), shadcn/base-ui コンポーネント, Vitest。

## Global Constraints

- このリポジトリの Next.js は独自仕様。動的ルートの `params` は `Promise<{ id: string }>`、`const { id } = await params` で受ける（既存 `analytics/reports/[id]/page.tsx` に準拠）。
- 自動リプライは Threads 専用。X アカウントでは設定欄を出さず注記のみ。
- 編集権限は admin のみ。account.company_id が自分の company と一致することを検証（既存 `deleteAccount` パターン）。
- 保存する `auto_reply_config` は cron 既存型と一致: `{ enabled: boolean, tiers: {window_minutes:number, threshold:number}[], templates: string[] }`。
- 経過時間 UI は時間単位（小数許可、0.5=30分）。保存時 `window_minutes = Math.round(hours * 60)`。
- tiers は最大4。ON時は 1〜4個・templates 1個以上が必須。
- UI コンポーネントには単体テストを付けない（リポジトリ既存方針。UI 検証は `npm run lint` と `npm run build` のクリーン確認）。Server Action は Vitest でテスト。
- 既存の base-ui コンポーネントは `@base-ui/react/<part>` から import（例: `dialog.tsx` を参照）。

## File Structure

- Create: `src/components/ui/switch.tsx` — ON/OFF トグルの UI プリミティブ（base-ui Switch ラッパー）
- Create: `src/app/(dashboard)/accounts/[id]/page.tsx` — 設定ページ（サーバーコンポーネント）
- Create: `src/app/(dashboard)/accounts/[id]/auto-reply-form.tsx` — 自動リプライ編集フォーム（クライアント）
- Modify: `src/app/(dashboard)/accounts/actions.ts` — `updateAutoReplyConfig` を追加
- Modify: `src/app/(dashboard)/accounts/page.tsx` — 各行に「設定」リンク + Threads 行に ON/OFF バッジ（select に `auto_reply_config` を追加）
- Test: `src/test/accounts/auto-reply-config.test.ts` — `updateAutoReplyConfig` の単体テスト

---

### Task 1: Server Action `updateAutoReplyConfig`

**Files:**
- Modify: `src/app/(dashboard)/accounts/actions.ts`（末尾に追加。既存 `getAdminProfile` を再利用）
- Test: `src/test/accounts/auto-reply-config.test.ts`

**Interfaces:**
- Consumes: 既存 `getAdminProfile()`（同ファイル内、`{ role:'admin'; company_id:string } | null` を返す）、`createServiceClient()`、`revalidatePath`。
- Produces:
  ```ts
  interface AutoReplyTierInput { hours: number; threshold: number }
  interface AutoReplyConfigInput {
    enabled: boolean
    tiers: AutoReplyTierInput[]
    templates: string[]
  }
  export async function updateAutoReplyConfig(
    accountId: string,
    input: AutoReplyConfigInput,
  ): Promise<{ error: string | null }>
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/test/accounts/auto-reply-config.test.ts` を新規作成:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabaseClient),
  createServiceClient: vi.fn().mockResolvedValue(mockSupabaseClient),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { updateAutoReplyConfig } = await import('@/app/(dashboard)/accounts/actions')

// profile(users) → account select(accounts) → update(accounts) の順に from が呼ばれる
function wireSupabase(opts: {
  role?: string
  profileCompany?: string
  account?: { company_id: string; platform: string; auto_reply_config: unknown } | null
  onUpdate?: (args: Record<string, unknown>) => void
}) {
  const profileBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { role: opts.role ?? 'admin', company_id: opts.profileCompany ?? 'c1' },
      error: null,
    }),
  }
  const accountBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: opts.account ?? null, error: null }),
  }
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const updateBuilder = {
    update: vi.fn().mockImplementation((args: Record<string, unknown>) => {
      opts.onUpdate?.(args)
      return { eq: updateEq }
    }),
  }
  let accountsCall = 0
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'users') return profileBuilder
    if (table === 'accounts') {
      accountsCall++
      return accountsCall === 1 ? accountBuilder : updateBuilder
    }
    return {}
  })
  mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  return { updateBuilder }
}

describe('updateAutoReplyConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error for non-admin', async () => {
    wireSupabase({ role: 'operator' })
    const result = await updateAutoReplyConfig('a1', { enabled: false, tiers: [], templates: [] })
    expect(result.error).toBe('管理者権限が必要です')
  })

  it('returns error when account belongs to different company', async () => {
    wireSupabase({ profileCompany: 'company-A', account: { company_id: 'company-B', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', { enabled: false, tiers: [], templates: [] })
    expect(result.error).toBe('操作権限がありません')
  })

  it('converts hours to window_minutes and saves config when enabled', async () => {
    let saved: Record<string, unknown> | null = null
    wireSupabase({
      account: { company_id: 'c1', platform: 'threads', auto_reply_config: null },
      onUpdate: (args) => { saved = args },
    })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [
        { hours: 1, threshold: 300 },
        { hours: 5, threshold: 600 },
        { hours: 0.5, threshold: 200 },
      ],
      templates: ['  文面A  ', ''],
    })
    expect(result.error).toBeNull()
    expect(saved!.auto_reply_config).toEqual({
      enabled: true,
      tiers: [
        { window_minutes: 60, threshold: 300 },
        { window_minutes: 300, threshold: 600 },
        { window_minutes: 30, threshold: 200 },
      ],
      templates: ['文面A'],
    })
  })

  it('rejects enabled save with zero valid tiers', async () => {
    wireSupabase({ account: { company_id: 'c1', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [{ hours: 0, threshold: 0 }],
      templates: ['文面'],
    })
    expect(result.error).toBe('条件は1〜4個で設定してください')
  })

  it('rejects enabled save with more than 4 tiers', async () => {
    wireSupabase({ account: { company_id: 'c1', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [
        { hours: 1, threshold: 100 },
        { hours: 2, threshold: 200 },
        { hours: 3, threshold: 300 },
        { hours: 4, threshold: 400 },
        { hours: 5, threshold: 500 },
      ],
      templates: ['文面'],
    })
    expect(result.error).toBe('条件は1〜4個で設定してください')
  })

  it('rejects enabled save with no templates', async () => {
    wireSupabase({ account: { company_id: 'c1', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [{ hours: 1, threshold: 300 }],
      templates: ['   '],
    })
    expect(result.error).toBe('リプ文面を1つ以上入力してください')
  })

  it('keeps existing templates when saving disabled with empty input', async () => {
    let saved: Record<string, unknown> | null = null
    wireSupabase({
      account: {
        company_id: 'c1',
        platform: 'threads',
        auto_reply_config: {
          enabled: true,
          tiers: [{ window_minutes: 60, threshold: 300 }],
          templates: ['既存文面'],
        },
      },
      onUpdate: (args) => { saved = args },
    })
    const result = await updateAutoReplyConfig('a1', { enabled: false, tiers: [], templates: [] })
    expect(result.error).toBeNull()
    expect(saved!.auto_reply_config).toEqual({
      enabled: false,
      tiers: [{ window_minutes: 60, threshold: 300 }],
      templates: ['既存文面'],
    })
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/test/accounts/auto-reply-config.test.ts`
Expected: FAIL（`updateAutoReplyConfig` が export されていない）

- [ ] **Step 3: 最小実装を書く**

`src/app/(dashboard)/accounts/actions.ts` の末尾に追加:

```ts
interface AutoReplyTierInput {
  hours: number
  threshold: number
}

interface AutoReplyConfigInput {
  enabled: boolean
  tiers: AutoReplyTierInput[]
  templates: string[]
}

export async function updateAutoReplyConfig(
  accountId: string,
  input: AutoReplyConfigInput,
): Promise<{ error: string | null }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: '管理者権限が必要です' }

  const service = await createServiceClient()
  const { data: account } = await service
    .from('accounts')
    .select('company_id, platform, auto_reply_config')
    .eq('id', accountId)
    .single()

  if (!account || account.company_id !== profile.company_id) {
    return { error: '操作権限がありません' }
  }

  const tiers = input.tiers
    .filter(
      (t) =>
        Number.isFinite(t.hours) &&
        t.hours > 0 &&
        Number.isFinite(t.threshold) &&
        t.threshold > 0,
    )
    .map((t) => ({
      window_minutes: Math.round(t.hours * 60),
      threshold: Math.round(t.threshold),
    }))

  const templates = input.templates.map((t) => t.trim()).filter((t) => t.length > 0)

  if (input.enabled) {
    if (tiers.length < 1 || tiers.length > 4) {
      return { error: '条件は1〜4個で設定してください' }
    }
    if (templates.length < 1) {
      return { error: 'リプ文面を1つ以上入力してください' }
    }
  }

  const existing = (account.auto_reply_config ?? {}) as {
    tiers?: { window_minutes: number; threshold: number }[]
    templates?: string[]
  }

  const config = {
    enabled: input.enabled,
    tiers: tiers.length ? tiers : (existing.tiers ?? []),
    templates: templates.length ? templates : (existing.templates ?? []),
  }

  const { error } = await service
    .from('accounts')
    .update({ auto_reply_config: config })
    .eq('id', accountId)

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  revalidatePath(`/accounts/${accountId}`)
  return { error: null }
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/test/accounts/auto-reply-config.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add "src/app/(dashboard)/accounts/actions.ts" src/test/accounts/auto-reply-config.test.ts
git commit -m "feat: add updateAutoReplyConfig server action"
```

---

### Task 2: Switch UI プリミティブ + 自動リプライ編集フォーム

**Files:**
- Create: `src/components/ui/switch.tsx`
- Create: `src/app/(dashboard)/accounts/[id]/auto-reply-form.tsx`

**Interfaces:**
- Consumes: `updateAutoReplyConfig(accountId, { enabled, tiers:[{hours,threshold}], templates })`（Task 1）、`Button`/`Input`/`Label`/`Textarea`（既存）、`Switch`（本タスクで作成）。
- Produces:
  ```ts
  export function AutoReplyForm(props: {
    accountId: string
    initial: {
      enabled: boolean
      tiers: { window_minutes: number; threshold: number }[]
      templates: string[]
    }
  }): JSX.Element
  ```

- [ ] **Step 1: Switch コンポーネントを作成**

`src/components/ui/switch.tsx`:

```tsx
"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-background shadow transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
```

注: base-ui の `Switch.Root` は制御プロップ `checked` と `onCheckedChange={(checked: boolean) => ...}` を受け取る。状態属性は `data-[checked]` / `data-[unchecked]`。

- [ ] **Step 2: 自動リプライフォームを作成**

`src/app/(dashboard)/accounts/[id]/auto-reply-form.tsx`:

```tsx
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
```

- [ ] **Step 3: lint とビルドで検証**

Run: `npm run lint`
Expected: エラーなし（新規2ファイルに対する警告なし）

注: `page.tsx`（Task 3）がまだ無いため `npm run build` はこの時点では実行しない。lint のみで型・構文を確認する。

- [ ] **Step 4: コミット**

```bash
git add src/components/ui/switch.tsx "src/app/(dashboard)/accounts/[id]/auto-reply-form.tsx"
git commit -m "feat: add Switch component and auto-reply settings form"
```

---

### Task 3: 設定ページ + 一覧ページの導線

**Files:**
- Create: `src/app/(dashboard)/accounts/[id]/page.tsx`
- Modify: `src/app/(dashboard)/accounts/page.tsx`

**Interfaces:**
- Consumes: `AutoReplyForm`（Task 2）、`createClient`（既存）、`redirect`/`notFound`（`next/navigation`）、`Link`（`next/link`）。
- Produces: ルート `/accounts/[id]`（設定ページ）。一覧ページに `/accounts/[id]` への「設定」リンクと ON/OFF バッジを追加。

- [ ] **Step 1: 設定ページを作成**

`src/app/(dashboard)/accounts/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AutoReplyForm } from './auto-reply-form'

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/accounts')

  const { data: account } = await supabase
    .from('accounts')
    .select('id, platform, account_name, posting_times, auto_reply_config, company_id')
    .eq('id', id)
    .single()

  if (!account || account.company_id !== profile.company_id) notFound()

  const config = (account.auto_reply_config ?? {}) as {
    enabled?: boolean
    tiers?: { window_minutes: number; threshold: number }[]
    templates?: string[]
  }

  return (
    <div className="max-w-2xl">
      <Link href="/accounts" className="text-sm text-gray-500 hover:underline">
        ← アカウント一覧
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-6">{account.account_name} の設定</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6 text-sm space-y-1">
        <p>
          <span className="text-gray-500">プラットフォーム: </span>
          {account.platform === 'x' ? 'X' : 'Threads'}
        </p>
        <p>
          <span className="text-gray-500">投稿時刻: </span>
          {account.posting_times.length > 0 ? account.posting_times.join(', ') : '—'}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-medium mb-4">自動リプライ設定</h2>
        {account.platform === 'threads' ? (
          <AutoReplyForm
            accountId={account.id}
            initial={{
              enabled: config.enabled ?? false,
              tiers: config.tiers ?? [],
              templates: config.templates ?? [],
            }}
          />
        ) : (
          <p className="text-sm text-gray-500">自動リプライは Threads のみ対応しています。</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 一覧ページに導線とバッジを追加**

`src/app/(dashboard)/accounts/page.tsx` を次のように変更:

1. import に `Link` を追加（ファイル先頭）:

```tsx
import Link from 'next/link'
```

2. accounts の select に `auto_reply_config` を追加:

```tsx
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, platform, account_name, posting_times, auto_reply_config, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true })
```

3. テーブルヘッダーの「投稿時刻」列の後に「自動リプライ」列を追加:

```tsx
              <TableHead>投稿時刻</TableHead>
              <TableHead>自動リプライ</TableHead>
              <TableHead>登録日</TableHead>
```

4. 各行の「投稿時刻」セルの後に、Threads のみ ON/OFF バッジを表示するセルを追加:

```tsx
                  <TableCell className="text-sm text-gray-500">
                    {account.posting_times.length > 0
                      ? account.posting_times.join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {account.platform === 'threads' ? (
                      <Badge
                        variant={
                          (account.auto_reply_config as { enabled?: boolean } | null)?.enabled
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {(account.auto_reply_config as { enabled?: boolean } | null)?.enabled
                          ? 'ON'
                          : 'OFF'}
                      </Badge>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </TableCell>
```

5. admin の削除ボタンセルの前（または登録日セルの後）に「設定」リンクを追加。既存の admin セルを次のように変更:

```tsx
                  {isAdmin && (
                    <TableCell className="text-right space-x-3">
                      <Link
                        href={`/accounts/${account.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        設定
                      </Link>
                      <DeleteAccountButton
                        accountId={account.id}
                        accountName={account.account_name}
                      />
                    </TableCell>
                  )}
```

6. 空状態の `colSpan` を列追加に合わせて +1 する（admin: 5→6、非admin: 4→5）:

```tsx
                <TableCell
                  colSpan={isAdmin ? 6 : 5}
                  className="text-center text-gray-400 text-sm py-8"
                >
                  アカウントがありません
                </TableCell>
```

- [ ] **Step 3: lint と本番ビルドで検証**

Run: `npm run lint && npm run build`
Expected: どちらもエラーなし（型エラー・未使用 import なし、`/accounts/[id]` ルートがビルドされる）

- [ ] **Step 4: 既存テストの回帰確認**

Run: `npx vitest run`
Expected: 全テスト PASS（Task 1 の 7 tests を含む既存全件）

- [ ] **Step 5: コミット**

```bash
git add "src/app/(dashboard)/accounts/[id]/page.tsx" "src/app/(dashboard)/accounts/page.tsx"
git commit -m "feat: add account settings page with auto-reply config UI"
```

---

## Self-Review

**Spec coverage:**
- ON/OFF 編集 → Task 2（Switch + enabled state）、Task 1（保存）✅
- 発火条件 tiers 最大4・時間/インプレ調整 → Task 2（tier rows, MAX_TIERS=4）、Task 1（hours→window_minutes 変換・1〜4検証）✅
- リプ文面 templates 編集 → Task 2（template rows）、Task 1（trim/空除去・1個以上検証）✅
- アカウントごとの設定ページ `/accounts/[id]` → Task 3 ✅
- admin のみ・company スコープ → Task 1（`updateAutoReplyConfig`）、Task 3（ページのガード）✅
- Threads 専用・X は注記のみ → Task 3（`platform === 'threads'` 分岐）✅
- 一覧の導線と ON/OFF 表示 → Task 3 ✅
- 保存形式が cron 既存型と一致 → Task 1（`{enabled, tiers:[{window_minutes,threshold}], templates}`）✅
- テスト（正常/バリデーション/権限/OFF保持）→ Task 1（7 tests）✅

**Placeholder scan:** プレースホルダなし。全ステップに実コードを記載。

**Type consistency:** `updateAutoReplyConfig(accountId, { enabled, tiers:[{hours,threshold}], templates })` の呼び出し（Task 2 フォーム）と定義（Task 1）が一致。保存形 `{window_minutes, threshold}` は cron の `AutoReplyTier` と一致。`AutoReplyForm` の props（`initial.tiers` は `{window_minutes, threshold}[]`）が Task 3 のページからの受け渡しと一致。
