// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { maskSecrets, buildPublishLogEntry, publishAndLog } from '@/lib/publish-log'
import { publishPost } from '@/lib/publish'
import { PublishError, type PublishMeta } from '@/lib/threads-api'

vi.mock('@/lib/publish', () => ({ publishPost: vi.fn() }))

describe('maskSecrets', () => {
  it('masks token-like keys recursively', () => {
    const input = {
      id: 'post-1',
      access_token: 'secret-token',
      nested: { api_key: 'k', api_secret: 's', label: 'ok' },
      list: [{ token: 't' }, { safe: 'v' }],
    }
    expect(maskSecrets(input)).toEqual({
      id: 'post-1',
      access_token: '***',
      nested: { api_key: '***', api_secret: '***', label: 'ok' },
      list: [{ token: '***' }, { safe: 'v' }],
    })
  })

  it('leaves non-secret values untouched', () => {
    expect(maskSecrets({ error: { message: 'nope' } })).toEqual({
      error: { message: 'nope' },
    })
  })

  it('passes through primitives and null', () => {
    expect(maskSecrets('hello')).toBe('hello')
    expect(maskSecrets(null)).toBe(null)
    expect(maskSecrets(42)).toBe(42)
  })
})

describe('buildPublishLogEntry', () => {
  const base = {
    post: { id: 'post-1', account_id: 'acc-1' },
    account: { platform: 'threads' as const },
    trigger: 'cron' as const,
    totalMs: 1234,
  }

  it('builds a success row from meta', () => {
    const meta: PublishMeta = {
      containerId: 'c1',
      create: { httpStatus: 200, ms: 100, response: { id: 'c1' } },
      status: { httpStatus: 200, ms: 150, response: { status: 'FINISHED' } },
      publish: { httpStatus: 200, ms: 200, response: { id: 'p1' } },
      failedStep: null,
    }
    const row = buildPublishLogEntry({ ...base, result: 'success', platformPostId: 'p1', meta, errorMessage: null })
    expect(row).toMatchObject({
      post_id: 'post-1',
      account_id: 'acc-1',
      platform: 'threads',
      trigger: 'cron',
      result: 'success',
      failed_step: null,
      total_ms: 1234,
      container_id: 'c1',
      create_http_status: 200,
      publish_http_status: 200,
      platform_post_id: 'p1',
      error_message: null,
    })
  })

  it('masks secrets inside stored responses', () => {
    const meta: PublishMeta = {
      containerId: 'c1',
      create: { httpStatus: 200, ms: 100, response: { access_token: 'leak', id: 'c1' } },
      status: null,
      publish: null,
      failedStep: 'publish',
    }
    const row = buildPublishLogEntry({ ...base, result: 'failed', platformPostId: null, meta, errorMessage: 'boom' })
    expect(row.create_response).toEqual({ access_token: '***', id: 'c1' })
    expect(row.failed_step).toBe('publish')
    expect(row.error_message).toBe('boom')
  })
})

describe('publishAndLog', () => {
  beforeEach(() => {
    vi.mocked(publishPost).mockReset()
  })

  function makeSupabase() {
    const insert = vi.fn().mockResolvedValue({ error: null })
    return { client: { from: vi.fn(() => ({ insert })) }, insert }
  }
  const post = { id: 'post-1', account_id: 'acc-1', content: 'hi', image_url: null }
  const account = {
    platform: 'threads' as const, access_token: 'enc', platform_user_id: 'u1',
    access_token_secret: null, api_key: null, api_secret: null,
  }

  it('logs a success row and returns platformPostId', async () => {
    vi.mocked(publishPost).mockResolvedValue({
      platformPostId: 'p1',
      meta: { containerId: 'c1', create: null, status: null, publish: null, failedStep: null },
    })
    const { client, insert } = makeSupabase()

    const res = await publishAndLog(client as never, { post, account, trigger: 'cron' })

    expect(res).toEqual({ platformPostId: 'p1', error: null })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ result: 'success', platform_post_id: 'p1' }))
  })

  it('logs a failed row (with meta) and returns error when publish throws PublishError', async () => {
    const meta: PublishMeta = { containerId: 'c1', create: null, status: { httpStatus: 200, ms: 50, response: { status: 'FINISHED' } }, publish: { httpStatus: 400, ms: 5, response: { error: { message: 'The requested resource does not exist' } } }, failedStep: 'publish' }
    vi.mocked(publishPost).mockRejectedValue(new PublishError('Threads publish error: The requested resource does not exist', meta))
    const { client, insert } = makeSupabase()

    const res = await publishAndLog(client as never, { post, account, trigger: 'cron' })

    expect(res.platformPostId).toBeNull()
    expect(res.error).toContain('does not exist')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', failed_step: 'publish' }))
  })

  it('still returns the publish result even if log insert throws', async () => {
    vi.mocked(publishPost).mockResolvedValue({ platformPostId: 'p1', meta: { containerId: null, create: null, status: null, publish: null, failedStep: null } })
    const insert = vi.fn().mockRejectedValue(new Error('db down'))
    const client = { from: vi.fn(() => ({ insert })) }

    const res = await publishAndLog(client as never, { post, account, trigger: 'cron' })

    expect(res).toEqual({ platformPostId: 'p1', error: null })
  })
})
