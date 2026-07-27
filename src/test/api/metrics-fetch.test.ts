// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest'

const {
  mockCollectFollowers,
  mockFetchThreadsMetrics,
  mockFetchXMetrics,
  mockCreateServiceClient,
} = vi.hoisted(() => ({
  mockCollectFollowers: vi.fn(),
  mockFetchThreadsMetrics: vi.fn(),
  mockFetchXMetrics: vi.fn(),
  mockCreateServiceClient: vi.fn(),
}))

vi.mock('@/lib/collect-followers', () => ({ collectThreadsFollowerSnapshots: mockCollectFollowers }))
vi.mock('@/lib/threads-metrics', () => ({ fetchThreadsPostMetrics: mockFetchThreadsMetrics }))
vi.mock('@/lib/x-metrics', () => ({ fetchXPostMetrics: mockFetchXMetrics }))
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
  const postsChain = {
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: object[] }) => void) => resolve({ data: publishedPosts }),
  }
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'posts') return { select: vi.fn().mockReturnValue(postsChain) }
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

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectFollowers.mockResolvedValue(2)
  })

  it('CRON_SECRET が一致しない場合 401 を返す', async () => {
    const res = await GET(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
    expect(mockCollectFollowers).not.toHaveBeenCalled()
  })

  it('投稿がない場合もフォロワー数を収集し fetched: 0 を返す', async () => {
    makeSupabaseMock([])
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.fetched).toBe(0)
    expect(body.followersCollected).toBe(2)
    expect(mockCollectFollowers).toHaveBeenCalledTimes(1)
  })

  it('Threads の投稿のメトリクスを取得してDBに保存する', async () => {
    const now = new Date()
    const publishedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

    const { insert } = makeSupabaseMock([
      {
        id: 'post-1',
        platform_post_id: 'media-123',
        published_at: publishedAt,
        accounts: {
          platform: 'threads',
          access_token: 'token',
          api_key: null,
          api_secret: null,
          access_token_secret: null,
          platform_user_id: 'uid',
        },
        post_metrics: [],
      },
    ])

    mockFetchThreadsMetrics.mockResolvedValue({ impressions: 100, likes: 10, replies: 2, reposts: 3 })

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.fetched).toBe(1)
    expect(body.followersCollected).toBe(2)
    expect(insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ post_id: 'post-1', impressions: 100, likes: 10 }),
      ])
    )
  })

  it('X の投稿のメトリクスを取得してDBに保存する', async () => {
    const now = new Date()
    const publishedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

    const { insert } = makeSupabaseMock([
      {
        id: 'post-2',
        platform_post_id: 'tweet-456',
        published_at: publishedAt,
        accounts: {
          platform: 'x',
          access_token: 'x-token',
          api_key: 'x-api-key',
          api_secret: 'x-api-secret',
          access_token_secret: 'x-token-secret',
          platform_user_id: null,
        },
        post_metrics: [],
      },
    ])

    mockFetchXMetrics.mockResolvedValue({ impressions: 0, likes: 20, replies: 5, reposts: 8 })

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.fetched).toBe(1)
    expect(body.followersCollected).toBe(2)
    expect(insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ post_id: 'post-2', impressions: 0, likes: 20 }),
      ])
    )
  })

  it('X の投稿で認証情報が不完全な場合はスキップされる', async () => {
    const now = new Date()
    const publishedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

    makeSupabaseMock([
      {
        id: 'post-3',
        platform_post_id: 'tweet-789',
        published_at: publishedAt,
        accounts: {
          platform: 'x',
          access_token: 'x-token',
          api_key: 'x-api-key',
          api_secret: null, // 不完全
          access_token_secret: 'x-token-secret',
          platform_user_id: null,
        },
        post_metrics: [],
      },
    ])

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.fetched).toBe(0)
    expect(body.followersCollected).toBe(2)
  })
})
