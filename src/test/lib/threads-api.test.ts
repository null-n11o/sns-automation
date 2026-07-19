// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postToThreads, PublishError } from '@/lib/threads-api'

describe('postToThreads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('creates container then publishes and returns meta', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    const result = await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
    })

    expect(result.platformPostId).toBe('post-456')
    expect(result.meta.containerId).toBe('container-123')
    expect(result.meta.create?.httpStatus).toBe(200)
    expect(result.meta.publish?.httpStatus).toBe(200)
    expect(result.meta.failedStep).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(2)

    const [createUrl, createOptions] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('user-789/threads')
    expect(createUrl).toContain('media_type=TEXT')
    expect(createOptions.method).toBe('POST')

    const [publishUrl] = mockFetch.mock.calls[1]
    expect(publishUrl).toContain('user-789/threads_publish')
  })

  it('creates an image container when imageUrl is provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
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

  it('throws PublishError with failedStep=create when container creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid token' } }),
    }))

    await expect(postToThreads({
      accessToken: 'bad-token',
      userId: 'user-789',
      content: 'Hello',
    })).rejects.toMatchObject({
      message: expect.stringContaining('Threads API error'),
      meta: { failedStep: 'create', create: { httpStatus: 400 } },
    })
  })

  it('throws PublishError with failedStep=publish when publish fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'The requested resource does not exist' } }) })
    vi.stubGlobal('fetch', mockFetch)

    const err = await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello',
    }).catch((e) => e)

    expect(err).toBeInstanceOf(PublishError)
    expect(err.meta.failedStep).toBe('publish')
    expect(err.meta.containerId).toBe('container-123')
    expect(err.meta.publish?.httpStatus).toBe(400)
    expect(err.meta.publish?.response).toMatchObject({ error: { message: 'The requested resource does not exist' } })
  })
})
