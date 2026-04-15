// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Supabase mock setup ----
const mockInsert = vi.fn()
const mockDelete = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()

// Chain builder: supports .select().eq().single() and .from().insert() / .from().delete().eq()
function makeQueryBuilder(finalResult: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(finalResult),
    insert: vi.fn().mockResolvedValue(finalResult),
    delete: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }
  return chain
}

const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

// Mock @/lib/supabase/server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabaseClient),
  createServiceClient: vi.fn().mockResolvedValue(mockSupabaseClient),
}))

// Mock next/cache
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Use real crypto (covers actual encryption)
process.env.ENCRYPTION_KEY = 'b'.repeat(64)

// Import actions after mocks are registered
const { createAccount, deleteAccount } = await import(
  '@/app/(dashboard)/accounts/actions'
)

describe('account actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createAccount', () => {
    it('returns error when platform or account_name is missing', async () => {
      const fd = new FormData()
      fd.set('account_name', 'TestAccount')
      // no platform
      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      mockSupabaseClient.from.mockReturnValue(makeQueryBuilder({ data: { role: 'admin', company_id: 'c1' }, error: null }))
      const result = await createAccount(fd)
      expect(result.error).toBe('プラットフォームとアカウント名は必須です')
    })

    it('returns error for non-admin user', async () => {
      const fd = new FormData()
      fd.set('platform', 'x')
      fd.set('account_name', 'TestAccount')

      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      // profile query returns operator role
      const profileBuilder = makeQueryBuilder({ data: { role: 'operator', company_id: 'c1' }, error: null })
      mockSupabaseClient.from.mockReturnValue(profileBuilder)

      const result = await createAccount(fd)
      expect(result.error).toBe('管理者権限が必要です')
    })

    it('encrypts API credentials before inserting', async () => {
      const fd = new FormData()
      fd.set('platform', 'x')
      fd.set('account_name', 'MyXAccount')
      fd.set('posting_times', '09:00, 18:00')
      fd.set('api_key', 'raw-api-key')
      fd.set('api_secret', 'raw-api-secret')
      fd.set('access_token', 'raw-access-token')
      fd.set('access_token_secret', 'raw-access-token-secret')

      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

      let insertCallArgs: Record<string, unknown> | null = null
      const profileBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role: 'admin', company_id: 'cid-1' }, error: null }),
      }
      const insertBuilder = {
        insert: vi.fn().mockImplementation((args: Record<string, unknown>) => {
          insertCallArgs = args
          return Promise.resolve({ error: null })
        }),
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'users') return profileBuilder
        if (table === 'accounts') return insertBuilder
        return makeQueryBuilder({ data: null, error: null })
      })

      const result = await createAccount(fd)
      expect(result.error).toBeNull()
      expect(insertCallArgs).not.toBeNull()

      // Verify credentials were encrypted (not stored as plain text)
      expect(insertCallArgs!.api_key).not.toBe('raw-api-key')
      expect(insertCallArgs!.api_secret).not.toBe('raw-api-secret')
      expect(insertCallArgs!.access_token).not.toBe('raw-access-token')
      expect(insertCallArgs!.access_token_secret).not.toBe('raw-access-token-secret')

      // Verify encrypted format: iv:authTag:ciphertext
      expect((insertCallArgs!.api_key as string).split(':')).toHaveLength(3)

      // Verify other fields
      expect(insertCallArgs!.platform).toBe('x')
      expect(insertCallArgs!.account_name).toBe('MyXAccount')
      expect(insertCallArgs!.posting_times).toEqual(['09:00', '18:00'])
    })

    it('stores null when API credentials are empty', async () => {
      const fd = new FormData()
      fd.set('platform', 'threads')
      fd.set('account_name', 'ThreadsAccount')
      // no API credentials

      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

      let insertCallArgs: Record<string, unknown> | null = null
      const profileBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role: 'admin', company_id: 'cid-1' }, error: null }),
      }
      const insertBuilder = {
        insert: vi.fn().mockImplementation((args: Record<string, unknown>) => {
          insertCallArgs = args
          return Promise.resolve({ error: null })
        }),
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'users') return profileBuilder
        if (table === 'accounts') return insertBuilder
        return makeQueryBuilder({ data: null, error: null })
      })

      const result = await createAccount(fd)
      expect(result.error).toBeNull()
      expect(insertCallArgs!.api_key).toBeNull()
      expect(insertCallArgs!.api_secret).toBeNull()
      expect(insertCallArgs!.access_token).toBeNull()
      expect(insertCallArgs!.access_token_secret).toBeNull()
    })
  })

  describe('deleteAccount', () => {
    it('returns error for non-admin user', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      const profileBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role: 'operator', company_id: 'c1' }, error: null }),
      }
      mockSupabaseClient.from.mockReturnValue(profileBuilder)

      const result = await deleteAccount('account-id')
      expect(result.error).toBe('管理者権限が必要です')
    })

    it('returns error when account belongs to different company', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

      const profileBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role: 'admin', company_id: 'company-A' }, error: null }),
      }
      const accountBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { company_id: 'company-B' }, error: null }),
      }

      let callCount = 0
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++
        return callCount === 1 ? profileBuilder : accountBuilder
      })

      const result = await deleteAccount('account-id')
      expect(result.error).toBe('操作権限がありません')
    })
  })
})
