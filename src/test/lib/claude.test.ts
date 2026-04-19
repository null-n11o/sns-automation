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
