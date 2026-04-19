// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const { mockGeneratePosts, mockCreateClient, mockAnalyzeAndImprove } = vi.hoisted(() => ({
  mockGeneratePosts: vi.fn(),
  mockCreateClient: vi.fn(),
  mockAnalyzeAndImprove: vi.fn().mockResolvedValue(null), // 通常はnullを返す（スキップ）
}))

vi.mock('@/lib/claude', () => ({ generatePosts: mockGeneratePosts }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/self-improve', () => ({ analyzeAndImprove: mockAnalyzeAndImprove }))

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
