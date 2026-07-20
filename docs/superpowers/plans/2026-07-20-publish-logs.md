# publish事後解析ログ（publish_logs）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** publish試行を成功・失敗どちらも `publish_logs` に記録し、後からThreadsの2段階publishの失敗パターンをSQLで解析できるようにする。

**Architecture:** `postToThreads` を計測メタ付きに拡張し、共通ラッパ `publishAndLog` が cron・手動の両経路のpublishをラップしてログ行を書き込む。ログ書き込み失敗はpublishに影響させない。古いログは既存の毎時publish cronの末尾で60日クリーンアップする。

**Tech Stack:** Next.js(App Router / route handlers), TypeScript(strict), Supabase(postgres + supabase-js), Vitest。

## Global Constraints

- **Next.js独自版**: route handler(`src/app/api/**/route.ts`)を編集する前に、AGENTS.mdの指示に従い `node_modules/next/dist/docs/` の該当ガイドを確認する（APIやファイル構造が学習データと異なる可能性）。
- **秘密値の非保存**: `access_token`/`api_key`/`api_secret`/`token` 系の値をログDB・コミット対象に残さない。生レスポンスは必ず `maskSecrets()` を通す。トークンがクエリに乗るリクエストURLは保存しない。
- **テスト**: `npm run test:run`（unit/integration）。**Lint**: `npm run lint`。
- **ログはpublishを壊さない**: `publish_logs` へのINSERT・クリーンアップDELETEは try-catch で握りつぶし、publishの成否・APIレスポンスに影響させない。
- **posts.status更新は従来通り**: `published`/`failed` の更新は各route側に残す（本計画で挙動を変えない）。

---

### Task 1: `publish_logs` テーブルと型定義

**Files:**
- Create: `supabase/migrations/20260720000000_publish_logs.sql`
- Modify: `src/types/index.ts`（末尾に型追加）

**Interfaces:**
- Produces: DBテーブル `publish_logs`、TS型 `PublishLog`

- [ ] **Step 1: migrationファイルを作成**

Create `supabase/migrations/20260720000000_publish_logs.sql`:

```sql
-- =============================================================================
-- publish_logs: publish試行(成功/失敗)の事後解析ログ
-- =============================================================================

CREATE TABLE IF NOT EXISTS publish_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id             UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform            TEXT        NOT NULL,
  trigger             TEXT        NOT NULL,
  result              TEXT        NOT NULL,
  failed_step         TEXT,
  total_ms            INTEGER     NOT NULL,
  create_http_status  INTEGER,
  container_id        TEXT,
  create_ms           INTEGER,
  create_response     JSONB,
  publish_http_status INTEGER,
  platform_post_id    TEXT,
  publish_ms          INTEGER,
  publish_response    JSONB,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_logs_created_at ON publish_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_publish_logs_account ON publish_logs(account_id);

-- RLS: publish_logs（selectは自社アカウントのみ / insertは自社アカウント。
--      cronはservice roleでRLSバイパス）
ALTER TABLE publish_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "publish_logs: select own company"
  ON publish_logs FOR SELECT TO authenticated
  USING (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );

CREATE POLICY "publish_logs: insert own company"
  ON publish_logs FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );
```

- [ ] **Step 2: `PublishLog` 型を追加**

Modify `src/types/index.ts` — ファイル末尾に追記:

```typescript
export interface PublishLog {
  id: string
  post_id: string
  account_id: string
  platform: Platform
  trigger: 'cron' | 'manual'
  result: 'success' | 'failed'
  failed_step: 'create' | 'publish' | null
  total_ms: number
  create_http_status: number | null
  container_id: string | null
  create_ms: number | null
  create_response: unknown | null
  publish_http_status: number | null
  platform_post_id: string | null
  publish_ms: number | null
  publish_response: unknown | null
  error_message: string | null
  created_at: string
}
```

`Platform` が同ファイルに未定義の場合は既存の import/定義を確認して合わせる（`src/types` 内に既存の `Platform` 型がある）。

- [ ] **Step 3: 型チェックとlint**

Run: `npm run lint`
Expected: エラーなし（型追加のみ）。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260720000000_publish_logs.sql src/types/index.ts
git commit -m "feat: add publish_logs table and PublishLog type"
```

---

### Task 2: `maskSecrets()` — 秘密値マスキング

**Files:**
- Create: `src/lib/publish-log.ts`（このタスクでは `maskSecrets` のみ）
- Test: `src/test/lib/publish-log.test.ts`

**Interfaces:**
- Produces: `export function maskSecrets(value: unknown): unknown`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/test/lib/publish-log.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { maskSecrets } from '@/lib/publish-log'

describe('maskSecrets', () => {
  it('masks token-like keys recursively', () => {
    const input = {
      id: 'post-1',
      access_token: 'secret-token',
      nested: { api_key: 'k', api_secret: 's', label: 'ok' },
      list: [{ token: 't' }, { safe: 'v' }],
    }
    expect(maskSecrets(input)).toEqual({
      id: 'post-1',
      access_token: '***',
      nested: { api_key: '***', api_secret: '***', label: 'ok' },
      list: [{ token: '***' }, { safe: 'v' }],
    })
  })

  it('leaves non-secret values untouched', () => {
    expect(maskSecrets({ error: { message: 'nope' } })).toEqual({
      error: { message: 'nope' },
    })
  })

  it('passes through primitives and null', () => {
    expect(maskSecrets('hello')).toBe('hello')
    expect(maskSecrets(null)).toBe(null)
    expect(maskSecrets(42)).toBe(42)
  })
})
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npm run test:run -- src/test/lib/publish-log.test.ts`
Expected: FAIL（`maskSecrets` が存在しない / import エラー）。

- [ ] **Step 3: 最小実装を書く**

Create `src/lib/publish-log.ts`:

```typescript
const SECRET_KEY_PATTERN = /access_token|api_key|api_secret|token/i

export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSecrets)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '***' : maskSecrets(val)
    }
    return out
  }
  return value
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm run test:run -- src/test/lib/publish-log.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish-log.ts src/test/lib/publish-log.test.ts
git commit -m "feat: add maskSecrets for publish log sanitization"
```

---

### Task 3: `postToThreads` を計測メタ付きに拡張

**Files:**
- Modify: `src/lib/threads-api.ts`
- Test: `src/test/lib/threads-api.test.ts`（既存を更新）

**Interfaces:**
- Consumes: なし
- Produces:
  - `export interface PublishStepMeta { httpStatus: number | null; ms: number | null; response: unknown | null }`
  - `export interface PublishMeta { containerId: string | null; create: PublishStepMeta | null; publish: PublishStepMeta | null; failedStep: 'create' | 'publish' | null }`
  - `export class PublishError extends Error { meta: PublishMeta }`
  - `postToThreads(...)` の戻り値を `Promise<{ platformPostId: string; meta: PublishMeta }>` に変更（失敗時は `PublishError` を throw）

- [ ] **Step 1: 既存テストを新シグネチャに更新し、metaのテストを追加**

Modify `src/test/lib/threads-api.test.ts` — 既存の3テストを書き換え＋追加。全文を以下で置換:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postToThreads, PublishError } from '@/lib/threads-api'

describe('postToThreads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('creates container then publishes and returns meta', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    const result = await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
    })

    expect(result.platformPostId).toBe('post-456')
    expect(result.meta.containerId).toBe('container-123')
    expect(result.meta.create?.httpStatus).toBe(200)
    expect(result.meta.publish?.httpStatus).toBe(200)
    expect(result.meta.failedStep).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(2)

    const [createUrl, createOptions] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('user-789/threads')
    expect(createUrl).toContain('media_type=TEXT')
    expect(createOptions.method).toBe('POST')

    const [publishUrl] = mockFetch.mock.calls[1]
    expect(publishUrl).toContain('user-789/threads_publish')
  })

  it('creates an image container when imageUrl is provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
      imageUrl: 'https://example.com/image.jpg',
    })

    const [createUrl] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('media_type=IMAGE')
    expect(createUrl).toContain('image_url=https%3A%2F%2Fexample.com%2Fimage.jpg')
    expect(createUrl).toContain('text=Hello+Threads%21')
  })

  it('throws PublishError with failedStep=create when container creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid token' } }),
    }))

    await expect(postToThreads({
      accessToken: 'bad-token',
      userId: 'user-789',
      content: 'Hello',
    })).rejects.toMatchObject({
      message: expect.stringContaining('Threads API error'),
      meta: { failedStep: 'create', create: { httpStatus: 400 } },
    })
  })

  it('throws PublishError with failedStep=publish when publish fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'The requested resource does not exist' } }) })
    vi.stubGlobal('fetch', mockFetch)

    const err = await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello',
    }).catch((e) => e)

    expect(err).toBeInstanceOf(PublishError)
    expect(err.meta.failedStep).toBe('publish')
    expect(err.meta.containerId).toBe('container-123')
    expect(err.meta.publish?.httpStatus).toBe(400)
    expect(err.meta.publish?.response).toMatchObject({ error: { message: 'The requested resource does not exist' } })
  })
})
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npm run test:run -- src/test/lib/threads-api.test.ts`
Expected: FAIL（`PublishError` 未export、`result.platformPostId` undefined 等）。

- [ ] **Step 3: `threads-api.ts` を実装**

Modify `src/lib/threads-api.ts` — 全文を以下で置換:

```typescript
const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsPostOptions {
  accessToken: string
  userId: string
  content: string
  imageUrl?: string | null
}

export interface PublishStepMeta {
  httpStatus: number | null
  ms: number | null
  response: unknown | null
}

export interface PublishMeta {
  containerId: string | null
  create: PublishStepMeta | null
  publish: PublishStepMeta | null
  failedStep: 'create' | 'publish' | null
}

export class PublishError extends Error {
  meta: PublishMeta
  constructor(message: string, meta: PublishMeta) {
    super(message)
    this.name = 'PublishError'
    this.meta = meta
  }
}

export async function postToThreads(
  { accessToken, userId, content, imageUrl }: ThreadsPostOptions,
): Promise<{ platformPostId: string; meta: PublishMeta }> {
  const meta: PublishMeta = { containerId: null, create: null, publish: null, failedStep: null }

  // Step 1: Create media container
  const createUrl = new URL(`${THREADS_API_BASE}/${userId}/threads`)
  createUrl.searchParams.set('media_type', imageUrl ? 'IMAGE' : 'TEXT')
  createUrl.searchParams.set('text', content)
  if (imageUrl) createUrl.searchParams.set('image_url', imageUrl)
  createUrl.searchParams.set('access_token', accessToken)

  const createStart = Date.now()
  const createRes = await fetch(createUrl.toString(), { method: 'POST' })
  const createData = await createRes.json()
  meta.create = { httpStatus: createRes.status, ms: Date.now() - createStart, response: createData }

  if (!createRes.ok) {
    meta.failedStep = 'create'
    throw new PublishError(`Threads API error: ${createData.error?.message ?? 'Unknown error'}`, meta)
  }

  const containerId = createData.id
  meta.containerId = containerId

  // Step 2: Publish the container
  const publishUrl = new URL(`${THREADS_API_BASE}/${userId}/threads_publish`)
  publishUrl.searchParams.set('creation_id', containerId)
  publishUrl.searchParams.set('access_token', accessToken)

  const publishStart = Date.now()
  const publishRes = await fetch(publishUrl.toString(), { method: 'POST' })
  const publishData = await publishRes.json()
  meta.publish = { httpStatus: publishRes.status, ms: Date.now() - publishStart, response: publishData }

  if (!publishRes.ok) {
    meta.failedStep = 'publish'
    throw new PublishError(`Threads publish error: ${publishData.error?.message ?? 'Unknown error'}`, meta)
  }

  return { platformPostId: publishData.id, meta }
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm run test:run -- src/test/lib/threads-api.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/threads-api.ts src/test/lib/threads-api.test.ts
git commit -m "feat: return publish meta and PublishError from postToThreads"
```

---

### Task 4: `publishPost` を meta 透過に変更

**Files:**
- Modify: `src/lib/publish.ts`
- Test: `src/test/api/publish.test.ts`（既存モックの戻り値を更新）

**Interfaces:**
- Consumes: `postToThreads` → `{ platformPostId, meta }`（Task 3）、`PublishMeta`（Task 3）
- Produces: `publishPost(options)` → `Promise<{ platformPostId: string; meta: PublishMeta }>`

- [ ] **Step 1: 既存テストのモック戻り値を新形に更新**

Modify `src/test/api/publish.test.ts` — Threads/X のモック戻り値を `{ platformPostId, meta }` 形へ。該当2箇所を変更:

```typescript
// Threadsのテスト内:
mockPostToThreads.mockResolvedValue({
  platformPostId: 'threads-post-id',
  meta: { containerId: 'c1', create: null, publish: null, failedStep: null },
})
```

```typescript
// Xのテスト内:
mockPostToX.mockResolvedValue('tweet-123')
```

（X側は文字列のまま。`publishPost` が X 分岐で meta を補完する。呼び出し引数の assert は既存のまま変更しない。）

- [ ] **Step 2: テスト失敗を確認**

Run: `npm run test:run -- src/test/api/publish.test.ts`
Expected: FAIL（`publishPost` の戻り値型不一致 / X分岐が未対応）。

- [ ] **Step 3: `publish.ts` を実装**

Modify `src/lib/publish.ts` — import と `publishPost` を変更:

```typescript
import { decrypt } from '@/lib/crypto'
import { postToThreads, type PublishMeta } from '@/lib/threads-api'
import { postToX } from '@/lib/x-api'
import type { Platform } from '@/types'

interface PublishOptions {
  platform: Platform
  content: string
  image_url?: string | null
  access_token?: string | null
  access_token_secret?: string | null
  api_key?: string | null
  api_secret?: string | null
  platform_user_id?: string | null
}

const EMPTY_META: PublishMeta = { containerId: null, create: null, publish: null, failedStep: null }

export async function publishPost(
  options: PublishOptions,
): Promise<{ platformPostId: string; meta: PublishMeta }> {
  const { platform, content, image_url } = options

  if (platform === 'threads') {
    if (!options.access_token || !options.platform_user_id) {
      throw new Error('Threads requires access_token and platform_user_id')
    }
    return postToThreads({
      accessToken: decrypt(options.access_token),
      userId: options.platform_user_id,
      content,
      imageUrl: image_url,
    })
  }

  if (platform === 'x') {
    if (image_url) {
      throw new Error('Image posting is currently supported only for Threads')
    }
    if (!options.api_key || !options.api_secret || !options.access_token || !options.access_token_secret) {
      throw new Error('X requires api_key, api_secret, access_token, and access_token_secret')
    }
    const platformPostId = await postToX({
      apiKey: decrypt(options.api_key),
      apiSecret: decrypt(options.api_secret),
      accessToken: decrypt(options.access_token),
      accessTokenSecret: decrypt(options.access_token_secret),
      content,
    })
    return { platformPostId, meta: { ...EMPTY_META } }
  }

  throw new Error(`Unsupported platform: ${platform}`)
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm run test:run -- src/test/api/publish.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish.ts src/test/api/publish.test.ts
git commit -m "feat: publishPost returns platformPostId and publish meta"
```

---

### Task 5: `buildPublishLogEntry` と `publishAndLog`

**Files:**
- Modify: `src/lib/publish-log.ts`（`maskSecrets` に追記）
- Test: `src/test/lib/publish-log.test.ts`（追記）

**Interfaces:**
- Consumes: `publishPost`（Task 4）、`PublishError`/`PublishMeta`（Task 3）、`maskSecrets`（Task 2）
- Produces:
  - `buildPublishLogEntry(input): PublishLogInsert`（純粋関数）
  - `publishAndLog(supabase, { post, account, trigger }): Promise<{ platformPostId: string | null; error: string | null }>`
  - 型 `PublishLogInsert`（`publish_logs` へのinsert用オブジェクト）

- [ ] **Step 1: `buildPublishLogEntry` の失敗テストを追記**

Append to `src/test/lib/publish-log.test.ts`:

```typescript
import { buildPublishLogEntry, publishAndLog } from '@/lib/publish-log'
import { PublishError, type PublishMeta } from '@/lib/threads-api'

describe('buildPublishLogEntry', () => {
  const base = {
    post: { id: 'post-1', account_id: 'acc-1' },
    account: { platform: 'threads' as const },
    trigger: 'cron' as const,
    totalMs: 1234,
  }

  it('builds a success row from meta', () => {
    const meta: PublishMeta = {
      containerId: 'c1',
      create: { httpStatus: 200, ms: 100, response: { id: 'c1' } },
      publish: { httpStatus: 200, ms: 200, response: { id: 'p1' } },
      failedStep: null,
    }
    const row = buildPublishLogEntry({ ...base, result: 'success', platformPostId: 'p1', meta, errorMessage: null })
    expect(row).toMatchObject({
      post_id: 'post-1',
      account_id: 'acc-1',
      platform: 'threads',
      trigger: 'cron',
      result: 'success',
      failed_step: null,
      total_ms: 1234,
      container_id: 'c1',
      create_http_status: 200,
      publish_http_status: 200,
      platform_post_id: 'p1',
      error_message: null,
    })
  })

  it('masks secrets inside stored responses', () => {
    const meta: PublishMeta = {
      containerId: 'c1',
      create: { httpStatus: 200, ms: 100, response: { access_token: 'leak', id: 'c1' } },
      publish: null,
      failedStep: 'publish',
    }
    const row = buildPublishLogEntry({ ...base, result: 'failed', platformPostId: null, meta, errorMessage: 'boom' })
    expect(row.create_response).toEqual({ access_token: '***', id: 'c1' })
    expect(row.failed_step).toBe('publish')
    expect(row.error_message).toBe('boom')
  })
})

describe('publishAndLog', () => {
  function makeSupabase() {
    const insert = vi.fn().mockResolvedValue({ error: null })
    return { client: { from: vi.fn(() => ({ insert })) }, insert }
  }
  const post = { id: 'post-1', account_id: 'acc-1', content: 'hi', image_url: null }
  const account = {
    platform: 'threads', access_token: 'enc', platform_user_id: 'u1',
    access_token_secret: null, api_key: null, api_secret: null,
  }

  it('logs a success row and returns platformPostId', async () => {
    vi.doMock('@/lib/publish', () => ({
      publishPost: vi.fn().mockResolvedValue({
        platformPostId: 'p1',
        meta: { containerId: 'c1', create: null, publish: null, failedStep: null },
      }),
    }))
    const { publishAndLog: fn } = await import('@/lib/publish-log')
    const { client, insert } = makeSupabase()

    const res = await fn(client as never, { post, account, trigger: 'cron' })

    expect(res).toEqual({ platformPostId: 'p1', error: null })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ result: 'success', platform_post_id: 'p1' }))
    vi.doUnmock('@/lib/publish')
  })

  it('logs a failed row (with meta) and returns error when publish throws PublishError', async () => {
    const meta: PublishMeta = { containerId: 'c1', create: null, publish: { httpStatus: 400, ms: 5, response: { error: { message: 'The requested resource does not exist' } } }, failedStep: 'publish' }
    vi.doMock('@/lib/publish', () => ({
      publishPost: vi.fn().mockRejectedValue(new PublishError('Threads publish error: The requested resource does not exist', meta)),
    }))
    const { publishAndLog: fn } = await import('@/lib/publish-log')
    const { client, insert } = makeSupabase()

    const res = await fn(client as never, { post, account, trigger: 'cron' })

    expect(res.platformPostId).toBeNull()
    expect(res.error).toContain('does not exist')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', failed_step: 'publish' }))
    vi.doUnmock('@/lib/publish')
  })

  it('still returns the publish result even if log insert throws', async () => {
    vi.doMock('@/lib/publish', () => ({
      publishPost: vi.fn().mockResolvedValue({ platformPostId: 'p1', meta: { containerId: null, create: null, publish: null, failedStep: null } }),
    }))
    const { publishAndLog: fn } = await import('@/lib/publish-log')
    const insert = vi.fn().mockRejectedValue(new Error('db down'))
    const client = { from: vi.fn(() => ({ insert })) }

    const res = await fn(client as never, { post, account, trigger: 'cron' })

    expect(res).toEqual({ platformPostId: 'p1', error: null })
    vi.doUnmock('@/lib/publish')
  })
})
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npm run test:run -- src/test/lib/publish-log.test.ts`
Expected: FAIL（`buildPublishLogEntry` / `publishAndLog` 未export）。

- [ ] **Step 3: `publish-log.ts` に実装を追記**

Append to `src/lib/publish-log.ts`:

```typescript
import { publishPost } from '@/lib/publish'
import { PublishError, type PublishMeta } from '@/lib/threads-api'
import type { Platform } from '@/types'

export interface PublishLogInsert {
  post_id: string
  account_id: string
  platform: Platform
  trigger: 'cron' | 'manual'
  result: 'success' | 'failed'
  failed_step: 'create' | 'publish' | null
  total_ms: number
  create_http_status: number | null
  container_id: string | null
  create_ms: number | null
  create_response: unknown | null
  publish_http_status: number | null
  platform_post_id: string | null
  publish_ms: number | null
  publish_response: unknown | null
  error_message: string | null
}

interface BuildLogInput {
  post: { id: string; account_id: string }
  account: { platform: Platform }
  trigger: 'cron' | 'manual'
  result: 'success' | 'failed'
  platformPostId: string | null
  meta: PublishMeta
  errorMessage: string | null
  totalMs: number
}

export function buildPublishLogEntry(input: BuildLogInput): PublishLogInsert {
  const { post, account, trigger, result, platformPostId, meta, errorMessage, totalMs } = input
  return {
    post_id: post.id,
    account_id: post.account_id,
    platform: account.platform,
    trigger,
    result,
    failed_step: meta.failedStep,
    total_ms: totalMs,
    create_http_status: meta.create?.httpStatus ?? null,
    container_id: meta.containerId,
    create_ms: meta.create?.ms ?? null,
    create_response: meta.create ? maskSecrets(meta.create.response) : null,
    publish_http_status: meta.publish?.httpStatus ?? null,
    platform_post_id: platformPostId,
    publish_ms: meta.publish?.ms ?? null,
    publish_response: meta.publish ? maskSecrets(meta.publish.response) : null,
    error_message: errorMessage,
  }
}

const EMPTY_META: PublishMeta = { containerId: null, create: null, publish: null, failedStep: null }

type SupabaseLike = { from: (table: string) => { insert: (row: PublishLogInsert) => Promise<{ error: unknown }> } }

interface PublishAndLogArgs {
  post: { id: string; account_id: string; content: string; image_url: string | null }
  account: {
    platform: Platform
    access_token: string | null
    access_token_secret: string | null
    api_key: string | null
    api_secret: string | null
    platform_user_id: string | null
  }
  trigger: 'cron' | 'manual'
}

export async function publishAndLog(
  supabase: SupabaseLike,
  { post, account, trigger }: PublishAndLogArgs,
): Promise<{ platformPostId: string | null; error: string | null }> {
  const start = Date.now()
  let result: 'success' | 'failed' = 'success'
  let platformPostId: string | null = null
  let meta: PublishMeta = EMPTY_META
  let errorMessage: string | null = null

  try {
    const r = await publishPost({
      platform: account.platform,
      content: post.content,
      image_url: post.image_url,
      access_token: account.access_token,
      access_token_secret: account.access_token_secret,
      api_key: account.api_key,
      api_secret: account.api_secret,
      platform_user_id: account.platform_user_id,
    })
    platformPostId = r.platformPostId
    meta = r.meta
  } catch (err) {
    result = 'failed'
    errorMessage = err instanceof Error ? err.message : 'Unknown error'
    if (err instanceof PublishError) meta = err.meta
  }

  const entry = buildPublishLogEntry({
    post, account, trigger, result, platformPostId, meta, errorMessage, totalMs: Date.now() - start,
  })
  try {
    await supabase.from('publish_logs').insert(entry)
  } catch {
    // ログ書き込み失敗はpublish結果に影響させない
  }

  return { platformPostId, error: errorMessage }
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm run test:run -- src/test/lib/publish-log.test.ts`
Expected: PASS（全 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish-log.ts src/test/lib/publish-log.test.ts
git commit -m "feat: add buildPublishLogEntry and publishAndLog wrapper"
```

---

### Task 6: cron・手動 route を `publishAndLog` 経由に切替 + 60日クリーンアップ

**Files:**
- Modify: `src/app/api/cron/publish/route.ts`
- Modify: `src/app/api/publish/route.ts`

**Interfaces:**
- Consumes: `publishAndLog`（Task 5）

- [ ] **Step 1: 実装前に Next.js ガイドを確認**

Run: `ls node_modules/next/dist/docs/`
route handler の記法に破壊的変更がないか該当ガイドを確認する（Global Constraints）。

- [ ] **Step 2: cron route を書き換え**

Modify `src/app/api/cron/publish/route.ts` — `Promise.allSettled` 内を `publishAndLog` 経由にし、末尾にクリーンアップを追加:

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishAndLog } from '@/lib/publish-log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const { data: posts } = await supabase
    .from('posts')
    .select('*, accounts(*)')
    .eq('status', 'ready')
    .lte('scheduled_date', now)

  if (!posts?.length) {
    await cleanupOldLogs(supabase)
    return NextResponse.json({ published: 0 })
  }

  const results = await Promise.allSettled(
    posts.map(async post => {
      const account = post.accounts as Record<string, string | null>
      const { platformPostId, error } = await publishAndLog(supabase, {
        post: { id: post.id, account_id: post.account_id, content: post.content, image_url: post.image_url ?? null },
        account: {
          platform: account.platform as never,
          access_token: account.access_token,
          access_token_secret: account.access_token_secret,
          api_key: account.api_key,
          api_secret: account.api_secret,
          platform_user_id: account.platform_user_id,
        },
        trigger: 'cron',
      })

      if (error) {
        await supabase.from('posts').update({ status: 'failed', error_message: error }).eq('id', post.id)
        return { id: post.id, ok: false, error }
      }

      await supabase
        .from('posts')
        .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId })
        .eq('id', post.id)
      return { id: post.id, ok: true }
    })
  )

  await cleanupOldLogs(supabase)

  const published = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length
  return NextResponse.json({ published, total: posts.length })
}

async function cleanupOldLogs(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('publish_logs').delete().lt('created_at', cutoff)
  } catch {
    // クリーンアップ失敗はpublishに影響させない
  }
}
```

- [ ] **Step 3: 手動 publish route を書き換え**

Modify `src/app/api/publish/route.ts` — `try/catch` の publish 部分を `publishAndLog` に:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishAndLog } from '@/lib/publish-log'

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

  const { platformPostId, error } = await publishAndLog(supabase, {
    post: { id: post.id, account_id: post.account_id, content: post.content, image_url: post.image_url ?? null },
    account: {
      platform: account.platform as never,
      access_token: account.access_token,
      access_token_secret: account.access_token_secret,
      api_key: account.api_key,
      api_secret: account.api_secret,
      platform_user_id: account.platform_user_id,
    },
    trigger: 'manual',
  })

  if (error) {
    await supabase.from('posts').update({ status: 'failed', error_message: error }).eq('id', post_id)
    return NextResponse.json({ error }, { status: 500 })
  }

  await supabase
    .from('posts')
    .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId })
    .eq('id', post_id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 全テスト + lint**

Run: `npm run test:run`
Expected: 全 PASS（既存テストの回帰なし）。

Run: `npm run lint`
Expected: エラーなし。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/publish/route.ts src/app/api/publish/route.ts
git commit -m "feat: route publishing through publishAndLog with 60-day log cleanup"
```

---

## 動作確認（手動 / デプロイ後）

計画完了後、実DBで確認する:

1. マイグレーション `20260720000000_publish_logs.sql` を本番/ステージング Supabase に適用。
2. ダッシュボードから1件手動publish（成功ケース） → `SELECT * FROM publish_logs ORDER BY created_at DESC LIMIT 1;` で `trigger='manual'`, `result='success'`, `create_response`/`publish_response` にトークンが**含まれていない**ことを確認。
3. 次回のcron publish後、`publish_logs` に `trigger='cron'` の行が入ること、失敗時に `failed_step` と `publish_response` の生エラーが残ることを確認。

## Self-Review メモ（記入済み）

- **Spec coverage**: テーブル(§1)=Task1 / postToThreadsメタ化(§2)=Task3 / publishAndLogラッパ(§3)=Task5+Task6 / マスキング(§4)=Task2,Task5 / 60日クリーンアップ(§5)=Task6 / テスト方針(§テスト)=各Task。全網羅。
- **posts.status更新**: Global Constraints通り各routeに残置（Task6）。
- **型整合**: `PublishMeta`/`PublishError`(Task3) を Task4/Task5 が import。`publishAndLog` の戻り値 `{ platformPostId, error }` を Task6 の両routeが消費。一致。
