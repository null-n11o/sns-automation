// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingleTweet = vi.fn()

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(function () {
    return { v2: { singleTweet: mockSingleTweet } }
  }),
}))

import { fetchXPostMetrics } from '@/lib/x-metrics'

describe('fetchXPostMetrics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ツイートの public_metrics を取得して返す', async () => {
    mockSingleTweet.mockResolvedValue({
      data: {
        id: 'tweet-123',
        text: 'Hello',
        public_metrics: {
          like_count: 10,
          retweet_count: 5,
          reply_count: 2,
          quote_count: 1,
        },
      },
    })

    const result = await fetchXPostMetrics({
      tweetId: 'tweet-123',
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'tokenSecret',
    })

    expect(result).toEqual({
      impressions: 0,
      likes: 10,
      reposts: 5,
      replies: 2,
    })
    expect(mockSingleTweet).toHaveBeenCalledWith('tweet-123', {
      'tweet.fields': ['public_metrics'],
    })
  })

  it('API エラー時に例外を投げる', async () => {
    mockSingleTweet.mockRejectedValue(new Error('Request failed with code 403'))

    await expect(
      fetchXPostMetrics({
        tweetId: 'tweet-err',
        apiKey: 'key',
        apiSecret: 'secret',
        accessToken: 'token',
        accessTokenSecret: 'tokenSecret',
      })
    ).rejects.toThrow('X API error: Request failed with code 403')
  })
})
