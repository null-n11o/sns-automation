// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { postToThreads, PublishError } from '@/lib/threads-api'

describe('postToThreads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates container, waits for it to finish, then publishes and returns meta', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
    })
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.platformPostId).toBe('post-456')
    expect(result.meta.containerId).toBe('container-123')
    expect(result.meta.create?.httpStatus).toBe(200)
    expect(result.meta.publish?.httpStatus).toBe(200)
    expect(result.meta.failedStep).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(3)

    const [createUrl, createOptions] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('user-789/threads')
    expect(createUrl).toContain('media_type=TEXT')
    expect(createOptions.method).toBe('POST')

    const [statusUrl] = mockFetch.mock.calls[1]
    expect(statusUrl).toContain('container-123')
    expect(statusUrl).toContain('fields=status')

    const [publishUrl] = mockFetch.mock.calls[2]
    expect(publishUrl).toContain('user-789/threads_publish')
  })

  it('creates an image container when imageUrl is provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
      imageUrl: 'https://example.com/image.jpg',
    })
    await vi.runAllTimersAsync()
    await resultPromise

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

  it('polls the container status again when still IN_PROGRESS, then publishes once FINISHED', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'IN_PROGRESS' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello',
    })
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.platformPostId).toBe('post-456')
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('throws PublishError with failedStep=status when the container errors out', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'ERROR', error_message: 'Media processing failed' }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello',
    }).catch((e) => e)
    await vi.runAllTimersAsync()
    const err = await resultPromise

    expect(err).toBeInstanceOf(PublishError)
    expect(err.meta.failedStep).toBe('status')
    expect(err.meta.containerId).toBe('container-123')
    expect(err.message).toContain('Media processing failed')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws PublishError with failedStep=status when the container never finishes in time', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'IN_PROGRESS' }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello',
    }).catch((e) => e)
    await vi.runAllTimersAsync()
    const err = await resultPromise

    expect(err).toBeInstanceOf(PublishError)
    expect(err.meta.failedStep).toBe('status')
    expect(err.message).toContain('did not finish processing')
  })

  it('throws PublishError with failedStep=publish when publish fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'The requested resource does not exist' } }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello',
    }).catch((e) => e)
    await vi.runAllTimersAsync()
    const err = await resultPromise

    expect(err).toBeInstanceOf(PublishError)
    expect(err.meta.failedStep).toBe('publish')
    expect(err.meta.containerId).toBe('container-123')
    expect(err.meta.publish?.httpStatus).toBe(400)
    expect(err.meta.publish?.response).toMatchObject({ error: { message: 'The requested resource does not exist' } })
  })

  it('adds reply_to_id to the create container request when replyToId is provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'reply-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'ぶら下げリプ',
      replyToId: 'parent-999',
    })
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.platformPostId).toBe('reply-456')
    const [createUrl] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('reply_to_id=parent-999')
  })

  it('does NOT add reply_to_id when replyToId is not provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'container-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'FINISHED' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post-456' }) })
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: '通常投稿',
    })
    await vi.runAllTimersAsync()
    await resultPromise

    const [createUrl] = mockFetch.mock.calls[0]
    expect(createUrl).not.toContain('reply_to_id')
  })
})
