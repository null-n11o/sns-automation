// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest'

const { mockPostToThreads, mockPostToX } = vi.hoisted(() => ({
  mockPostToThreads: vi.fn(),
  mockPostToX: vi.fn(),
}))

vi.mock('@/lib/threads-api', () => ({ postToThreads: mockPostToThreads }))
vi.mock('@/lib/x-api', () => ({ postToX: mockPostToX }))

import { publishPost } from '@/lib/publish'
import { encrypt } from '@/lib/crypto'

describe('publishPost', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  it('decrypts credentials before posting to Threads', async () => {
    mockPostToThreads.mockResolvedValue('threads-post-id')

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
    mockPostToX.mockResolvedValue('tweet-123')

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
