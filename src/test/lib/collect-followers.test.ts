// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetchFollowers } = vi.hoisted(() => ({
  mockFetchFollowers: vi.fn(),
}))

vi.mock('@/lib/threads-followers', () => ({
  fetchThreadsFollowersCount: mockFetchFollowers,
}))

import { collectThreadsFollowerSnapshots } from '@/lib/collect-followers'
import { encrypt } from '@/lib/crypto'

function makeSupabase({
  accounts,
  accountQueryError = null,
  insertError = null,
}: {
  accounts: unknown[]
  accountQueryError?: { message: string } | null
  insertError?: { message: string } | null
}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const accountsBuilder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'not']) {
    accountsBuilder[method] = vi.fn(() => accountsBuilder)
  }
  accountsBuilder.then = (resolve: (value: { data: unknown[]; error: { message: string } | null }) => void) =>
    resolve({ data: accounts, error: accountQueryError })

  const from = vi.fn((table: string) =>
    table === 'accounts' ? accountsBuilder : { insert },
  )
  return { supabase: { from } as never, insert }
}

describe('collectThreadsFollowerSnapshots', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  beforeEach(() => vi.resetAllMocks())

  it('inserts only fetched follower counts and returns the inserted count', async () => {
    mockFetchFollowers
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(null)

    const { supabase, insert } = makeSupabase({
      accounts: [
        { id: 'acc-1', access_token: encrypt('t1'), platform_user_id: 'u1' },
        { id: 'acc-2', access_token: encrypt('t2'), platform_user_id: 'u2' },
      ],
    })

    const count = await collectThreadsFollowerSnapshots(supabase)

    expect(count).toBe(1)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith([
      { account_id: 'acc-1', followers_count: 1000 },
    ])
    expect(mockFetchFollowers).toHaveBeenCalledWith({
      userId: 'u1',
      accessToken: 't1',
    })
  })

  it('continues inserting other accounts when one fetch throws', async () => {
    mockFetchFollowers
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(500)

    const { supabase, insert } = makeSupabase({
      accounts: [
        { id: 'acc-1', access_token: encrypt('t1'), platform_user_id: 'u1' },
        { id: 'acc-2', access_token: encrypt('t2'), platform_user_id: 'u2' },
      ],
    })

    const count = await collectThreadsFollowerSnapshots(supabase)

    expect(count).toBe(1)
    expect(insert).toHaveBeenCalledWith([
      { account_id: 'acc-2', followers_count: 500 },
    ])
  })

  it('logs account-query errors and returns zero', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { supabase } = makeSupabase({
      accounts: [],
      accountQueryError: { message: 'database unavailable' },
    })

    await expect(collectThreadsFollowerSnapshots(supabase)).resolves.toBe(0)

    expect(consoleError).toHaveBeenCalledWith(
      'Threads follower account query failed:',
      'database unavailable',
    )
  })

  it('logs rejected account collection without exposing its token', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetchFollowers.mockRejectedValueOnce(new Error('request failed for token secret-token'))

    const { supabase } = makeSupabase({
      accounts: [{ id: 'acc-1', access_token: encrypt('secret-token'), platform_user_id: 'u1' }],
    })

    await expect(collectThreadsFollowerSnapshots(supabase)).resolves.toBe(0)

    expect(consoleError).toHaveBeenCalledWith(
      'Threads follower collection failed for account acc-1',
    )
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret-token')
  })

  it('logs failed account_metrics inserts and excludes them from the count', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetchFollowers.mockResolvedValueOnce(1000)
    const { supabase } = makeSupabase({
      accounts: [{ id: 'acc-1', access_token: encrypt('t1'), platform_user_id: 'u1' }],
      insertError: { message: 'insert rejected' },
    })

    await expect(collectThreadsFollowerSnapshots(supabase)).resolves.toBe(0)

    expect(consoleError).toHaveBeenCalledWith(
      'account_metrics insert failed for acc-1:',
      'insert rejected',
    )
  })
})
