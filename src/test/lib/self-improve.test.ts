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
  // チェーン可能なpostsクエリビルダー
  const postsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
  }
  postsQuery.select.mockReturnValue(postsQuery)
  postsQuery.eq.mockReturnValue(postsQuery)
  postsQuery.gte.mockResolvedValue({ data: posts })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'posts') return postsQuery
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
