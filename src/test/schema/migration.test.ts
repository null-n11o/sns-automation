// @vitest-environment node
/**
 * Migration schema alignment tests
 *
 * These tests verify that the TypeScript types in src/types/index.ts stay
 * consistent with the SQL schema defined in
 * supabase/migrations/20260413000000_initial_schema.sql.
 *
 * They do NOT connect to a real database — they simply parse the migration
 * file and assert that every expected table/column/constraint is present.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../supabase/migrations/20260413000000_initial_schema.sql',
)

let sql: string

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf-8')
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function tableBlock(tableName: string): string {
  // Extract the CREATE TABLE ... ; block for a given table name
  const pattern = new RegExp(
    `CREATE TABLE ${tableName}\\s*\\([\\s\\S]*?\\);`,
    'm',
  )
  const match = sql.match(pattern)
  expect(match, `CREATE TABLE ${tableName} not found in migration`).not.toBeNull()
  return match![0]
}

// ---------------------------------------------------------------------------
// companies
// ---------------------------------------------------------------------------
describe('companies table', () => {
  it('has id, name, created_at columns', () => {
    const block = tableBlock('companies')
    expect(block).toMatch(/\bid\b.*UUID.*PRIMARY KEY/i)
    expect(block).toMatch(/\bname\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\bcreated_at\b.*TIMESTAMPTZ.*NOT NULL/i)
  })
})

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
describe('users table', () => {
  it('has id referencing auth.users', () => {
    const block = tableBlock('users')
    expect(block).toMatch(/\bid\b.*UUID.*PRIMARY KEY.*REFERENCES auth\.users/i)
  })

  it('has company_id, email, role, created_at columns', () => {
    const block = tableBlock('users')
    expect(block).toMatch(/\bcompany_id\b.*UUID.*NOT NULL/i)
    expect(block).toMatch(/\bemail\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\brole\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\bcreated_at\b.*TIMESTAMPTZ.*NOT NULL/i)
  })

  it('constrains role to admin | operator', () => {
    const block = tableBlock('users')
    expect(block).toMatch(/'admin'/)
    expect(block).toMatch(/'operator'/)
  })
})

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------
describe('accounts table', () => {
  it('has id, company_id, platform, account_name columns', () => {
    const block = tableBlock('accounts')
    expect(block).toMatch(/\bid\b.*UUID.*PRIMARY KEY/i)
    expect(block).toMatch(/\bcompany_id\b.*UUID.*NOT NULL/i)
    expect(block).toMatch(/\bplatform\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\baccount_name\b.*TEXT.*NOT NULL/i)
  })

  it('constrains platform to x | threads', () => {
    const block = tableBlock('accounts')
    expect(block).toMatch(/'x'/)
    expect(block).toMatch(/'threads'/)
  })

  it('has nullable credential columns', () => {
    const block = tableBlock('accounts')
    expect(block).toMatch(/\bapi_key\b.*TEXT/i)
    expect(block).toMatch(/\bapi_secret\b.*TEXT/i)
    expect(block).toMatch(/\baccess_token\b.*TEXT/i)
    expect(block).toMatch(/\baccess_token_secret\b.*TEXT/i)
    expect(block).toMatch(/\bplatform_user_id\b.*TEXT/i)
  })

  it('has posting_times as TEXT array', () => {
    const block = tableBlock('accounts')
    expect(block).toMatch(/\bposting_times\b.*TEXT\[\].*NOT NULL/i)
  })
})

// ---------------------------------------------------------------------------
// prompt_configs
// ---------------------------------------------------------------------------
describe('prompt_configs table', () => {
  it('has id, account_id, system_prompt, reference_data, updated_at, updated_by', () => {
    const block = tableBlock('prompt_configs')
    expect(block).toMatch(/\bid\b.*UUID.*PRIMARY KEY/i)
    expect(block).toMatch(/\baccount_id\b.*UUID.*NOT NULL/i)
    expect(block).toMatch(/\bsystem_prompt\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\breference_data\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\bupdated_at\b.*TIMESTAMPTZ.*NOT NULL/i)
    expect(block).toMatch(/\bupdated_by\b.*TEXT.*NOT NULL/i)
  })

  it('constrains updated_by to ai | manual', () => {
    const block = tableBlock('prompt_configs')
    expect(block).toMatch(/'ai'/)
    expect(block).toMatch(/'manual'/)
  })
})

// ---------------------------------------------------------------------------
// posts
// ---------------------------------------------------------------------------
describe('posts table', () => {
  it('has id, account_id, content, scheduled_date, status, source, created_at', () => {
    const block = tableBlock('posts')
    expect(block).toMatch(/\bid\b.*UUID.*PRIMARY KEY/i)
    expect(block).toMatch(/\baccount_id\b.*UUID.*NOT NULL/i)
    expect(block).toMatch(/\bcontent\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\bscheduled_date\b.*DATE.*NOT NULL/i)
    expect(block).toMatch(/\bstatus\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\bsource\b.*TEXT.*NOT NULL/i)
    expect(block).toMatch(/\bcreated_at\b.*TIMESTAMPTZ.*NOT NULL/i)
  })

  it('constrains status to draft | review | ready | published | failed', () => {
    const block = tableBlock('posts')
    expect(block).toMatch(/'draft'/)
    expect(block).toMatch(/'review'/)
    expect(block).toMatch(/'ready'/)
    expect(block).toMatch(/'published'/)
    expect(block).toMatch(/'failed'/)
  })

  it('constrains source to ai | manual', () => {
    const block = tableBlock('posts')
    expect(block).toMatch(/'ai'/)
    expect(block).toMatch(/'manual'/)
  })

  it('has nullable error_message', () => {
    const block = tableBlock('posts')
    expect(block).toMatch(/\berror_message\b.*TEXT/i)
    // Should NOT have NOT NULL
    const errorMsgLine = block.match(/\berror_message\b[^\n,]*/i)?.[0] ?? ''
    expect(errorMsgLine).not.toMatch(/NOT NULL/i)
  })
})

// ---------------------------------------------------------------------------
// post_metrics
// ---------------------------------------------------------------------------
describe('post_metrics table', () => {
  it('has id, post_id, fetched_at, impressions, likes, reposts, replies', () => {
    const block = tableBlock('post_metrics')
    expect(block).toMatch(/\bid\b.*UUID.*PRIMARY KEY/i)
    expect(block).toMatch(/\bpost_id\b.*UUID.*NOT NULL/i)
    expect(block).toMatch(/\bfetched_at\b.*TIMESTAMPTZ.*NOT NULL/i)
    expect(block).toMatch(/\bimpressions\b.*INTEGER.*NOT NULL/i)
    expect(block).toMatch(/\blikes\b.*INTEGER.*NOT NULL/i)
    expect(block).toMatch(/\breposts\b.*INTEGER.*NOT NULL/i)
    expect(block).toMatch(/\breplies\b.*INTEGER.*NOT NULL/i)
  })
})

// ---------------------------------------------------------------------------
// RLS
// ---------------------------------------------------------------------------
describe('Row Level Security', () => {
  const tables = ['companies', 'users', 'accounts', 'prompt_configs', 'posts', 'post_metrics']

  it.each(tables)('enables RLS on %s', (table) => {
    expect(sql).toMatch(
      new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`, 'i'),
    )
  })
})

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
describe('Indexes', () => {
  it('creates index on users.company_id', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON users\(company_id\)/i)
  })

  it('creates index on accounts.company_id', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON accounts\(company_id\)/i)
  })

  it('creates index on posts.account_id', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON posts\(account_id\)/i)
  })

  it('creates index on posts.status', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON posts\(status\)/i)
  })

  it('creates index on posts.scheduled_date', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON posts\(scheduled_date\)/i)
  })

  it('creates index on post_metrics.post_id', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON post_metrics\(post_id\)/i)
  })
})

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
describe('Helper functions', () => {
  it('defines get_my_company_id()', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_my_company_id/i)
    expect(sql).toMatch(/SECURITY DEFINER/i)
  })

  it('defines is_admin()', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION is_admin/i)
  })
})
