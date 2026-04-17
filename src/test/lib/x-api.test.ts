// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const mockTweetFn = vi.fn()

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(function() {
    return { v2: { tweet: mockTweetFn } }
  }),
}))

import { postToX } from '@/lib/x-api'

describe('postToX', () => {
  it('posts a tweet and returns tweet id', async () => {
    mockTweetFn.mockResolvedValue({ data: { id: 'tweet-123', text: 'Hello X!' } })

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
