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

function makeSupabase(accounts: unknown[]) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const accountsBuilder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'not']) {
    accountsBuilder[method] = vi.fn(() => accountsBuilder)
  }
  accountsBuilder.then = (resolve: (value: { data: unknown[] }) => void) =>
    resolve({ data: accounts })

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

    const { supabase, insert } = makeSupabase([
      { id: 'acc-1', access_token: encrypt('t1'), platform_user_id: 'u1' },
      { id: 'acc-2', access_token: encrypt('t2'), platform_user_id: 'u2' },
    ])

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

    const { supabase, insert } = makeSupabase([
      { id: 'acc-1', access_token: encrypt('t1'), platform_user_id: 'u1' },
      { id: 'acc-2', access_token: encrypt('t2'), platform_user_id: 'u2' },
    ])

    const count = await collectThreadsFollowerSnapshots(supabase)

    expect(count).toBe(1)
    expect(insert).toHaveBeenCalledWith([
      { account_id: 'acc-2', followers_count: 500 },
    ])
  })
})
