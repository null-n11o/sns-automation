// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decrypt } from '@/lib/crypto'

const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabaseClient),
  createServiceClient: vi.fn().mockResolvedValue(mockSupabaseClient),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

process.env.ENCRYPTION_KEY = 'd'.repeat(64)

const { updateThreadsAccessToken } = await import('@/app/(dashboard)/accounts/actions')

function wireSupabase(options: {
  role?: string
  profileCompany?: string
  account?: {
    company_id: string
    platform: string
    platform_user_id: string | null
  } | null
  onUpdate?: (value: Record<string, unknown>) => void
}) {
  const profileBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { role: options.role ?? 'admin', company_id: options.profileCompany ?? 'c1' },
      error: null,
    }),
  }
  const accountBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: options.account ?? null, error: null }),
  }
  const updateBuilder = {
    update: vi.fn().mockImplementation((value: Record<string, unknown>) => {
      options.onUpdate?.(value)
      return { eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }
  let accountCalls = 0
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'users') return profileBuilder
    if (table === 'accounts') {
      accountCalls += 1
      return accountCalls === 1 ? accountBuilder : updateBuilder
    }
    return {}
  })
  mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
}

describe('updateThreadsAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('rejects an empty token before querying the database', async () => {
    const result = await updateThreadsAccessToken('a1', '   ')

    expect(result.error).toBe('アクセストークンを入力してください')
    expect(mockSupabaseClient.from).not.toHaveBeenCalled()
  })

  it('rejects a token for a different Threads user', async () => {
    wireSupabase({
      account: { company_id: 'c1', platform: 'threads', platform_user_id: 'expected-user' },
    })
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 'different-user', username: 'someone_else' }), { status: 200 }),
    )

    const result = await updateThreadsAccessToken('a1', 'new-token')

    expect(result.error).toBe('このアカウントとは異なるThreadsユーザーのトークンです')
  })

  it('rejects an invalid or expired token', async () => {
    wireSupabase({
      account: { company_id: 'c1', platform: 'threads', platform_user_id: 'threads-user' },
    })
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }))

    const result = await updateThreadsAccessToken('a1', 'expired-token')

    expect(result.error).toBe('アクセストークンが無効または期限切れです')
  })

  it('encrypts and saves a valid token for the registered user', async () => {
    let saved: Record<string, unknown> | null = null
    wireSupabase({
      account: { company_id: 'c1', platform: 'threads', platform_user_id: 'threads-user' },
      onUpdate: (value) => { saved = value },
    })
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 'threads-user', username: 'dober_fullstack' }), { status: 200 }),
    )

    const result = await updateThreadsAccessToken('a1', '  valid-token  ')

    expect(result).toEqual({ error: null, username: 'dober_fullstack' })
    expect(saved).not.toBeNull()
    expect(decrypt(saved!.access_token as string)).toBe('valid-token')
    expect(saved!.platform_user_id).toBe('threads-user')
  })
})
