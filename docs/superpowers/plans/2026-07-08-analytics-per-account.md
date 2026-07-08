# 分析ページのアカウント別対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/analytics`（分析メイン）と `/analytics/report`（印刷）を、アカウント別に集計・表示できるようにする。

**Architecture:** 既存の `ReportsList` + `/api/analytics/reports` と同型。新APIルート `/api/analytics/metrics?account_id=` を追加し、新クライアントコンポーネント `MetricsView` がボタンタブでアカウントを切り替えてカードとテーブルを再計算する。「最新メトリクスだけ残す」重複ロジックを純粋関数 `withLatestMetrics` に抽出し、API・両ページで共有する。印刷ページは `?account_id=` を受けて単一アカへ絞る。

**Tech Stack:** Next.js 16 (App Router, Server Components)、TypeScript、Supabase（RLSでスコープ）、Tailwind、Vitest + Testing Library (happy-dom)。

## Global Constraints

- Next.js は 16.2.3。破壊的変更ありのバージョン。ページ／ルートを書く前に `node_modules/next/dist/docs/` の該当ガイドを確認する。
- App Router のページで `searchParams` は `Promise<...>`。必ず `await` して読む。
- APIルートの認証は `supabase.auth.getUser()`＋RLS。未認証は 401、`account_id` 欠落は 400、Supabase エラーは 400（`src/app/api/analytics/reports/route.ts` に完全準拠）。
- Supabase クエリのアカウント絞り込みは `.eq('account_id', accountId)`。公開済みは `.eq('status', 'published')`、`.order('published_at', { ascending: false })`、`.limit(100)`。
- テストは `npm run test:run`（vitest run）。テストファイルは対象と同ディレクトリの `*.test.tsx`。
- コミットメッセージ末尾に必ず付与:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 1: `withLatestMetrics` 純粋関数の抽出

`page.tsx` と `report/page.tsx` に重複している「各投稿の最新メトリクスだけ残す」処理を、テスト可能な純粋関数に切り出す。API・両ページがこれを共有する。

**Files:**
- Create: `src/lib/analytics/latest-metrics.ts`
- Test: `src/lib/analytics/latest-metrics.test.ts`

**Interfaces:**
- Consumes: `Post`, `PostMetrics`（`@/types`）
- Produces:
  - `export type PostWithLatestMetrics = Post & { latest_metrics: PostMetrics | null }`
  - `export function withLatestMetrics<T extends { post_metrics: PostMetrics[] }>(posts: T[]): (T & { latest_metrics: PostMetrics | null })[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/analytics/latest-metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { withLatestMetrics } from './latest-metrics'

describe('withLatestMetrics', () => {
  it('各投稿で fetched_at が最新のメトリクスだけを残す', () => {
    const posts = [
      {
        id: 'p1',
        post_metrics: [
          { fetched_at: '2026-06-01T00:00:00Z', impressions: 100, likes: 1, reposts: 0, replies: 0 },
          { fetched_at: '2026-06-05T00:00:00Z', impressions: 500, likes: 9, reposts: 2, replies: 1 },
          { fetched_at: '2026-06-03T00:00:00Z', impressions: 300, likes: 4, reposts: 1, replies: 0 },
        ],
      },
    ]
    const result = withLatestMetrics(posts)
    expect(result[0].latest_metrics?.impressions).toBe(500)
  })

  it('メトリクスが無い投稿は latest_metrics を null にする', () => {
    const result = withLatestMetrics([{ id: 'p1', post_metrics: [] }])
    expect(result[0].latest_metrics).toBeNull()
  })

  it('元の post_metrics 配列を破壊的に並べ替えない', () => {
    const metrics = [
      { fetched_at: '2026-06-01T00:00:00Z', impressions: 100, likes: 1, reposts: 0, replies: 0 },
      { fetched_at: '2026-06-05T00:00:00Z', impressions: 500, likes: 9, reposts: 2, replies: 1 },
    ]
    const posts = [{ id: 'p1', post_metrics: metrics }]
    withLatestMetrics(posts)
    expect(metrics[0].fetched_at).toBe('2026-06-01T00:00:00Z')
  })

  it('id など post_metrics 以外のフィールドを保持する', () => {
    const result = withLatestMetrics([
      { id: 'p1', content: 'hello', post_metrics: [] },
    ])
    expect(result[0].id).toBe('p1')
    expect(result[0].content).toBe('hello')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:run -- src/lib/analytics/latest-metrics.test.ts`
Expected: FAIL（`Failed to resolve import './latest-metrics'` / モジュール未存在）

- [ ] **Step 3: 最小実装を書く**

`src/lib/analytics/latest-metrics.ts`:

```ts
import type { Post, PostMetrics } from '@/types'

export type PostWithLatestMetrics = Post & { latest_metrics: PostMetrics | null }

export function withLatestMetrics<T extends { post_metrics: PostMetrics[] }>(
  posts: T[]
): (T & { latest_metrics: PostMetrics | null })[] {
  return posts.map(post => {
    const metrics = [...post.post_metrics].sort(
      (a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime()
    )
    return { ...post, latest_metrics: metrics[0] ?? null }
  })
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:run -- src/lib/analytics/latest-metrics.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add src/lib/analytics/latest-metrics.ts src/lib/analytics/latest-metrics.test.ts
git commit -m "$(cat <<'EOF'
feat: 最新メトリクス抽出を純粋関数 withLatestMetrics に切り出す

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: メトリクス取得APIルート `/api/analytics/metrics`

選択アカウントの公開済み投稿を最新メトリクス付きで返すルートを追加する。`/api/analytics/reports/route.ts` と同じ認証・エラー形。

**Files:**
- Create: `src/app/api/analytics/metrics/route.ts`

**Interfaces:**
- Consumes: `withLatestMetrics`（Task 1）, `createClient`（`@/lib/supabase/server`）, `Post`, `PostMetrics`（`@/types`）
- Produces: `GET /api/analytics/metrics?account_id=<id>` → `200` で `PostWithLatestMetrics[]`（JSON配列）。未認証 `401`、`account_id` 欠落 `400`、DBエラー `400`。

- [ ] **Step 1: ルートを実装**

`src/app/api/analytics/metrics/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withLatestMetrics } from '@/lib/analytics/latest-metrics'
import type { Post, PostMetrics } from '@/types'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
    .eq('status', 'published')
    .eq('account_id', accountId)
    .order('published_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const posts = withLatestMetrics(
    (data ?? []) as (Post & { post_metrics: PostMetrics[] })[]
  )
  return NextResponse.json(posts)
}
```

- [ ] **Step 2: 型チェック（ビルド）で健全性を確認**

Run: `npm run lint`
Expected: エラーなし（新ファイルに関する警告なし）

- [ ] **Step 3: コミット**

```bash
git add src/app/api/analytics/metrics/route.ts
git commit -m "$(cat <<'EOF'
feat: アカウント別メトリクス取得APIルートを追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `MetricsView` クライアントコンポーネント

アカウントのボタンタブ、サマリーカード3枚、「レポートを印刷」リンク、`MetricsTable` を束ねる。タブ切り替えで API を叩き `posts` を差し替える。

**Files:**
- Create: `src/components/analytics/MetricsView.tsx`
- Test: `src/components/analytics/MetricsView.test.tsx`

**Interfaces:**
- Consumes: `MetricsTable`（`./MetricsTable`）, `PostWithLatestMetrics`（Task 1）
- Produces: `export function MetricsView({ accounts, initialPosts }: { accounts: { id: string; account_name: string; platform: string }[]; initialPosts: PostWithLatestMetrics[] })`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/analytics/MetricsView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MetricsView } from './MetricsView'
import type { PostWithLatestMetrics } from '@/lib/analytics/latest-metrics'

const accounts = [
  { id: 'a1', account_name: 'Dober', platform: 'threads' },
  { id: 'a2', account_name: 'Kentaro Nakano', platform: 'threads' },
]

function post(id: string, impressions: number, likes: number): PostWithLatestMetrics {
  return {
    id,
    account_id: 'a1',
    content: `post ${id}`,
    scheduled_date: '2026-06-01',
    status: 'published',
    source: 'ai',
    error_message: null,
    published_at: '2026-06-01T00:00:00Z',
    platform_post_id: null,
    created_at: '2026-06-01T00:00:00Z',
    latest_metrics: {
      id: `m-${id}`,
      post_id: id,
      fetched_at: '2026-06-01T01:00:00Z',
      impressions,
      likes,
      reposts: 0,
      replies: 0,
    },
  }
}

describe('MetricsView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('初期表示は initialPosts からカードを算出する', () => {
    render(<MetricsView accounts={accounts} initialPosts={[post('p1', 100, 5), post('p2', 400, 15)]} />)
    // 総投稿数 2 / 総表示 500 / 総いいね 20
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('500')).toBeTruthy()
    expect(screen.getByText('20')).toBeTruthy()
  })

  it('印刷リンクは選択中アカウントの account_id を含む', () => {
    render(<MetricsView accounts={accounts} initialPosts={[]} />)
    const link = screen.getByText('レポートを印刷').closest('a')
    expect(link?.getAttribute('href')).toBe('/analytics/report?account_id=a1')
  })

  it('別アカウントのタブを押すと API を叩き posts を差し替える', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [post('p9', 999, 1)],
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MetricsView accounts={accounts} initialPosts={[post('p1', 100, 5)]} />)
    fireEvent.click(screen.getByText('Kentaro Nakano'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/analytics/metrics?account_id=a2')
    })
    // 差し替え後: 総表示 999
    await waitFor(() => {
      expect(screen.getByText('999')).toBeTruthy()
    })
    // 印刷リンクも a2 に更新
    expect(screen.getByText('レポートを印刷').closest('a')?.getAttribute('href'))
      .toBe('/analytics/report?account_id=a2')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:run -- src/components/analytics/MetricsView.test.tsx`
Expected: FAIL（`Failed to resolve import './MetricsView'`）

- [ ] **Step 3: 最小実装を書く**

`src/components/analytics/MetricsView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { MetricsTable } from './MetricsTable'
import type { PostWithLatestMetrics } from '@/lib/analytics/latest-metrics'

interface AccountOption {
  id: string
  account_name: string
  platform: string
}

interface Props {
  accounts: AccountOption[]
  initialPosts: PostWithLatestMetrics[]
}

export function MetricsView({ accounts, initialPosts }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [posts, setPosts] = useState(initialPosts)

  const selectAccount = async (accountId: string) => {
    setSelectedAccountId(accountId)
    const res = await fetch(`/api/analytics/metrics?account_id=${accountId}`)
    setPosts(res.ok ? await res.json() : [])
  }

  const totalImpressions = posts.reduce((sum, p) => sum + (p.latest_metrics?.impressions ?? 0), 0)
  const totalLikes = posts.reduce((sum, p) => sum + (p.latest_metrics?.likes ?? 0), 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-4">
        <div className="flex gap-2 flex-wrap">
          {accounts.map(a => (
            <button
              key={a.id}
              onClick={() => selectAccount(a.id)}
              className={`px-4 py-2 rounded text-sm font-medium ${
                selectedAccountId === a.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {a.account_name}
            </button>
          ))}
        </div>
        <a
          href={`/analytics/report?account_id=${selectedAccountId}`}
          target="_blank"
          className="text-sm text-blue-600 hover:underline whitespace-nowrap"
        >
          レポートを印刷
        </a>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded shadow p-4">
          <p className="text-xs text-gray-500 mb-1">総投稿数</p>
          <p className="text-2xl font-bold">{posts.length}</p>
        </div>
        <div className="bg-white rounded shadow p-4">
          <p className="text-xs text-gray-500 mb-1">総表示回数</p>
          <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded shadow p-4">
          <p className="text-xs text-gray-500 mb-1">総いいね数</p>
          <p className="text-2xl font-bold">{totalLikes.toLocaleString()}</p>
        </div>
      </div>

      <MetricsTable posts={posts} />
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:run -- src/components/analytics/MetricsView.test.tsx`
Expected: PASS（3 tests）

- [ ] **Step 5: コミット**

```bash
git add src/components/analytics/MetricsView.tsx src/components/analytics/MetricsView.test.tsx
git commit -m "$(cat <<'EOF'
feat: アカウント別タブ切り替えの MetricsView を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/analytics/page.tsx` を `MetricsView` に置き換え

サーバーページを薄くし、accounts と先頭アカウントの初期投稿だけ取得して `MetricsView` に渡す。「レポートを印刷」リンクはヘッダーから外し（`MetricsView` 側に移設済み）、h1 と「分析レポート」リンクは残す。

**Files:**
- Modify: `src/app/(dashboard)/analytics/page.tsx`（全面置き換え）

**Interfaces:**
- Consumes: `MetricsView`（Task 3）, `withLatestMetrics` / `PostWithLatestMetrics`（Task 1）

- [ ] **Step 1: page.tsx を置き換える**

`src/app/(dashboard)/analytics/page.tsx` を以下で全置換:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MetricsView } from '@/components/analytics/MetricsView'
import { withLatestMetrics, type PostWithLatestMetrics } from '@/lib/analytics/latest-metrics'
import type { Post, PostMetrics } from '@/types'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const firstAccountId = accounts?.[0]?.id

  const { data: posts } = firstAccountId
    ? await supabase
        .from('posts')
        .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
        .eq('status', 'published')
        .eq('account_id', firstAccountId)
        .order('published_at', { ascending: false })
        .limit(100)
    : { data: [] }

  const initialPosts: PostWithLatestMetrics[] = withLatestMetrics(
    (posts ?? []) as (Post & { post_metrics: PostMetrics[] })[]
  )

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">分析</h1>
        <Link href="/analytics/reports" className="text-sm text-blue-600 hover:underline">
          分析レポート
        </Link>
      </div>

      {!accounts?.length ? (
        <p className="text-sm text-gray-500">アカウントがありません。</p>
      ) : (
        <MetricsView accounts={accounts} initialPosts={initialPosts} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint と型チェック**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 3: ビルドでページが通ることを確認**

Run: `npm run build`
Expected: ビルド成功（`/analytics` が出力される。型エラーなし）

- [ ] **Step 4: コミット**

```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 分析ページをアカウント別の MetricsView 表示に変更

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 印刷ページ `/analytics/report` をアカウント別にする

`?account_id=` を受けて単一アカウントに絞る。未指定時は先頭アカウントにフォールバック。ヘッダーにアカウント名を表示。重複ロジックは `withLatestMetrics` に置換。

**Files:**
- Modify: `src/app/(dashboard)/analytics/report/page.tsx`

**Interfaces:**
- Consumes: `withLatestMetrics`（Task 1）, `Post`, `PostMetrics`（`@/types`）
- `searchParams` は `Promise<{ account_id?: string }>`（Next 16）

- [ ] **Step 1: report/page.tsx を修正**

`src/app/(dashboard)/analytics/report/page.tsx` を以下で全置換:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Post, PostMetrics } from '@/types'
import { withLatestMetrics } from '@/lib/analytics/latest-metrics'
import { PrintButton } from './PrintButton'

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ account_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { account_id } = await searchParams

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const accountId = account_id ?? accounts?.[0]?.id

  if (!accountId) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <p className="text-sm text-gray-500">アカウントがありません。</p>
      </div>
    )
  }

  const accountName = accounts?.find(a => a.id === accountId)?.account_name ?? ''

  const { data: posts } = await supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
    .eq('status', 'published')
    .eq('account_id', accountId)
    .order('published_at', { ascending: false })
    .limit(100)

  const postsWithLatestMetrics = withLatestMetrics(
    (posts ?? []) as (Post & { post_metrics: PostMetrics[] })[]
  )

  const totalImpressions = postsWithLatestMetrics.reduce(
    (sum, p) => sum + (p.latest_metrics?.impressions ?? 0), 0
  )
  const totalLikes = postsWithLatestMetrics.reduce(
    (sum, p) => sum + (p.latest_metrics?.likes ?? 0), 0
  )

  const generatedAt = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto p-8">
        {/* ヘッダー */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold">
              SNS パフォーマンスレポート{accountName ? ` — ${accountName}` : ''}
            </h1>
            <p className="text-sm text-gray-500 mt-1">生成日: {generatedAt}</p>
          </div>
          <PrintButton />
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="border rounded p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">総投稿数</p>
            <p className="text-3xl font-bold">{postsWithLatestMetrics.length}</p>
          </div>
          <div className="border rounded p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">総表示回数</p>
            <p className="text-3xl font-bold">{totalImpressions.toLocaleString()}</p>
          </div>
          <div className="border rounded p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">総いいね数</p>
            <p className="text-3xl font-bold">{totalLikes.toLocaleString()}</p>
          </div>
        </div>

        {/* 投稿一覧 */}
        <h2 className="text-lg font-semibold mb-3">投稿別パフォーマンス</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">投稿内容</th>
              <th className="text-left py-2 pr-4 font-semibold">投稿日</th>
              <th className="text-right py-2 pr-4 font-semibold">表示</th>
              <th className="text-right py-2 pr-4 font-semibold">いいね</th>
              <th className="text-right py-2 pr-4 font-semibold">リポスト</th>
              <th className="text-right py-2 font-semibold">リプライ</th>
            </tr>
          </thead>
          <tbody>
            {postsWithLatestMetrics.map(post => (
              <tr key={post.id} className="border-b">
                <td className="py-2 pr-4 max-w-xs">
                  <p className="line-clamp-2">{post.content}</p>
                </td>
                <td className="py-2 pr-4 whitespace-nowrap text-gray-500">
                  {post.published_at
                    ? new Date(post.published_at).toLocaleDateString('ja-JP')
                    : '-'}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {post.latest_metrics?.impressions ?? '-'}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {post.latest_metrics?.likes ?? '-'}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {post.latest_metrics?.reposts ?? '-'}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {post.latest_metrics?.replies ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-gray-400 mt-8">
          ※ メトリクスは投稿後 1時間・24時間・7日後に自動取得した最新値を表示しています。
        </p>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Lint と型チェック**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 3: ビルドで両ページが通ることを確認**

Run: `npm run build`
Expected: ビルド成功（`/analytics`, `/analytics/report` が出力。型エラーなし）

- [ ] **Step 4: 全テスト実行で回帰がないことを確認**

Run: `npm run test:run`
Expected: 全 PASS（既存 `ReportDetail.test.tsx` 含む）

- [ ] **Step 5: コミット**

```bash
git add "src/app/(dashboard)/analytics/report/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 印刷レポートを account_id でアカウント別に絞る

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## 完了後

全タスク完了後、`superpowers:finishing-a-development-branch` に従い push と Pull Request 作成を行う（CLAUDE.md のワークフロー準拠）。実際のブラウザ確認（`/analytics` のタブ切り替え、`/analytics/report?account_id=` の表示）は `verify` で実施する。
