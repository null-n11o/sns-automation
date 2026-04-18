# Plan2: AI生成・メトリクス・ダッシュボード・MCPサーバー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI投稿生成・自己改善ループ・メトリクス収集・分析ダッシュボード・レポート生成・MCPサーバーを順番に実装し、SNS自動化プラットフォームを完成させる

**Architecture:** Claude API（claude-sonnet-4-6）で投稿生成とパフォーマンス分析を行い、Threads APIでメトリクスを収集し、Next.js App Router上のダッシュボードで可視化する。MCPサーバーはClaude Codeからポストを作成できるローカルインターフェースとして機能する。Task 1→2→3は依存関係あり（自己改善ループにはメトリクスが必要）。Task 4→5→6は独立して実施可。

**Tech Stack:** Next.js 16 App Router, @anthropic-ai/sdk, Threads Insights API, @modelcontextprotocol/sdk, Supabase, shadcn/ui, Tailwind CSS

---

## ファイル構成

### 新規作成
- `supabase/migrations/20260418000001_plan2_schema.sql` — published_at/platform_post_id列 + prompt_config_history/account_metrics テーブル
- `src/lib/claude.ts` — Anthropic SDKラッパー: generatePosts()
- `src/lib/threads-metrics.ts` — Threads Insights API: fetchThreadsPostMetrics()
- `src/lib/self-improve.ts` — analyzeAndImprove() でメトリクス分析→プロンプト更新
- `src/app/api/generate/route.ts` — POST /api/generate
- `src/app/api/metrics/fetch/route.ts` — GET /api/metrics/fetch (Cron)
- `src/app/(dashboard)/analytics/page.tsx` — 分析ダッシュボード
- `src/app/(dashboard)/analytics/report/page.tsx` — 印刷対応レポートページ
- `src/components/analytics/MetricsTable.tsx` — メトリクス表示テーブル
- `packages/mcp-server/package.json`
- `packages/mcp-server/tsconfig.json`
- `packages/mcp-server/src/index.ts`
- `src/test/lib/claude.test.ts`
- `src/test/lib/threads-metrics.test.ts`
- `src/test/lib/self-improve.test.ts`
- `src/test/api/generate.test.ts`
- `src/test/api/metrics-fetch.test.ts`

### 修正
- `src/types/index.ts` — AccountMetrics, PromptConfigHistory型追加
- `src/components/posts/PostsTable.tsx` —「1週間分を生成」ボタン追加
- `src/components/dashboard/sidebar.tsx` — 分析リンク追加
- `src/app/api/publish/route.ts` — published_at / platform_post_id を保存
- `src/app/api/cron/publish/route.ts` — published_at / platform_post_id を保存
- `vercel.json` — metrics fetch Cron追加
- `package.json` — @anthropic-ai/sdk 追加

---

## Task 1: AI投稿生成（Claude API連携）

**Files:**
- Install: `@anthropic-ai/sdk`
- Create: `supabase/migrations/20260418000001_plan2_schema.sql`
- Modify: `src/types/index.ts`
- Create: `src/lib/claude.ts`
- Create: `src/app/api/generate/route.ts`
- Modify: `src/components/posts/PostsTable.tsx`
- Modify: `src/app/api/publish/route.ts`
- Modify: `src/app/api/cron/publish/route.ts`
- Test: `src/test/lib/claude.test.ts`
- Test: `src/test/api/generate.test.ts`

- [ ] **Step 1: ブランチ作成**

```bash
git checkout -b feat/plan2-task1-ai-generate
```

- [ ] **Step 2: @anthropic-ai/sdk をインストール**

```bash
npm install @anthropic-ai/sdk
```

Expected: package.json の dependencies に `"@anthropic-ai/sdk"` が追加される

- [ ] **Step 3: DBマイグレーションを作成**

`supabase/migrations/20260418000001_plan2_schema.sql` を新規作成:

```sql
-- =============================================================================
-- Plan2 Schema Additions
-- =============================================================================

-- posts: published_at（投稿完了時刻）と platform_post_id（SNS側のID）を追加
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS published_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_post_id TEXT;

-- prompt_config_history: プロンプト変更履歴
CREATE TABLE IF NOT EXISTS prompt_config_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  system_prompt  TEXT        NOT NULL,
  reference_data TEXT        NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by     TEXT        NOT NULL CHECK (changed_by IN ('ai', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_config_history_account
  ON prompt_config_history(account_id);

-- account_metrics: フォロワー数推移
CREATE TABLE IF NOT EXISTS account_metrics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  followers_count INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_account_metrics_account
  ON account_metrics(account_id);

-- RLS: prompt_config_history
ALTER TABLE prompt_config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_config_history: select own company"
  ON prompt_config_history FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "prompt_config_history: insert own company"
  ON prompt_config_history FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

-- RLS: account_metrics
ALTER TABLE account_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_metrics: select own company"
  ON account_metrics FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "account_metrics: insert own company"
  ON account_metrics FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );
```

- [ ] **Step 4: マイグレーションを Supabase に適用**

Supabase MCPツール（`mcp__supabase__apply_migration`）でマイグレーションを適用する。
project_id: `fdmhkjiqsrzktfmbqlxg`

- [ ] **Step 5: 型定義を追加**

`src/types/index.ts` に以下を追記:

```typescript
export interface PromptConfigHistory {
  id: string
  account_id: string
  system_prompt: string
  reference_data: string
  changed_at: string
  changed_by: 'ai' | 'manual'
}

export interface AccountMetrics {
  id: string
  account_id: string
  fetched_at: string
  followers_count: number
}
```

また `Post` インターフェースに2フィールドを追加:

```typescript
export interface Post {
  id: string
  account_id: string
  content: string
  scheduled_date: string
  status: PostStatus
  source: PostSource
  error_message: string | null
  published_at: string | null      // 追加
  platform_post_id: string | null  // 追加
  created_at: string
}
```

- [ ] **Step 6: claude.ts のテストを作成**

`src/test/lib/claude.test.ts` を新規作成:

```typescript
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate }
  },
}))

import { generatePosts } from '@/lib/claude'

describe('generatePosts', () => {
  it('Claude のレスポンスを投稿配列にパースする', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '投稿1の本文\n---\n投稿2の本文\n---\n投稿3の本文' }],
    })

    const result = await generatePosts({
      systemPrompt: 'SNSマネージャーです',
      referenceData: '',
      platform: 'threads',
      weekDates: ['2026-04-19', '2026-04-20', '2026-04-21'],
    })

    expect(result).toEqual(['投稿1の本文', '投稿2の本文', '投稿3の本文'])
  })

  it('weekDates の数に出力を制限する', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Post 1\n---\nPost 2\n---\nPost 3\n---\nPost 4' }],
    })

    const result = await generatePosts({
      systemPrompt: 'test',
      referenceData: '',
      platform: 'x',
      weekDates: ['2026-04-19', '2026-04-20'],
    })

    expect(result).toHaveLength(2)
  })

  it('プロンプトキャッシュ用に cache_control を付与してAPIを呼ぶ', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Post 1' }],
    })

    await generatePosts({
      systemPrompt: 'test',
      referenceData: 'ref',
      platform: 'threads',
      weekDates: ['2026-04-19'],
    })

    const call = mockCreate.mock.calls[0][0]
    expect(call.system[0]).toMatchObject({ cache_control: { type: 'ephemeral' } })
  })
})
```

- [ ] **Step 7: テストが失敗することを確認**

```bash
npx vitest run src/test/lib/claude.test.ts
```

Expected: FAIL（`@/lib/claude` が存在しないため）

- [ ] **Step 8: src/lib/claude.ts を実装**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { Platform } from '@/types'

const client = new Anthropic()

export async function generatePosts({
  systemPrompt,
  referenceData,
  platform,
  weekDates,
}: {
  systemPrompt: string
  referenceData: string
  platform: Platform
  weekDates: string[]
}): Promise<string[]> {
  const platformLabel = platform === 'threads' ? 'Threads' : 'X (Twitter)'
  const charLimit = platform === 'threads' ? 500 : 280

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: `${systemPrompt}\n\n参考データ:\n${referenceData}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${platformLabel}用の投稿を${weekDates.length}件生成してください。\n投稿予定日: ${weekDates.join(', ')}\n文字数制限: ${charLimit}文字以内\n\n各投稿を「---」のみの行で区切り、投稿本文のみを出力してください。番号や日付のプレフィックスは不要です。`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text.split(/\n---\n/).map(s => s.trim()).filter(Boolean).slice(0, weekDates.length)
}
```

- [ ] **Step 9: テストをパスすることを確認**

```bash
npx vitest run src/test/lib/claude.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 10: generate ルートのテストを作成**

`src/test/api/generate.test.ts` を新規作成:

```typescript
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const { mockGeneratePosts, mockCreateClient } = vi.hoisted(() => ({
  mockGeneratePosts: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/claude', () => ({ generatePosts: mockGeneratePosts }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { POST } from '@/app/api/generate/route'

function makeSupabaseMock({
  user = { id: 'user-1' },
  account = { id: 'acc-1', platform: 'threads', account_name: 'TestAccount' },
  promptConfig = null as object | null,
  insertedPosts = [{ id: 'post-1' }] as object[],
} = {}) {
  const insertSelect = vi.fn().mockResolvedValue({ data: insertedPosts, error: null })
  const insert = vi.fn().mockReturnValue({ select: insertSelect })
  const singleConfig = vi.fn().mockResolvedValue({ data: promptConfig, error: null })
  const limitConfig = vi.fn().mockReturnValue({ single: singleConfig })
  const orderConfig = vi.fn().mockReturnValue({ limit: limitConfig })
  const eqConfig = vi.fn().mockReturnValue({ order: orderConfig })
  const singleAccount = vi.fn().mockResolvedValue({ data: account, error: null })
  const eqAccount = vi.fn().mockReturnValue({ single: singleAccount })
  const selectAccount = vi.fn().mockReturnValue({ eq: eqAccount })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'accounts') return { select: selectAccount }
    if (table === 'prompt_configs') return { select: vi.fn().mockReturnValue({ eq: eqConfig }) }
    if (table === 'posts') return { insert }
    return {}
  })

  const getUser = vi.fn().mockResolvedValue({ data: { user } })
  mockCreateClient.mockResolvedValue({ auth: { getUser }, from })
  return { from, insert }
}

describe('POST /api/generate', () => {
  it('7件の下書き投稿を生成して保存する', async () => {
    const { insert } = makeSupabaseMock()
    mockGeneratePosts.mockResolvedValue([
      '投稿1', '投稿2', '投稿3', '投稿4', '投稿5', '投稿6', '投稿7',
    ])

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: 'acc-1' }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.count).toBe(1) // insertedPosts mock returns 1 item

    const insertedRows = insert.mock.calls[0][0] as Array<{ source: string; status: string }>
    expect(insertedRows).toHaveLength(7)
    expect(insertedRows[0].source).toBe('ai')
    expect(insertedRows[0].status).toBe('draft')
  })

  it('account_id がない場合 400 を返す', async () => {
    makeSupabaseMock()
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('未認証の場合 401 を返す', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn(),
    })
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: 'acc-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 11: テストが失敗することを確認**

```bash
npx vitest run src/test/api/generate.test.ts
```

Expected: FAIL（`@/app/api/generate/route` が存在しないため）

- [ ] **Step 12: src/app/api/generate/route.ts を実装**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generatePosts } from '@/lib/claude'
import type { Platform } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { account_id } = body
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const { data: account } = await supabase
    .from('accounts')
    .select('id, platform, account_name')
    .eq('id', account_id)
    .single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { data: promptConfig } = await supabase
    .from('prompt_configs')
    .select('system_prompt, reference_data')
    .eq('account_id', account_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = promptConfig ?? {
    system_prompt: `あなたは${account.account_name}の${account.platform === 'threads' ? 'Threads' : 'X'}アカウントの運用担当者です。エンゲージメントの高い投稿を生成してください。`,
    reference_data: '',
  }

  const weekDates: string[] = []
  const base = new Date()
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    weekDates.push(d.toISOString().slice(0, 10))
  }

  const contents = await generatePosts({
    systemPrompt: config.system_prompt,
    referenceData: config.reference_data,
    platform: account.platform as Platform,
    weekDates,
  })

  const postsToInsert = contents.map((content, i) => ({
    account_id,
    content,
    scheduled_date: weekDates[i],
    status: 'draft' as const,
    source: 'ai' as const,
  }))

  const { data: posts, error } = await supabase
    .from('posts')
    .insert(postsToInsert)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ posts, count: posts?.length ?? 0 })
}
```

- [ ] **Step 13: テストをパスすることを確認**

```bash
npx vitest run src/test/api/generate.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 14: publish ルートを修正して published_at + platform_post_id を保存**

`src/app/api/publish/route.ts` の成功時更新部分を変更:

```typescript
// 変更前:
await supabase.from('posts').update({ status: 'published' }).eq('id', post_id)

// 変更後:
const platformPostId = await publishPost({ ... })
await supabase
  .from('posts')
  .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId })
  .eq('id', post_id)
```

ファイル全体（`src/app/api/publish/route.ts`）:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishPost } from '@/lib/publish'
import type { Platform } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { post_id } = await request.json()

  const { data: post } = await supabase
    .from('posts')
    .select('*, accounts(*)')
    .eq('id', post_id)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const account = post.accounts as Record<string, string | null>

  try {
    const platformPostId = await publishPost({
      platform: account.platform as Platform,
      content: post.content,
      access_token: account.access_token,
      access_token_secret: account.access_token_secret,
      api_key: account.api_key,
      api_secret: account.api_secret,
      platform_user_id: account.platform_user_id,
    })

    await supabase
      .from('posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        platform_post_id: platformPostId,
      })
      .eq('id', post_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase.from('posts').update({ status: 'failed', error_message: message }).eq('id', post_id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 15: cron/publish ルートも同様に修正**

`src/app/api/cron/publish/route.ts` の各ポストの成功時更新:

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishPost } from '@/lib/publish'
import type { Platform } from '@/types'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: posts } = await supabase
    .from('posts')
    .select('*, accounts(*)')
    .eq('status', 'ready')
    .lte('scheduled_date', today)

  if (!posts?.length) {
    return NextResponse.json({ published: 0 })
  }

  const results = await Promise.allSettled(
    posts.map(async post => {
      const account = post.accounts as Record<string, string | null>
      try {
        const platformPostId = await publishPost({
          platform: account.platform as Platform,
          content: post.content,
          access_token: account.access_token,
          access_token_secret: account.access_token_secret,
          api_key: account.api_key,
          api_secret: account.api_secret,
          platform_user_id: account.platform_user_id,
        })

        await supabase
          .from('posts')
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
            platform_post_id: platformPostId,
          })
          .eq('id', post.id)

        return { id: post.id, ok: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await supabase.from('posts').update({ status: 'failed', error_message: message }).eq('id', post.id)
        return { id: post.id, ok: false, error: message }
      }
    })
  )

  const published = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length
  return NextResponse.json({ published, total: posts.length })
}
```

- [ ] **Step 16: PostsTable に「1週間分を生成」ボタンを追加**

`src/components/posts/PostsTable.tsx` を修正。`showCreateModal` state の後に追加:

```typescript
// state追加（既存の useState の後に）
const [generating, setGenerating] = useState(false)

// 関数追加（publishNow の後に）
async function generateWeeklyPosts() {
  setGenerating(true)
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: selectedAccountId }),
  })
  const data = await res.json()
  if (res.ok) {
    await refreshPosts()
  } else {
    alert(`生成エラー: ${data.error}`)
  }
  setGenerating(false)
}
```

アクションエリアのJSXを変更（既存の `<Button onClick={() => setShowCreateModal(true)}>+ 新規投稿</Button>` の隣に追加）:

```tsx
{/* アクション */}
<div className="flex justify-between items-center mb-4">
  <p className="text-sm text-gray-500">{filteredPosts.length} 件</p>
  <div className="flex gap-2">
    <Button
      variant="outline"
      onClick={generateWeeklyPosts}
      disabled={generating}
    >
      {generating ? '生成中...' : '1週間分を生成'}
    </Button>
    <Button onClick={() => setShowCreateModal(true)}>+ 新規投稿</Button>
  </div>
</div>
```

- [ ] **Step 17: 全テストをパスすることを確認**

```bash
npx vitest run
```

Expected: 全テスト PASS

- [ ] **Step 18: TypeScriptエラーがないことを確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 19: コミット & プッシュ & PR**

```bash
git add -A
git commit -m "feat: Task1 - AI投稿生成（Claude API連携）"
git push -u origin feat/plan2-task1-ai-generate
```

GitHub で PR を作成し、main にマージする。

---

## Task 2: メトリクス収集Cron（Threads Insights API）

**Files:**
- Create: `src/lib/threads-metrics.ts`
- Create: `src/app/api/metrics/fetch/route.ts`
- Modify: `vercel.json`
- Test: `src/test/lib/threads-metrics.test.ts`
- Test: `src/test/api/metrics-fetch.test.ts`

- [ ] **Step 1: ブランチ作成**

```bash
git checkout main && git pull && git checkout -b feat/plan2-task2-metrics
```

- [ ] **Step 2: threads-metrics.ts のテストを作成**

`src/test/lib/threads-metrics.test.ts` を新規作成:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchThreadsPostMetrics } from '@/lib/threads-metrics'

describe('fetchThreadsPostMetrics', () => {
  beforeEach(() => vi.resetAllMocks())

  it('Threads Insights APIからメトリクスを取得してマッピングする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { name: 'views', values: [{ value: 1234 }] },
          { name: 'likes', values: [{ value: 56 }] },
          { name: 'replies', values: [{ value: 7 }] },
          { name: 'reposts', values: [{ value: 8 }] },
          { name: 'quotes', values: [{ value: 2 }] },
        ],
      }),
    }))

    const result = await fetchThreadsPostMetrics({
      mediaId: 'media-123',
      accessToken: 'token-abc',
    })

    expect(result).toEqual({
      impressions: 1234,
      likes: 56,
      replies: 7,
      reposts: 8,
    })

    const [calledUrl] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(calledUrl).toContain('media-123')
    expect(calledUrl).toContain('insights')
    expect(calledUrl).toContain('access_token=token-abc')
  })

  it('APIエラー時に例外を投げる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Invalid token' } }),
    }))

    await expect(fetchThreadsPostMetrics({
      mediaId: 'media-123',
      accessToken: 'bad-token',
    })).rejects.toThrow('Threads Insights API error')
  })
})
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
npx vitest run src/test/lib/threads-metrics.test.ts
```

Expected: FAIL

- [ ] **Step 4: src/lib/threads-metrics.ts を実装**

```typescript
const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsMetrics {
  impressions: number
  likes: number
  replies: number
  reposts: number
}

export async function fetchThreadsPostMetrics({
  mediaId,
  accessToken,
}: {
  mediaId: string
  accessToken: string
}): Promise<ThreadsMetrics> {
  const url = new URL(`${THREADS_API_BASE}/${mediaId}/insights`)
  url.searchParams.set('metric', 'views,likes,replies,reposts,quotes')
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString())
  const data = await res.json()

  if (!res.ok) {
    throw new Error(`Threads Insights API error: ${data.error?.message ?? 'Unknown error'}`)
  }

  const getValue = (name: string): number => {
    const item = (data.data as Array<{ name: string; values: Array<{ value: number }> }>)
      .find(d => d.name === name)
    return item?.values[0]?.value ?? 0
  }

  return {
    impressions: getValue('views'),
    likes: getValue('likes'),
    replies: getValue('replies'),
    reposts: getValue('reposts'),
  }
}
```

- [ ] **Step 5: テストをパスすることを確認**

```bash
npx vitest run src/test/lib/threads-metrics.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: metrics/fetch ルートのテストを作成**

`src/test/api/metrics-fetch.test.ts` を新規作成:

```typescript
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const { mockFetchMetrics, mockCreateServiceClient } = vi.hoisted(() => ({
  mockFetchMetrics: vi.fn(),
  mockCreateServiceClient: vi.fn(),
}))

vi.mock('@/lib/threads-metrics', () => ({ fetchThreadsPostMetrics: mockFetchMetrics }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mockCreateServiceClient }))
vi.mock('@/lib/crypto', () => ({ decrypt: (s: string) => s }))

import { GET } from '@/app/api/metrics/fetch/route'

function makeRequest(secret = 'test-secret') {
  return new Request('http://localhost/api/metrics/fetch', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

function makeSupabaseMock(publishedPosts: object[]) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const selectPosts = vi.fn().mockResolvedValue({ data: publishedPosts })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'posts') return { select: selectPosts }
    if (table === 'post_metrics') return { insert }
    return {}
  })
  mockCreateServiceClient.mockResolvedValue({ from })
  return { insert }
}

describe('GET /api/metrics/fetch', () => {
  beforeAll(() => {
    process.env.CRON_SECRET = 'test-secret'
  })

  it('CRON_SECRET が一致しない場合 401 を返す', async () => {
    const res = await GET(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('メトリクス取得対象ポストがない場合 fetched: 0 を返す', async () => {
    makeSupabaseMock([])
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.fetched).toBe(0)
  })

  it('メトリクスを取得してDBに保存する', async () => {
    const now = new Date()
    const publishedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() // 2時間前

    const { insert } = makeSupabaseMock([
      {
        id: 'post-1',
        platform_post_id: 'media-123',
        published_at: publishedAt,
        accounts: { platform: 'threads', access_token: 'token', platform_user_id: 'uid' },
        post_metrics: [],
      },
    ])

    mockFetchMetrics.mockResolvedValue({ impressions: 100, likes: 10, replies: 2, reposts: 3 })

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.fetched).toBe(1)
    expect(insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ post_id: 'post-1', impressions: 100, likes: 10 }),
      ])
    )
  })
})
```

- [ ] **Step 7: テストが失敗することを確認**

```bash
npx vitest run src/test/api/metrics-fetch.test.ts
```

Expected: FAIL

- [ ] **Step 8: src/app/api/metrics/fetch/route.ts を実装**

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchThreadsPostMetrics } from '@/lib/threads-metrics'
import { decrypt } from '@/lib/crypto'

// 各マイルストーン（ミリ秒）: 1h, 24h, 7d
const MILESTONES_MS = [
  1 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // published_at と platform_post_id がある Threads 投稿を取得
  const { data: posts } = await supabase
    .from('posts')
    .select('id, platform_post_id, published_at, accounts(platform, access_token, platform_user_id), post_metrics(fetched_at)')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .not('platform_post_id', 'is', null)

  if (!posts?.length) return NextResponse.json({ fetched: 0 })

  const now = Date.now()
  const toFetch: Array<{ postId: string; mediaId: string; accessToken: string }> = []

  for (const post of posts) {
    const account = post.accounts as { platform: string; access_token: string | null; platform_user_id: string | null }
    if (account.platform !== 'threads' || !account.access_token) continue

    const publishedAt = new Date(post.published_at as string).getTime()
    const elapsed = now - publishedAt
    const existingCount = Array.isArray(post.post_metrics) ? post.post_metrics.length : 0

    // 次のマイルストーンに達していれば取得
    const nextMilestone = MILESTONES_MS[existingCount]
    if (nextMilestone !== undefined && elapsed >= nextMilestone) {
      toFetch.push({
        postId: post.id,
        mediaId: post.platform_post_id as string,
        accessToken: decrypt(account.access_token),
      })
    }
  }

  if (!toFetch.length) return NextResponse.json({ fetched: 0 })

  const results = await Promise.allSettled(
    toFetch.map(async ({ postId, mediaId, accessToken }) => {
      const metrics = await fetchThreadsPostMetrics({ mediaId, accessToken })
      return supabase.from('post_metrics').insert([{ post_id: postId, ...metrics }])
    })
  )

  const fetched = results.filter(r => r.status === 'fulfilled').length
  return NextResponse.json({ fetched, total: toFetch.length })
}
```

- [ ] **Step 9: テストをパスすることを確認**

```bash
npx vitest run src/test/api/metrics-fetch.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 10: vercel.json にメトリクス取得Cronを追加**

```json
{
  "crons": [
    {
      "path": "/api/cron/publish",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/metrics/fetch",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 11: 全テスト & TypeScriptチェック**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: 全テスト PASS、TypeScriptエラーなし

- [ ] **Step 12: コミット & プッシュ & PR**

```bash
git add -A
git commit -m "feat: Task2 - メトリクス収集Cron（Threads Insights API）"
git push -u origin feat/plan2-task2-metrics
```

---

## Task 3: 自己改善ループ（メトリクス分析 → プロンプト自動更新）

**Files:**
- Create: `src/lib/self-improve.ts`
- Modify: `src/app/api/generate/route.ts`
- Test: `src/test/lib/self-improve.test.ts`

前提: Task 1（generate route）と Task 2（メトリクス収集）が完了していること

- [ ] **Step 1: ブランチ作成**

```bash
git checkout main && git pull && git checkout -b feat/plan2-task3-self-improve
```

- [ ] **Step 2: self-improve.ts のテストを作成**

`src/test/lib/self-improve.test.ts` を新規作成:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate }
  },
}))

import { analyzeAndImprove } from '@/lib/self-improve'

// supabase.from(...) を呼ぶのでオブジェクト全体をモック化して渡す
function makeSupabaseMock({
  posts = [] as object[],
} = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const insertHistory = vi.fn().mockResolvedValue({ error: null })
  const postsSelect = vi.fn().mockResolvedValue({ data: posts })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'posts') return { select: postsSelect }
    if (table === 'prompt_configs') return { upsert }
    if (table === 'prompt_config_history') return { insert: insertHistory }
    return {}
  })
  // analyzeAndImprove(accountId, supabase) の supabase は { from } を持つオブジェクト
  return { from, upsert, insertHistory }
}

describe('analyzeAndImprove', () => {
  beforeEach(() => vi.clearAllMocks())

  it('メトリクスがある投稿が3件未満の場合はスキップしてnullを返す', async () => {
    const mock = makeSupabaseMock({ posts: [] })
    const result = await analyzeAndImprove('acc-1', mock as never)
    expect(result).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('分析結果でprompt_configsをupsertし改善されたconfigを返す', async () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      id: `post-${i}`,
      content: `投稿${i}の本文`,
      post_metrics: [{ impressions: i * 100, likes: i * 10, reposts: i, replies: i }],
    }))
    const mock = makeSupabaseMock({ posts })

    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '---SYSTEM_PROMPT---\n改善されたシステムプロンプト\n---REFERENCE_DATA---\n成功した投稿のパターン',
      }],
    })

    const result = await analyzeAndImprove('acc-1', mock as never)

    expect(result).not.toBeNull()
    expect(result?.system_prompt).toBe('改善されたシステムプロンプト')
    expect(result?.reference_data).toBe('成功した投稿のパターン')
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 'acc-1', updated_by: 'ai' }),
      expect.objectContaining({ onConflict: 'account_id' })
    )
    expect(mock.insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 'acc-1', changed_by: 'ai' })
    )
  })
})
```

> **Note:** テストはsupabaseをモックで渡す設計で書く。以下の実装もそれに合わせる。

- [ ] **Step 3: テストが失敗することを確認**

```bash
npx vitest run src/test/lib/self-improve.test.ts
```

Expected: FAIL

- [ ] **Step 4: src/lib/self-improve.ts を実装**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const client = new Anthropic()

interface ImprovedConfig {
  system_prompt: string
  reference_data: string
}

// 投稿数が少なく改善できない場合はnullを返す
export async function analyzeAndImprove(
  accountId: string,
  supabase: SupabaseClient
): Promise<ImprovedConfig | null> {
  // 過去30日のpublished投稿とメトリクスを取得
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: posts } = await supabase
    .from('posts')
    .select('id, content, post_metrics(impressions, likes, reposts, replies)')
    .eq('account_id', accountId)
    .eq('status', 'published')
    .gte('published_at', thirtyDaysAgo.toISOString())

  // メトリクスがある投稿が3件未満の場合はスキップ
  const postsWithMetrics = (posts ?? []).filter(
    (p: { post_metrics: unknown[] }) => p.post_metrics?.length > 0
  )
  if (postsWithMetrics.length < 3) return null

  // 分析用テキスト作成
  const postsText = postsWithMetrics
    .map((p: { content: string; post_metrics: Array<{ impressions: number; likes: number; reposts: number; replies: number }> }) => {
      const m = p.post_metrics[p.post_metrics.length - 1]
      return `投稿: ${p.content}\nインプレッション: ${m.impressions} / いいね: ${m.likes} / リポスト: ${m.reposts} / リプライ: ${m.replies}`
    })
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: 'あなたはSNSコンテンツ戦略アナリストです。投稿のパフォーマンスデータを分析し、今後の投稿改善のためのシステムプロンプトと参考データを生成してください。',
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `以下の投稿データを分析して、今後の投稿品質を高めるための改善案を提案してください。\n\n${postsText}\n\n以下のフォーマットで回答してください:\n---SYSTEM_PROMPT---\n（改善されたシステムプロンプト）\n---REFERENCE_DATA---\n（参考データ・成功した投稿のパターン）`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const systemMatch = text.match(/---SYSTEM_PROMPT---\n([\s\S]*?)---REFERENCE_DATA---/)
  const referenceMatch = text.match(/---REFERENCE_DATA---\n([\s\S]*)$/)

  if (!systemMatch || !referenceMatch) return null

  const improved: ImprovedConfig = {
    system_prompt: systemMatch[1].trim(),
    reference_data: referenceMatch[1].trim(),
  }

  // prompt_configs を upsert（account_idが同じなら更新）
  await supabase.from('prompt_configs').upsert({
    account_id: accountId,
    system_prompt: improved.system_prompt,
    reference_data: improved.reference_data,
    updated_at: new Date().toISOString(),
    updated_by: 'ai',
  }, { onConflict: 'account_id' })

  // 履歴を保存
  await supabase.from('prompt_config_history').insert({
    account_id: accountId,
    system_prompt: improved.system_prompt,
    reference_data: improved.reference_data,
    changed_by: 'ai',
  })

  return improved
}
```

- [ ] **Step 5: prompt_configs に UNIQUE 制約を追加するマイグレーション**

`supabase/migrations/20260418000002_prompt_config_unique.sql` を新規作成:

```sql
-- prompt_configs: account_id に UNIQUE 制約（upsert用）
ALTER TABLE prompt_configs
  ADD CONSTRAINT prompt_configs_account_id_key UNIQUE (account_id);
```

Supabase MCPツールで適用する（project_id: `fdmhkjiqsrzktfmbqlxg`）。

- [ ] **Step 6: generate ルートに自己改善ループを組み込む**

`src/app/api/generate/route.ts` に import と呼び出しを追加:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generatePosts } from '@/lib/claude'
import { analyzeAndImprove } from '@/lib/self-improve'
import type { Platform } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { account_id, skip_self_improve = false } = body
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const { data: account } = await supabase
    .from('accounts')
    .select('id, platform, account_name')
    .eq('id', account_id)
    .single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // 自己改善ループ（メトリクスが十分あれば実行）
  if (!skip_self_improve) {
    await analyzeAndImprove(account_id, supabase)
  }

  // 最新の prompt_config を取得（自己改善後に更新されている場合もある）
  const { data: promptConfig } = await supabase
    .from('prompt_configs')
    .select('system_prompt, reference_data')
    .eq('account_id', account_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = promptConfig ?? {
    system_prompt: `あなたは${account.account_name}の${account.platform === 'threads' ? 'Threads' : 'X'}アカウントの運用担当者です。エンゲージメントの高い投稿を生成してください。`,
    reference_data: '',
  }

  const weekDates: string[] = []
  const base = new Date()
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    weekDates.push(d.toISOString().slice(0, 10))
  }

  const contents = await generatePosts({
    systemPrompt: config.system_prompt,
    referenceData: config.reference_data,
    platform: account.platform as Platform,
    weekDates,
  })

  const postsToInsert = contents.map((content, i) => ({
    account_id,
    content,
    scheduled_date: weekDates[i],
    status: 'draft' as const,
    source: 'ai' as const,
  }))

  const { data: posts, error } = await supabase
    .from('posts')
    .insert(postsToInsert)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ posts, count: posts?.length ?? 0 })
}
```

- [ ] **Step 7: generate テストに self-improve モックを追加**

`src/test/api/generate.test.ts` のモック宣言部分を更新する。`vi.hoisted` に `mockAnalyzeAndImprove` を追加し、`vi.mock` でモックする:

```typescript
const { mockGeneratePosts, mockCreateClient, mockAnalyzeAndImprove } = vi.hoisted(() => ({
  mockGeneratePosts: vi.fn(),
  mockCreateClient: vi.fn(),
  mockAnalyzeAndImprove: vi.fn().mockResolvedValue(null), // 通常はnullを返す（スキップ）
}))

vi.mock('@/lib/claude', () => ({ generatePosts: mockGeneratePosts }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/self-improve', () => ({ analyzeAndImprove: mockAnalyzeAndImprove }))
```

- [ ] **Step 8: テストをパスすることを確認**

```bash
npx vitest run src/test/lib/self-improve.test.ts
npx vitest run src/test/api/generate.test.ts
```

Expected: 全テスト PASS

- [ ] **Step 9: 全テスト & TypeScriptチェック**

```bash
npx vitest run && npx tsc --noEmit
```

- [ ] **Step 10: コミット & プッシュ & PR**

```bash
git add -A
git commit -m "feat: Task3 - 自己改善ループ（メトリクス分析→プロンプト自動更新）"
git push -u origin feat/plan2-task3-self-improve
```

---

## Task 4: 分析ダッシュボード

**Files:**
- Create: `src/app/(dashboard)/analytics/page.tsx`
- Create: `src/components/analytics/MetricsTable.tsx`
- Modify: `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: ブランチ作成**

```bash
git checkout main && git pull && git checkout -b feat/plan2-task4-analytics
```

- [ ] **Step 2: サイドバーに分析リンクを追加**

`src/components/dashboard/sidebar.tsx` の `navItems` 配列を修正:

```typescript
const navItems = [
  { href: '/posts', label: '投稿管理' },
  { href: '/accounts', label: 'アカウント' },
  { href: '/analytics', label: '分析' },
]
```

- [ ] **Step 3: MetricsTable コンポーネントを作成**

`src/components/analytics/MetricsTable.tsx` を新規作成:

```tsx
import type { Post, PostMetrics } from '@/types'

interface PostWithMetrics extends Post {
  latest_metrics: PostMetrics | null
  account_name?: string
}

interface Props {
  posts: PostWithMetrics[]
}

export function MetricsTable({ posts }: Props) {
  if (!posts.length) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        メトリクスデータがありません。投稿が公開されるとここに表示されます。
      </p>
    )
  }

  return (
    <div className="bg-white rounded shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left p-3 font-medium">投稿内容</th>
            <th className="text-left p-3 font-medium">投稿日</th>
            <th className="text-right p-3 font-medium">表示</th>
            <th className="text-right p-3 font-medium">いいね</th>
            <th className="text-right p-3 font-medium">リポスト</th>
            <th className="text-right p-3 font-medium">リプライ</th>
          </tr>
        </thead>
        <tbody>
          {posts.map(post => (
            <tr key={post.id} className="border-t hover:bg-gray-50">
              <td className="p-3 max-w-xs">
                <p className="line-clamp-2 text-gray-800">{post.content}</p>
              </td>
              <td className="p-3 text-gray-500 whitespace-nowrap">
                {post.published_at
                  ? new Date(post.published_at).toLocaleDateString('ja-JP')
                  : '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.impressions ?? '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.likes ?? '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.reposts ?? '-'}
              </td>
              <td className="p-3 text-right tabular-nums">
                {post.latest_metrics?.replies ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: 分析ページを作成**

`src/app/(dashboard)/analytics/page.tsx` を新規作成:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MetricsTable } from '@/components/analytics/MetricsTable'
import type { PostMetrics } from '@/types'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  // published 投稿を最新メトリクスとともに取得
  const { data: posts } = await supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at)')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(100)

  // 各投稿の最新メトリクスだけ残す
  const postsWithLatestMetrics = (posts ?? []).map(post => {
    const metrics = (post.post_metrics as PostMetrics[]).sort(
      (a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime()
    )
    return { ...post, latest_metrics: metrics[0] ?? null }
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">分析</h1>
        <a
          href="/analytics/report"
          target="_blank"
          className="text-sm text-blue-600 hover:underline"
        >
          レポートを印刷
        </a>
      </div>

      {!accounts?.length ? (
        <p className="text-sm text-gray-500">アカウントがありません。</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded shadow p-4">
              <p className="text-xs text-gray-500 mb-1">総投稿数</p>
              <p className="text-2xl font-bold">{postsWithLatestMetrics.length}</p>
            </div>
            <div className="bg-white rounded shadow p-4">
              <p className="text-xs text-gray-500 mb-1">総表示回数</p>
              <p className="text-2xl font-bold">
                {postsWithLatestMetrics
                  .reduce((sum, p) => sum + (p.latest_metrics?.impressions ?? 0), 0)
                  .toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded shadow p-4">
              <p className="text-xs text-gray-500 mb-1">総いいね数</p>
              <p className="text-2xl font-bold">
                {postsWithLatestMetrics
                  .reduce((sum, p) => sum + (p.latest_metrics?.likes ?? 0), 0)
                  .toLocaleString()}
              </p>
            </div>
          </div>

          <MetricsTable posts={postsWithLatestMetrics} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: TypeScriptチェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 6: コミット & プッシュ & PR**

```bash
git add -A
git commit -m "feat: Task4 - 分析ダッシュボード"
git push -u origin feat/plan2-task4-analytics
```

---

## Task 5: レポート生成（印刷対応ページ）

**Files:**
- Create: `src/app/(dashboard)/analytics/report/page.tsx`

- [ ] **Step 1: ブランチ作成**

```bash
git checkout main && git pull && git checkout -b feat/plan2-task5-report
```

- [ ] **Step 2: レポートページを作成**

`src/app/(dashboard)/analytics/report/page.tsx` を新規作成:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { PostMetrics } from '@/types'

export default async function ReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: posts } = await supabase
    .from('posts')
    .select('*, post_metrics(impressions, likes, reposts, replies, fetched_at), accounts(account_name, platform)')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(100)

  const postsWithLatestMetrics = (posts ?? []).map(post => {
    const metrics = (post.post_metrics as PostMetrics[]).sort(
      (a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime()
    )
    return { ...post, latest_metrics: metrics[0] ?? null }
  })

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
            <h1 className="text-2xl font-bold">SNS パフォーマンスレポート</h1>
            <p className="text-sm text-gray-500 mt-1">生成日: {generatedAt}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print px-4 py-2 bg-gray-900 text-white rounded text-sm"
          >
            印刷 / PDF保存
          </button>
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

> **Note:** `onClick={() => window.print()}` は Client Componentが必要。`'use client'` を追加するか、別途 PrintButton コンポーネントを作成すること。修正例:

`src/app/(dashboard)/analytics/report/page.tsx` の最初に `'use client'` を追加するか、ボタン部分を分離する。最も簡単な方法は `'use client'` を追加してコンポーネント全体をクライアント化することだが、その場合 `createClient` の呼び出しを Route Handler に移す必要がある。

**推奨:** ページ本体はサーバーコンポーネントのまま維持し、印刷ボタンだけを分離する:

`src/app/(dashboard)/analytics/report/PrintButton.tsx` を新規作成:

```tsx
'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print px-4 py-2 bg-gray-900 text-white rounded text-sm"
    >
      印刷 / PDF保存
    </button>
  )
}
```

`report/page.tsx` 内の `<button>` を `<PrintButton />` に置換し、`import { PrintButton } from './PrintButton'` を追加する。

- [ ] **Step 3: TypeScriptチェック**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: コミット & プッシュ & PR**

```bash
git add -A
git commit -m "feat: Task5 - レポート生成（印刷対応ページ）"
git push -u origin feat/plan2-task5-report
```

---

## Task 6: MCPサーバー（Claude Code連携）

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/index.ts`

- [ ] **Step 1: ブランチ作成**

```bash
git checkout main && git pull && git checkout -b feat/plan2-task6-mcp-server
```

- [ ] **Step 2: packages/mcp-server ディレクトリ作成と依存関係インストール**

```bash
mkdir -p packages/mcp-server/src
cd packages/mcp-server && npm init -y
npm install @modelcontextprotocol/sdk @supabase/supabase-js
npm install -D typescript @types/node
```

- [ ] **Step 3: packages/mcp-server/package.json を作成**

```json
{
  "name": "@sns-automation/mcp-server",
  "version": "1.0.0",
  "description": "MCP server for SNS Automation Platform",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc && node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@supabase/supabase-js": "^2.103.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5"
  }
}
```

- [ ] **Step 4: packages/mcp-server/tsconfig.json を作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: packages/mcp-server/src/index.ts を実装**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(supabaseUrl, supabaseKey)

const server = new Server(
  { name: 'sns-automation-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_accounts',
      description: '利用可能なSNSアカウントの一覧を返す',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'create_post',
      description: '投稿を下書きとして保存する',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'アカウントID' },
          content: { type: 'string', description: '投稿本文' },
          scheduled_date: { type: 'string', description: '投稿予定日 (YYYY-MM-DD)' },
        },
        required: ['account_id', 'content', 'scheduled_date'],
      },
    },
    {
      name: 'list_posts',
      description: 'アカウントの投稿一覧を返す',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'アカウントID' },
          status: {
            type: 'string',
            enum: ['draft', 'review', 'ready', 'published', 'failed'],
            description: 'フィルタするステータス（省略時は全件）',
          },
        },
        required: ['account_id'],
      },
    },
    {
      name: 'update_post',
      description: '投稿の内容・日時・ステータスを更新する',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '投稿ID' },
          content: { type: 'string', description: '新しい本文（省略可）' },
          scheduled_date: { type: 'string', description: '新しい投稿予定日 YYYY-MM-DD（省略可）' },
          status: {
            type: 'string',
            enum: ['draft', 'review', 'ready'],
            description: '新しいステータス（省略可）',
          },
        },
        required: ['id'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'list_accounts') {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, account_name, platform')
      .order('created_at')

    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  if (name === 'create_post') {
    const { account_id, content, scheduled_date } = args as {
      account_id: string; content: string; scheduled_date: string
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({ account_id, content, scheduled_date, status: 'draft', source: 'ai' })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  if (name === 'list_posts') {
    const { account_id, status } = args as { account_id: string; status?: string }
    let query = supabase
      .from('posts')
      .select('id, content, scheduled_date, status, source, created_at')
      .eq('account_id', account_id)
      .order('scheduled_date')

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  if (name === 'update_post') {
    const { id, ...updates } = args as {
      id: string; content?: string; scheduled_date?: string; status?: string
    }

    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  throw new Error(`Unknown tool: ${name}`)
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

- [ ] **Step 6: ビルドして動作確認**

```bash
cd packages/mcp-server && npm run build
```

Expected: `dist/index.js` が生成される

- [ ] **Step 7: Claude Code / Claude Desktop への設定方法を README に記載**

`packages/mcp-server/README.md` を新規作成:

```markdown
# SNS Automation MCP Server

Claude Code または Claude Desktop からSNS投稿を操作するMCPサーバーです。

## セットアップ

### 環境変数

以下の環境変数が必要です:

- `SUPABASE_URL`: Supabase プロジェクトURL
- `SUPABASE_SERVICE_ROLE_KEY`: サービスロールキー（Supabase ダッシュボード → Settings → API）

### Claude Code への設定

`~/.claude/claude_desktop_config.json`（またはClaude Desktopの設定）に追加:

\`\`\`json
{
  "mcpServers": {
    "sns-automation": {
      "command": "node",
      "args": ["/path/to/sns-automation/packages/mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://fdmhkjiqsrzktfmbqlxg.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
\`\`\`

## 利用可能なツール

| ツール | 説明 |
|--------|------|
| `list_accounts` | アカウント一覧を取得 |
| `create_post` | 下書き投稿を作成 |
| `list_posts` | 投稿一覧を取得（statusフィルタ可） |
| `update_post` | 投稿を更新 |
```

- [ ] **Step 8: コミット & プッシュ & PR**

```bash
git add -A
git commit -m "feat: Task6 - MCPサーバー（Claude Code連携）"
git push -u origin feat/plan2-task6-mcp-server
```

---

## 環境変数チェックリスト

Plan2 を本番デプロイするために Vercel に以下を追加する:

| 変数名 | 説明 | 設定箇所 |
|--------|------|---------|
| `ANTHROPIC_API_KEY` | Claude API キー | Vercel → Settings → Environment Variables |

既存の変数（`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `CRON_SECRET`）は設定済み。

MCPサーバーはローカル実行のため Vercel への設定は不要。
