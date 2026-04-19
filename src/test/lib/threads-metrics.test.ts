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
