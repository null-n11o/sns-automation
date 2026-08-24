// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabaseClient),
  createServiceClient: vi.fn().mockResolvedValue(mockSupabaseClient),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { updateAccountName } = await import('@/app/(dashboard)/accounts/actions')

// profile(users) → account select(accounts) → update(accounts) の順に from が呼ばれる
function wireSupabase(opts: {
  role?: string
  profileCompany?: string
  account?: { company_id: string } | null
  onUpdate?: (args: Record<string, unknown>) => void
}) {
  const profileBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { role: opts.role ?? 'admin', company_id: opts.profileCompany ?? 'c1' },
      error: null,
    }),
  }
  const accountBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: opts.account ?? null, error: null }),
  }
  const updateBuilder = {
    update: vi.fn().mockImplementation((args: Record<string, unknown>) => {
      opts.onUpdate?.(args)
      return { eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }
  let accountsCall = 0
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'users') return profileBuilder
    if (table === 'accounts') {
      accountsCall++
      return accountsCall === 1 ? accountBuilder : updateBuilder
    }
    return {}
  })
  mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  return { updateBuilder }
}

describe('updateAccountName', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when name is empty', async () => {
    wireSupabase({ account: { company_id: 'c1' } })
    const result = await updateAccountName('a1', '   ')
    expect(result.error).toBe('アカウント名は必須です')
  })

  it('returns error for non-admin', async () => {
    wireSupabase({ role: 'operator' })
    const result = await updateAccountName('a1', '新しい名前')
    expect(result.error).toBe('管理者権限が必要です')
  })

  it('returns error when account belongs to different company', async () => {
    wireSupabase({ profileCompany: 'company-A', account: { company_id: 'company-B' } })
    const result = await updateAccountName('a1', '新しい名前')
    expect(result.error).toBe('操作権限がありません')
  })

  it('trims and saves the new account name', async () => {
    let saved: Record<string, unknown> | null = null
    wireSupabase({
      account: { company_id: 'c1' },
      onUpdate: (args) => { saved = args },
    })
    const result = await updateAccountName('a1', '  Dober  ')
    expect(result.error).toBeNull()
    expect(saved!).toEqual({ account_name: 'Dober' })
  })
})
