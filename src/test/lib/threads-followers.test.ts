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
