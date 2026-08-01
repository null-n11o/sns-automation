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

const { updateAutoReplyConfig } = await import('@/app/(dashboard)/accounts/actions')

// profile(users) → account select(accounts) → update(accounts) の順に from が呼ばれる
function wireSupabase(opts: {
  role?: string
  profileCompany?: string
  account?: { company_id: string; platform: string; auto_reply_config: unknown } | null
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
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const updateBuilder = {
    update: vi.fn().mockImplementation((args: Record<string, unknown>) => {
      opts.onUpdate?.(args)
      return { eq: updateEq }
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

describe('updateAutoReplyConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error for non-admin', async () => {
    wireSupabase({ role: 'operator' })
    const result = await updateAutoReplyConfig('a1', { enabled: false, tiers: [], templates: [] })
    expect(result.error).toBe('管理者権限が必要です')
  })

  it('returns error when account belongs to different company', async () => {
    wireSupabase({ profileCompany: 'company-A', account: { company_id: 'company-B', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', { enabled: false, tiers: [], templates: [] })
    expect(result.error).toBe('操作権限がありません')
  })

  it('converts hours to window_minutes and saves config when enabled', async () => {
    let saved: Record<string, unknown> | null = null
    wireSupabase({
      account: { company_id: 'c1', platform: 'threads', auto_reply_config: null },
      onUpdate: (args) => { saved = args },
    })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [
        { hours: 1, threshold: 300 },
        { hours: 5, threshold: 600 },
        { hours: 0.5, threshold: 200 },
      ],
      templates: ['  文面A  ', ''],
    })
    expect(result.error).toBeNull()
    expect(saved!.auto_reply_config).toEqual({
      enabled: true,
      tiers: [
        { window_minutes: 60, threshold: 300 },
        { window_minutes: 300, threshold: 600 },
        { window_minutes: 30, threshold: 200 },
      ],
      templates: ['文面A'],
    })
  })

  it('rejects enabled save with zero valid tiers', async () => {
    wireSupabase({ account: { company_id: 'c1', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [{ hours: 0, threshold: 0 }],
      templates: ['文面'],
    })
    expect(result.error).toBe('条件は1〜4個で設定してください')
  })

  it('rejects enabled save with more than 4 tiers', async () => {
    wireSupabase({ account: { company_id: 'c1', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [
        { hours: 1, threshold: 100 },
        { hours: 2, threshold: 200 },
        { hours: 3, threshold: 300 },
        { hours: 4, threshold: 400 },
        { hours: 5, threshold: 500 },
      ],
      templates: ['文面'],
    })
    expect(result.error).toBe('条件は1〜4個で設定してください')
  })

  it('rejects enabled save with no templates', async () => {
    wireSupabase({ account: { company_id: 'c1', platform: 'threads', auto_reply_config: null } })
    const result = await updateAutoReplyConfig('a1', {
      enabled: true,
      tiers: [{ hours: 1, threshold: 300 }],
      templates: ['   '],
    })
    expect(result.error).toBe('リプ文面を1つ以上入力してください')
  })

  it('keeps existing templates when saving disabled with empty input', async () => {
    let saved: Record<string, unknown> | null = null
    wireSupabase({
      account: {
        company_id: 'c1',
        platform: 'threads',
        auto_reply_config: {
          enabled: true,
          tiers: [{ window_minutes: 60, threshold: 300 }],
          templates: ['既存文面'],
        },
      },
      onUpdate: (args) => { saved = args },
    })
    const result = await updateAutoReplyConfig('a1', { enabled: false, tiers: [], templates: [] })
    expect(result.error).toBeNull()
    expect(saved!.auto_reply_config).toEqual({
      enabled: false,
      tiers: [{ window_minutes: 60, threshold: 300 }],
      templates: ['既存文面'],
    })
  })
})
