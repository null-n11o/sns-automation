# フォロワー数トラッキング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Threads アカウントのフォロワー数を日次 cron で `account_metrics` に蓄積し、分析レポートの週次トレンドに表示できるようにする。

**Architecture:** 純粋な API ラッパー（`threads-followers.ts`）と収集オーケストレーション（`collect-followers.ts`）を lib に切り出し、既存の日次 cron ルート `/api/metrics/fetch` から呼び出す。API から取得できたアカウントのみ `account_metrics` に insert する。

**Tech Stack:** Next.js (App Router / Route Handler), TypeScript, Supabase (service client), Vitest, Threads Graph API (`https://graph.threads.net/v1.0`)

## Global Constraints

- Threads API ベース URL: `https://graph.threads.net/v1.0`（既存 `src/lib/threads-metrics.ts` と同一定数を各ファイルで宣言する）
- `accounts.access_token` は暗号化されている。復号は `@/lib/crypto` の `decrypt()` を使う。
- Supabase service client は `import { createServiceClient } from '@/lib/supabase/server'`。
- テストは Vitest。lib のユニットテストは `src/test/lib/` に置き、先頭に `// @vitest-environment node`、import は `@/` エイリアス。fetch モックは `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(...))`。
- フォロワー数が取得できない場合は `null` を返し、`account_metrics` に insert しない（`0` を入れない）。
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` を付ける。
- 各タスク完了時に該当テストを実行して green を確認してからコミットする。

---

### Task 1: Threads フォロワー数取得 API ラッパー

**Files:**
- Create: `src/lib/threads-followers.ts`
- Test: `src/test/lib/threads-followers.test.ts`

**Interfaces:**
- Consumes: なし（`global.fetch` のみ）
- Produces: `fetchThreadsFollowersCount({ userId: string; accessToken: string }): Promise<number | null>`
  - Threads ユーザーインサイト API を叩き、`followers_count` の `total_value.value` を返す。取得不能時は `null`。例外は投げない。

- [ ] **Step 1: 失敗するテストを書く**

`src/test/lib/threads-followers.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchThreadsFollowersCount } from '@/lib/threads-followers'

describe('fetchThreadsFollowersCount', () => {
  beforeEach(() => vi.resetAllMocks())

  it('total_value.value を数値として返し、正しい URL を叩く', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { name: 'followers_count', total_value: { value: 4321 } },
        ],
      }),
    }))

    const result = await fetchThreadsFollowersCount({
      userId: 'user-123',
      accessToken: 'token-abc',
    })

    expect(result).toBe(4321)

    const [calledUrl] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(calledUrl).toContain('user-123')
    expect(calledUrl).toContain('threads_insights')
    expect(calledUrl).toContain('metric=followers_count')
    expect(calledUrl).toContain('access_token=token-abc')
  })

  it('メトリクスが返らない場合は null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }))

    const result = await fetchThreadsFollowersCount({
      userId: 'user-123',
      accessToken: 'token-abc',
    })

    expect(result).toBeNull()
  })

  it('API エラー時は例外を投げず null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Invalid token' } }),
    }))

    const result = await fetchThreadsFollowersCount({
      userId: 'user-123',
      accessToken: 'bad-token',
    })

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/test/lib/threads-followers.test.ts`
Expected: FAIL（`fetchThreadsFollowersCount` が未定義でモジュール解決エラー）

- [ ] **Step 3: 最小実装を書く**

`src/lib/threads-followers.ts`:

```ts
const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

// Threads ユーザーインサイトの followers_count を取得する。
// followers_count は total_value 型で返る（投稿単位 /insights の values[0].value とは形が異なる）。
// 取得できない場合（<100人でメトリクス非返却 / API エラー / 値欠損）は null を返し、例外は投げない。
export async function fetchThreadsFollowersCount({
  userId,
  accessToken,
}: {
  userId: string
  accessToken: string
}): Promise<number | null> {
  try {
    const url = new URL(`${THREADS_API_BASE}/${userId}/threads_insights`)
    url.searchParams.set('metric', 'followers_count')
    url.searchParams.set('access_token', accessToken)

    const res = await fetch(url.toString())
    const data = await res.json()

    if (!res.ok) return null

    const item = (data.data as Array<{ name: string; total_value?: { value?: number } }> | undefined)
      ?.find(d => d.name === 'followers_count')
    const value = item?.total_value?.value
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/test/lib/threads-followers.test.ts`
Expected: PASS（3件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/threads-followers.ts src/test/lib/threads-followers.test.ts
git commit -m "$(printf 'feat: Threads フォロワー数取得 API ラッパーを追加\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: フォロワー数収集オーケストレーション

**Files:**
- Create: `src/lib/collect-followers.ts`
- Test: `src/test/lib/collect-followers.test.ts`

**Interfaces:**
- Consumes:
  - `fetchThreadsFollowersCount({ userId, accessToken }): Promise<number | null>`（Task 1）
  - `decrypt(value: string): string`（`@/lib/crypto`）
  - `supabase`: `createServiceClient()` の戻り値（`@/lib/supabase/server`）
- Produces: `collectThreadsFollowerSnapshots(supabase: SupabaseClient): Promise<number>`
  - `platform='threads'` かつ `access_token`・`platform_user_id` を持つアカウントを取得し、フォロワー数を取得できたものだけ `account_metrics` に insert する。insert 成功件数を返す。

- [ ] **Step 1: 失敗するテストを書く**

`src/test/lib/collect-followers.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { mockFetchFollowers } = vi.hoisted(() => ({
  mockFetchFollowers: vi.fn(),
}))
vi.mock('@/lib/threads-followers', () => ({
  fetchThreadsFollowersCount: mockFetchFollowers,
}))

import { collectThreadsFollowerSnapshots } from '@/lib/collect-followers'
import { encrypt } from '@/lib/crypto'

// accounts の select チェーン（.select().eq().not().not()）を await で解決する thenable を返し、
// account_metrics.insert を記録するモック supabase クライアント。
function makeSupabase(accounts: unknown[]) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const accountsBuilder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not']) {
    accountsBuilder[m] = vi.fn(() => accountsBuilder)
  }
  accountsBuilder.then = (resolve: (v: { data: unknown[] }) => void) =>
    resolve({ data: accounts })

  const from = vi.fn((table: string) =>
    table === 'accounts' ? accountsBuilder : { insert },
  )
  return { supabase: { from } as never, insert }
}

describe('collectThreadsFollowerSnapshots', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })
  beforeEach(() => vi.resetAllMocks())

  it('取得できたアカウントのみ account_metrics に insert し、件数を返す', async () => {
    mockFetchFollowers
      .mockResolvedValueOnce(1000) // acc-1
      .mockResolvedValueOnce(null) // acc-2 は取得不能 → insert しない

    const { supabase, insert } = makeSupabase([
      { id: 'acc-1', access_token: encrypt('t1'), platform_user_id: 'u1' },
      { id: 'acc-2', access_token: encrypt('t2'), platform_user_id: 'u2' },
    ])

    const count = await collectThreadsFollowerSnapshots(supabase)

    expect(count).toBe(1)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith([{ account_id: 'acc-1', followers_count: 1000 }])
    // トークンは復号して渡す
    expect(mockFetchFollowers).toHaveBeenCalledWith({ userId: 'u1', accessToken: 't1' })
  })

  it('一部の取得が例外でも他アカウントは insert される', async () => {
    mockFetchFollowers
      .mockRejectedValueOnce(new Error('boom')) // acc-1
      .mockResolvedValueOnce(500)               // acc-2

    const { supabase, insert } = makeSupabase([
      { id: 'acc-1', access_token: encrypt('t1'), platform_user_id: 'u1' },
      { id: 'acc-2', access_token: encrypt('t2'), platform_user_id: 'u2' },
    ])

    const count = await collectThreadsFollowerSnapshots(supabase)

    expect(count).toBe(1)
    expect(insert).toHaveBeenCalledWith([{ account_id: 'acc-2', followers_count: 500 }])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/test/lib/collect-followers.test.ts`
Expected: FAIL（`collectThreadsFollowerSnapshots` が未定義）

- [ ] **Step 3: 最小実装を書く**

`src/lib/collect-followers.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/crypto'
import { fetchThreadsFollowersCount } from '@/lib/threads-followers'

// Threads アカウントのフォロワー数を取得し、取得できたものだけ account_metrics に insert する。
// insert 成功件数を返す。個別アカウントの失敗は握りつぶし、他アカウントの処理は継続する。
export async function collectThreadsFollowerSnapshots(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, access_token, platform_user_id')
    .eq('platform', 'threads')
    .not('access_token', 'is', null)
    .not('platform_user_id', 'is', null)

  if (!accounts?.length) return 0

  const results = await Promise.allSettled(
    (accounts as Array<{ id: string; access_token: string; platform_user_id: string }>).map(
      async (account) => {
        const followers = await fetchThreadsFollowersCount({
          userId: account.platform_user_id,
          accessToken: decrypt(account.access_token),
        })
        if (followers === null) return false
        const { error } = await supabase
          .from('account_metrics')
          .insert([{ account_id: account.id, followers_count: followers }])
        if (error) {
          console.error(`account_metrics insert failed for ${account.id}:`, error.message)
          return false
        }
        return true
      },
    ),
  )

  return results.filter(r => r.status === 'fulfilled' && r.value === true).length
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/test/lib/collect-followers.test.ts`
Expected: PASS（2件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/collect-followers.ts src/test/lib/collect-followers.test.ts
git commit -m "$(printf 'feat: フォロワー数収集オーケストレーションを追加\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: 日次 cron ルートに収集ステップを結線

**Files:**
- Modify: `src/app/api/metrics/fetch/route.ts`

**Interfaces:**
- Consumes: `collectThreadsFollowerSnapshots(supabase): Promise<number>`（Task 2）
- Produces: なし（既存レスポンス JSON に `followersCollected` を追加）

**注意:** ルートには 2 箇所の早期 return（`if (!posts?.length)` と `if (!toFetch.length)`）がある。フォロワー収集はこれらより**前**で実行し、全ての return に件数を含める。これにより投稿が無くてもフォロワー収集は走る。

- [ ] **Step 1: import を追加**

`src/app/api/metrics/fetch/route.ts` の import 群（`import { decrypt } from '@/lib/crypto'` の下）に追加:

```ts
import { collectThreadsFollowerSnapshots } from '@/lib/collect-followers'
```

- [ ] **Step 2: service client 生成直後にフォロワー収集を実行**

`const supabase = await createServiceClient()` の直後に追加:

```ts
  const followersCollected = await collectThreadsFollowerSnapshots(supabase)
```

- [ ] **Step 3: 2 箇所の早期 return を差し替え**

変更前:

```ts
  if (!posts?.length) return NextResponse.json({ fetched: 0 })
```
変更後:
```ts
  if (!posts?.length) return NextResponse.json({ fetched: 0, followersCollected })
```

変更前:

```ts
  if (!toFetch.length) return NextResponse.json({ fetched: 0 })
```
変更後:
```ts
  if (!toFetch.length) return NextResponse.json({ fetched: 0, followersCollected })
```

- [ ] **Step 4: 最終 return に件数を追加**

変更前:

```ts
  return NextResponse.json({ fetched, total: toFetch.length })
```
変更後:
```ts
  return NextResponse.json({ fetched, total: toFetch.length, followersCollected })
```

- [ ] **Step 5: 型チェック・lint・全テストを実行**

Run: `npm run lint && npm run test:run`
Expected: いずれも PASS（既存テスト含め green）

- [ ] **Step 6: コミット**

```bash
git add src/app/api/metrics/fetch/route.ts
git commit -m "$(printf 'feat: 日次 cron でフォロワー数を account_metrics に収集\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## 動作確認（実装後・任意）

ローカルまたはデプロイ環境で cron エンドポイントを手動で叩き、`followersCollected >= 1` を確認する:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/metrics/fetch"
# => {"fetched":...,"total":...,"followersCollected":2} など
```

その後、account-post-analysis スキルで Dober のレポートを再生成すると、週次トレンドの `followersCount` に値が入る（`null` でなくなる）。

## Self-Review 結果

- **Spec coverage:** スペックの各要素（`threads-followers.ts` 追加 = Task 1 / ルート結線 = Task 3 / `null` は insert しない = Task 1・2 / DB・UI 変更なし = 変更ファイルに含まれない / テスト = Task 1・2）をタスクで網羅。収集オーケストレーションはテスト容易性のため `collect-followers.ts` に分離（スペックの「関心を分ける」意図に沿う）。
- **Placeholder scan:** 「適切なエラーハンドリング」等の曖昧表現なし。各コードステップに実コードを記載。
- **Type consistency:** `fetchThreadsFollowersCount({ userId, accessToken }): Promise<number | null>` を Task 1 で定義し Task 2 で同一シグネチャで消費。`collectThreadsFollowerSnapshots(supabase): Promise<number>` を Task 2 で定義し Task 3 で消費。`followersCollected` 変数名は Task 3 内で一貫。
