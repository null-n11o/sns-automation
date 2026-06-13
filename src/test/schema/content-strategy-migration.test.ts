// @vitest-environment node
/**
 * account_content_strategy マイグレーションのスキーマ整合テスト。
 * DBには接続せず、SQLファイルをパースして期待するカラム/制約/RLSの存在を検証する。
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../supabase/migrations/20260613000000_account_content_strategy.sql',
)

let sql: string

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf-8')
})

function tableBlock(tableName: string): string {
  const pattern = new RegExp(`CREATE TABLE[\\s\\S]*?${tableName}\\s*\\([\\s\\S]*?\\);`, 'm')
  const match = sql.match(pattern)
  expect(match, `CREATE TABLE ${tableName} not found`).not.toBeNull()
  return match![0]
}

describe('account_content_strategy table', () => {
  it('has id, account_id, version, examples, source_report_id, is_active, created_at, activated_at', () => {
    const block = tableBlock('account_content_strategy')
    expect(block).toMatch(/\bid\b.*UUID.*PRIMARY KEY/i)
    expect(block).toMatch(/\baccount_id\b.*UUID.*NOT NULL.*REFERENCES accounts/i)
    expect(block).toMatch(/\bversion\b.*INTEGER.*NOT NULL/i)
    expect(block).toMatch(/\bexamples\b.*JSONB.*NOT NULL/i)
    expect(block).toMatch(/\bsource_report_id\b.*UUID.*REFERENCES account_analysis_reports/i)
    expect(block).toMatch(/\bis_active\b.*BOOLEAN.*NOT NULL/i)
    expect(block).toMatch(/\bcreated_at\b.*TIMESTAMPTZ.*NOT NULL/i)
    expect(block).toMatch(/\bactivated_at\b.*TIMESTAMPTZ/i)
  })
})

describe('Row Level Security', () => {
  it('enables RLS on account_content_strategy', () => {
    expect(sql).toMatch(/ALTER TABLE account_content_strategy\s+ENABLE ROW LEVEL SECURITY/i)
  })
  it('scopes policies by company via accounts/get_my_company_id', () => {
    expect(sql).toMatch(/get_my_company_id\(\)/)
  })
})

describe('Indexes', () => {
  it('creates unique partial index for one active row per account', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*account_content_strategy\s*\(account_id\)[\s\S]*WHERE is_active/i)
  })
  it('creates index on account_id', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON account_content_strategy\(account_id\)/i)
  })
})
