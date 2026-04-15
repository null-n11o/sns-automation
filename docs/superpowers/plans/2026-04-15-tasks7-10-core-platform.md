# SNS Automation Platform — Plan 1: Tasks 7–10 (Remaining)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the core post flow: Platform API clients, post management UI, scheduled publishing via Vercel Cron.

**Architecture:** Next.js App Router for full-stack (UI + API routes), Supabase for database/auth/RLS-based multi-tenancy, Vercel Cron for scheduled publishing. SNS API credentials stored AES-256-GCM encrypted in Supabase.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (`@supabase/ssr`), shadcn/ui, Tailwind CSS, Vitest, `twitter-api-v2`, Vercel

**Status:** Tasks 1–6 are complete and merged. This plan covers Tasks 7–10.

---

## File Structure (new files only)

```
src/
├── lib/
│   ├── threads-api.ts         # Threads API client
│   ├── x-api.ts               # X (Twitter) API client
│   └── publish.ts             # Unified publish + credential decrypt
├── components/
│   └── posts/
│       ├── PostStatusBadge.tsx
│       ├── CreatePostModal.tsx
│       └── PostsTable.tsx
├── app/
│   ├── (dashboard)/posts/page.tsx    # Replace stub
│   └── api/
│       ├── posts/route.ts
│       ├── posts/[id]/route.ts
│       ├── publish/route.ts
│       └── cron/publish/route.ts
└── test/
    ├── lib/
    │   ├── threads-api.test.ts
    │   └── x-api.test.ts
    └── api/
        └── publish.test.ts
vercel.json
```

---

## Task 7: Platform API Clients (Threads + X)

**Files:**
- Create: `src/lib/threads-api.ts`
- Create: `src/lib/x-api.ts`
- Create: `src/test/lib/threads-api.test.ts`
- Create: `src/test/lib/x-api.test.ts`

- [ ] **Step 1: Write failing test for Threads client**

Create `src/test/lib/threads-api.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postToThreads } from '@/lib/threads-api'

describe('postToThreads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('creates container then publishes', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container-123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'post-456' }),
      })
    vi.stubGlobal('fetch', mockFetch)

    const result = await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
    })

    expect(result).toBe('post-456')
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // First call: create container
    const [createUrl, createOptions] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('user-789/threads')
    expect(createOptions.method).toBe('POST')

    // Second call: publish
    const [publishUrl] = mockFetch.mock.calls[1]
    expect(publishUrl).toContain('user-789/threads_publish')
  })

  it('throws when container creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Invalid token' } }),
    }))

    await expect(postToThreads({
      accessToken: 'bad-token',
      userId: 'user-789',
      content: 'Hello',
    })).rejects.toThrow('Threads API error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/test/lib/threads-api.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/threads-api'`

- [ ] **Step 3: Implement Threads client**

Create `src/lib/threads-api.ts`:

```typescript
const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsPostOptions {
  accessToken: string
  userId: string
  content: string
}

export async function postToThreads({ accessToken, userId, content }: ThreadsPostOptions): Promise<string> {
  // Step 1: Create media container
  const createUrl = new URL(`${THREADS_API_BASE}/${userId}/threads`)
  createUrl.searchParams.set('media_type', 'TEXT')
  createUrl.searchParams.set('text', content)
  createUrl.searchParams.set('access_token', accessToken)

  const createRes = await fetch(createUrl.toString(), { method: 'POST' })
  const createData = await createRes.json()

  if (!createRes.ok) {
    throw new Error(`Threads API error: ${createData.error?.message ?? 'Unknown error'}`)
  }

  const containerId = createData.id

  // Step 2: Publish the container
  const publishUrl = new URL(`${THREADS_API_BASE}/${userId}/threads_publish`)
  publishUrl.searchParams.set('creation_id', containerId)
  publishUrl.searchParams.set('access_token', accessToken)

  const publishRes = await fetch(publishUrl.toString(), { method: 'POST' })
  const publishData = await publishRes.json()

  if (!publishRes.ok) {
    throw new Error(`Threads publish error: ${publishData.error?.message ?? 'Unknown error'}`)
  }

  return publishData.id
}
```

- [ ] **Step 4: Run Threads test to verify it passes**

```bash
npm run test:run -- src/test/lib/threads-api.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Write failing test for X client**

Create `src/test/lib/x-api.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { postToX } from '@/lib/x-api'

describe('postToX', () => {
  it('posts a tweet and returns tweet id', async () => {
    const mockTweetFn = vi.fn().mockResolvedValue({ data: { id: 'tweet-123', text: 'Hello X!' } })

    vi.mock('twitter-api-v2', () => ({
      TwitterApi: vi.fn().mockImplementation(() => ({
        v2: { tweet: mockTweetFn },
      })),
    }))

    const result = await postToX({
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'tokenSecret',
      content: 'Hello X!',
    })

    expect(result).toBe('tweet-123')
    expect(mockTweetFn).toHaveBeenCalledWith('Hello X!')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm run test:run -- src/test/lib/x-api.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/x-api'`

- [ ] **Step 7: Implement X client**

Create `src/lib/x-api.ts`:

```typescript
import { TwitterApi } from 'twitter-api-v2'

interface XPostOptions {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
  content: string
}

export async function postToX({ apiKey, apiSecret, accessToken, accessTokenSecret, content }: XPostOptions): Promise<string> {
  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  })

  const tweet = await client.v2.tweet(content)
  return tweet.data.id
}
```

- [ ] **Step 8: Run X test to verify it passes**

```bash
npm run test:run -- src/test/lib/x-api.test.ts
```

Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git checkout -b feat/task-7-api-clients
git add src/lib/threads-api.ts src/lib/x-api.ts src/test/lib/threads-api.test.ts src/test/lib/x-api.test.ts
git commit -m "feat: add Threads and X API publishing clients"
git push -u origin feat/task-7-api-clients
```

Then create a PR: `gh pr create --title "feat: Task 7 - Platform API Clients (Threads + X)" --body "Implements postToThreads and postToX with unit tests."`

---

## Task 8: Post Management UI

**Files:**
- Modify: `src/app/(dashboard)/posts/page.tsx` (replace stub)
- Create: `src/components/posts/PostStatusBadge.tsx`
- Create: `src/components/posts/CreatePostModal.tsx`
- Create: `src/components/posts/PostsTable.tsx`
- Create: `src/app/api/posts/route.ts`
- Create: `src/app/api/posts/[id]/route.ts`

- [ ] **Step 1: Create PostStatusBadge component**

Create `src/components/posts/PostStatusBadge.tsx`:

```typescript
import type { PostStatus } from '@/types'

const statusStyles: Record<PostStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

const statusLabels: Record<PostStatus, string> = {
  draft: 'ドラフト',
  review: 'レビュー中',
  ready: '準備完了',
  published: '公開済み',
  failed: '失敗',
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  )
}
```

- [ ] **Step 2: Create CreatePostModal component**

Create `src/components/posts/CreatePostModal.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  accountId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreatePostModal({ accountId, open, onClose, onCreated }: Props) {
  const [content, setContent] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        content,
        scheduled_date: scheduledDate,
        source: 'manual',
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? '投稿の作成に失敗しました')
    } else {
      setContent('')
      setScheduledDate('')
      onCreated()
      onClose()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>投稿を作成</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>本文</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              required
              placeholder="投稿内容を入力..."
            />
            <p className="text-xs text-gray-500 mt-1">{content.length} 文字</p>
          </div>
          <div>
            <Label>予約日時</Label>
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : 'ドラフトとして保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create PostsTable component**

Create `src/components/posts/PostsTable.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { PostStatusBadge } from './PostStatusBadge'
import { CreatePostModal } from './CreatePostModal'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Post, PostStatus } from '@/types'

interface Account {
  id: string
  account_name: string
  platform: string
}

interface Props {
  initialPosts: Post[]
  accounts: Account[]
}

const STATUSES: PostStatus[] = ['draft', 'review', 'ready', 'published', 'failed']

export function PostsTable({ initialPosts, accounts }: Props) {
  const [posts, setPosts] = useState(initialPosts)
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const filteredPosts = posts
    .filter(p => p.account_id === selectedAccountId)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

  async function refreshPosts() {
    const res = await fetch(`/api/posts?account_id=${selectedAccountId}`)
    const data = await res.json()
    setPosts(prev => {
      const others = prev.filter(p => p.account_id !== selectedAccountId)
      return [...others, ...data]
    })
  }

  async function updateStatus(postId: string, status: PostStatus) {
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status } : p))
  }

  async function saveEdit(postId: string) {
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: editContent } : p))
    setEditingId(null)
  }

  async function publishNow(postId: string) {
    setPublishingId(postId)
    await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    })
    await refreshPosts()
    setPublishingId(null)
  }

  const canEdit = (status: PostStatus) => status === 'draft' || status === 'review'

  return (
    <div>
      {/* アカウントタブ */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedAccountId(a.id)}
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

      {/* アクション */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{filteredPosts.length} 件</p>
        <Button onClick={() => setShowCreateModal(true)}>+ 新規投稿</Button>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 text-sm font-medium">本文</th>
              <th className="text-left p-4 text-sm font-medium">予約日時</th>
              <th className="text-left p-4 text-sm font-medium">ステータス</th>
              <th className="text-left p-4 text-sm font-medium">ソース</th>
              <th className="text-left p-4 text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map(post => (
              <tr key={post.id} className="border-t hover:bg-gray-50">
                <td className="p-4 max-w-xs">
                  {editingId === post.id ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(post.id)}>保存</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>キャンセル</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm line-clamp-2">{post.content}</p>
                  )}
                </td>
                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                  {new Date(post.scheduled_date).toLocaleString('ja-JP')}
                </td>
                <td className="p-4">
                  <Select
                    value={post.status}
                    onValueChange={v => updateStatus(post.id, v as PostStatus)}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue>
                        <PostStatusBadge status={post.status} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => (
                        <SelectItem key={s} value={s}>
                          <PostStatusBadge status={s} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-4">
                  <span className="text-xs text-gray-500">{post.source === 'ai' ? 'AI' : '手動'}</span>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {canEdit(post.status) && editingId !== post.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingId(post.id); setEditContent(post.content) }}
                      >
                        編集
                      </Button>
                    )}
                    {post.status === 'ready' && (
                      <Button
                        size="sm"
                        onClick={() => publishNow(post.id)}
                        disabled={publishingId === post.id}
                      >
                        {publishingId === post.id ? '投稿中...' : '今すぐ投稿'}
                      </Button>
                    )}
                    {post.status === 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(post.id, 'draft')}
                      >
                        差し戻し
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredPosts.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400 text-sm">
                  投稿がありません。「+ 新規投稿」から作成してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreatePostModal
        accountId={selectedAccountId}
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refreshPosts}
      />
    </div>
  )
}
```

- [ ] **Step 4: Replace posts page stub**

Replace `src/app/(dashboard)/posts/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PostsTable } from '@/components/posts/PostsTable'

export default async function PostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .order('scheduled_date')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">投稿管理</h1>
      {!accounts?.length ? (
        <p className="text-gray-500 text-sm">
          アカウントがありません。先に<a href="/accounts" className="underline">アカウントを登録</a>してください。
        </p>
      ) : (
        <PostsTable initialPosts={posts ?? []} accounts={accounts} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create posts API routes**

Create `src/app/api/posts/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')

  let query = supabase.from('posts').select('*').order('scheduled_date')
  if (accountId) query = query.eq('account_id', accountId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { account_id, content, scheduled_date, source = 'manual' } = body

  const { data, error } = await supabase.from('posts').insert({
    account_id,
    content,
    scheduled_date,
    source,
    status: 'draft',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
```

Create `src/app/api/posts/[id]/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if (body.status !== undefined) updates.status = body.status
  if (body.content !== undefined) updates.content = body.content
  if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date

  const { error } = await supabase.from('posts').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Verify dev server builds without errors**

```bash
npm run build
```

Expected: Build succeeds (no TypeScript errors)

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/task-8-posts-ui
git add src/components/posts/ src/app/\(dashboard\)/posts/page.tsx src/app/api/posts/
git commit -m "feat: add post management UI with table, status management, and manual creation"
git push -u origin feat/task-8-posts-ui
```

Then: `gh pr create --title "feat: Task 8 - Post Management UI" --body "投稿一覧・新規作成・ステータス変更・インライン編集・今すぐ投稿を実装。"`

---

## Task 9: Publish API + Vercel Cron

**Files:**
- Create: `src/lib/publish.ts`
- Create: `src/app/api/publish/route.ts`
- Create: `src/app/api/cron/publish/route.ts`
- Create: `src/test/api/publish.test.ts`
- Create: `vercel.json`

- [ ] **Step 1: Write failing test for publish logic**

Create `src/test/api/publish.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { publishPost } from '@/lib/publish'

describe('publishPost', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  it('decrypts credentials before posting to Threads', async () => {
    const { encrypt } = await import('@/lib/crypto')
    const mockPostToThreads = vi.fn().mockResolvedValue('threads-post-id')
    vi.mock('@/lib/threads-api', () => ({ postToThreads: mockPostToThreads }))

    const encryptedToken = encrypt('real-access-token')

    await publishPost({
      platform: 'threads',
      content: 'Hello world',
      access_token: encryptedToken,
      platform_user_id: 'user-123',
    })

    expect(mockPostToThreads).toHaveBeenCalledWith({
      accessToken: 'real-access-token',
      userId: 'user-123',
      content: 'Hello world',
    })
  })

  it('decrypts credentials before posting to X', async () => {
    const { encrypt } = await import('@/lib/crypto')
    const mockPostToX = vi.fn().mockResolvedValue('tweet-123')
    vi.mock('@/lib/x-api', () => ({ postToX: mockPostToX }))

    await publishPost({
      platform: 'x',
      content: 'Hello X',
      api_key: encrypt('key'),
      api_secret: encrypt('secret'),
      access_token: encrypt('token'),
      access_token_secret: encrypt('tokenSecret'),
    })

    expect(mockPostToX).toHaveBeenCalledWith({
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'tokenSecret',
      content: 'Hello X',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/test/api/publish.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/publish'`

- [ ] **Step 3: Create publish logic module**

Create `src/lib/publish.ts`:

```typescript
import { decrypt } from '@/lib/crypto'
import { postToThreads } from '@/lib/threads-api'
import { postToX } from '@/lib/x-api'
import type { Platform } from '@/types'

interface PublishOptions {
  platform: Platform
  content: string
  access_token?: string | null
  access_token_secret?: string | null
  api_key?: string | null
  api_secret?: string | null
  platform_user_id?: string | null
}

export async function publishPost(options: PublishOptions): Promise<string> {
  const { platform, content } = options

  if (platform === 'threads') {
    if (!options.access_token || !options.platform_user_id) {
      throw new Error('Threads requires access_token and platform_user_id')
    }
    return postToThreads({
      accessToken: decrypt(options.access_token),
      userId: options.platform_user_id,
      content,
    })
  }

  if (platform === 'x') {
    if (!options.api_key || !options.api_secret || !options.access_token || !options.access_token_secret) {
      throw new Error('X requires api_key, api_secret, access_token, and access_token_secret')
    }
    return postToX({
      apiKey: decrypt(options.api_key),
      apiSecret: decrypt(options.api_secret),
      accessToken: decrypt(options.access_token),
      accessTokenSecret: decrypt(options.access_token_secret),
      content,
    })
  }

  throw new Error(`Unsupported platform: ${platform}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/test/api/publish.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Create immediate publish API route**

Create `src/app/api/publish/route.ts`:

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
    await publishPost({
      platform: account.platform as Platform,
      content: post.content,
      access_token: account.access_token,
      access_token_secret: account.access_token_secret,
      api_key: account.api_key,
      api_secret: account.api_secret,
      platform_user_id: account.platform_user_id,
    })

    await supabase.from('posts').update({ status: 'published' }).eq('id', post_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase.from('posts').update({ status: 'failed', error_message: message }).eq('id', post_id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 6: Create Vercel Cron publish route**

Create `src/app/api/cron/publish/route.ts`:

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
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Find all ready posts scheduled for today or earlier
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
        await publishPost({
          platform: account.platform as Platform,
          content: post.content,
          access_token: account.access_token,
          access_token_secret: account.access_token_secret,
          api_key: account.api_key,
          api_secret: account.api_secret,
          platform_user_id: account.platform_user_id,
        })

        await supabase.from('posts').update({ status: 'published' }).eq('id', post.id)
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

- [ ] **Step 7: Configure Vercel Cron**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/publish",
      "schedule": "0 * * * *"
    }
  ]
}
```

Note: `"0 * * * *"` = every hour at :00. Adjust to `"* * * * *"` (every minute) only for testing in production.
`CRON_SECRET` 環境変数を Vercel と `.env.local` の両方に設定すること。

- [ ] **Step 8: Run all tests**

```bash
npm run test:run
```

Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git checkout -b feat/task-9-publish-cron
git add src/lib/publish.ts src/app/api/publish/ src/app/api/cron/ src/test/api/ vercel.json
git commit -m "feat: add publish API routes and Vercel Cron for scheduled posting"
git push -u origin feat/task-9-publish-cron
```

Then: `gh pr create --title "feat: Task 9 - Publish API + Vercel Cron" --body "publishPost共通ロジック、即時投稿API、Cron定期投稿APIを実装。"`

---

## Task 10: Deploy to Vercel

**Files:** No new files

- [ ] **Step 1: Set environment variables in Vercel**

Vercel プロジェクト設定 → Environment Variables に以下を追加:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`（`.env.local` と同じ64文字hex）
- `CRON_SECRET`（ランダムな文字列）

- [ ] **Step 2: Update Supabase redirect URLs**

Supabase ダッシュボード → Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`

- [ ] **Step 3: Push main branch to trigger deploy**

```bash
git checkout main
git merge feat/task-9-publish-cron
git push origin main
```

Vercel が自動デプロイ開始。Vercel ダッシュボードでビルドログを確認。

- [ ] **Step 4: Smoke test production**

1. 本番URLにアクセス → `/login` にリダイレクトされること
2. ログイン → `/posts` に遷移すること
3. アカウントを作成（テスト用API認証情報）
4. 手動投稿を作成、予約日時を設定、ステータスを「準備完了」に変更
5. 「今すぐ投稿」ボタンで即時投稿 → SNSプラットフォームに反映されること

---

## Summary

| Task | 説明 | ブランチ |
|------|------|---------|
| 7 | Threads + X API クライアント | `feat/task-7-api-clients` |
| 8 | 投稿管理UI | `feat/task-8-posts-ui` |
| 9 | 公開API + Vercel Cron | `feat/task-9-publish-cron` |
| 10 | Vercel デプロイ | `main` |
