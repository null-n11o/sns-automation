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
    expect(createUrl).toContain('media_type=TEXT')
    expect(createOptions.method).toBe('POST')

    // Second call: publish
    const [publishUrl] = mockFetch.mock.calls[1]
    expect(publishUrl).toContain('user-789/threads_publish')
  })

  it('creates an image container when imageUrl is provided', async () => {
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

    await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
      imageUrl: 'https://example.com/image.jpg',
    })

    const [createUrl] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('media_type=IMAGE')
    expect(createUrl).toContain('image_url=https%3A%2F%2Fexample.com%2Fimage.jpg')
    expect(createUrl).toContain('text=Hello+Threads%21')
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
