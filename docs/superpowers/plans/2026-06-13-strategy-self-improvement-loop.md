# Dober 戦略自己改善ループ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 週次分析レポートを元に Dober の参照実例セットを提案→承認制で進化させ、投稿生成がDBの最新実例を読むフィードバックループを構築する。

**Architecture:** `account_content_strategy` テーブルが account_id ごとの「アクティブな参照実例セット」を version 管理で保持する。新規 `dober-strategy-review` スキルが分析レポートから実例更新を提案・適用し、既存 `dober-content-strategy` は生成時にDBのアクティブ実例を読む。A〜Gフォーマット定義は両スキル共有の `references/formats.md` に切り出す。

**Tech Stack:** Supabase (Postgres + RLS), TypeScript, tsx スクリプト, vitest, Claude Code スキル (Markdown), Supabase MCP。

参照: 設計ドキュメント `docs/superpowers/specs/2026-06-13-strategy-self-improvement-loop-design.md`

**前提となる既存パターン（必読）:**
- マイグレーション: `supabase/migrations/20260612000000_account_analysis_reports.sql`（RLSのcompany_idスコープパターン）
- マイグレーションテスト: `src/test/schema/migration.test.ts`（SQLファイルを正規表現でパースして検証。`// @vitest-environment node` が必須）
- スクリプト＋pure関数テスト: `.claude/skills/account-post-analysis/scripts/analyze.ts` / `analyze-utils.ts` / `analyze-utils.test.ts`（service_roleクライアントで`.env.local`を読む。pure関数を*-utils.tsに分離してテスト）
- 型定義: `src/types/index.ts`（`ScoredPost`, `AnalysisReportData`, `AccountAnalysisReport`）
- Dober account_id: `df3bd84a-b782-4c68-bbee-7697e95decaa`
- Supabase project_id（本番）: `fdmhkjiqsrzktfmbqlxg`
- テスト実行: `npx vitest run <path>`、型チェック: `npx tsc --noEmit`

---

## Task 1: account_content_strategy マイグレーション

**Files:**
- Create: `supabase/migrations/20260613000000_account_content_strategy.sql`
- Test: `src/test/schema/content-strategy-migration.test.ts`

- [ ] **Step 1: マイグレーションテストを書く（失敗するはず）**

`src/test/schema/content-strategy-migration.test.ts`:

```typescript
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/test/schema/content-strategy-migration.test.ts`
Expected: FAIL（マイグレーションファイルが存在しないため `ENOENT`）

- [ ] **Step 3: マイグレーションSQLを書く**

`supabase/migrations/20260613000000_account_content_strategy.sql`:

```sql
-- =============================================================================
-- account_content_strategy: dober-strategy-review が更新する参照実例セット。
-- account_id ごとに version 管理し、is_active=true の1行を投稿生成が参照する。
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_content_strategy (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  version          INTEGER     NOT NULL,
  examples         JSONB       NOT NULL,
  source_report_id UUID        REFERENCES account_analysis_reports(id) ON DELETE SET NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_account_content_strategy_account
  ON account_content_strategy(account_id);

-- アカウントごとアクティブは最大1つ
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_content_strategy_active
  ON account_content_strategy(account_id) WHERE is_active;

-- RLS: account_analysis_reports と同じ company_id スコープ
ALTER TABLE account_content_strategy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_content_strategy: select own company"
  ON account_content_strategy FOR SELECT TO authenticated
  USING (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );

CREATE POLICY "account_content_strategy: insert own company"
  ON account_content_strategy FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );

CREATE POLICY "account_content_strategy: update own company"
  ON account_content_strategy FOR UPDATE TO authenticated
  USING (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  )
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/test/schema/content-strategy-migration.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 5: 本番Supabaseにマイグレーションを適用**

`mcp__supabase__apply_migration` を `project_id: fdmhkjiqsrzktfmbqlxg`, `name: account_content_strategy`, `query: <Step3のSQL全文>` で実行する。
その後 `mcp__supabase__list_tables`（project_id同上）で `account_content_strategy` が存在することを確認する。

- [ ] **Step 6: コミット**

```bash
git add supabase/migrations/20260613000000_account_content_strategy.sql src/test/schema/content-strategy-migration.test.ts
git commit -m "feat: account_content_strategyテーブルを追加"
```

---

## Task 2: TypeScript型定義

**Files:**
- Modify: `src/types/index.ts`（`AccountAnalysisReport` の定義の直後、145行目付近に追記）

- [ ] **Step 1: 型を追記する**

`src/types/index.ts` の `AccountAnalysisReport` インターフェース定義の直後に以下を追加:

```typescript
export interface StrategyExampleMetrics {
  impressions: number
  likes: number
  follows?: number
  replies?: number
  reposts?: number
}

export interface StrategyExample {
  format: string // A〜G
  title: string
  content: string
  metrics: StrategyExampleMetrics
  score: number
  rationale: string
}

export interface AccountContentStrategy {
  id: string
  account_id: string
  version: number
  examples: StrategyExample[]
  source_report_id: string | null
  is_active: boolean
  created_at: string
  activated_at: string | null
}
```

- [ ] **Step 2: 型チェックを実行して成功を確認**

Run: `npx tsc --noEmit`
Expected: エラーなし（exit 0）

- [ ] **Step 3: コミット**

```bash
git add src/types/index.ts
git commit -m "feat: StrategyExample/AccountContentStrategy型を追加"
```

---

## Task 3: strategy-utils.ts（pure関数）+ テスト

**Files:**
- Create: `.claude/skills/dober-strategy-review/scripts/strategy-utils.ts`
- Test: `.claude/skills/dober-strategy-review/scripts/strategy-utils.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`.claude/skills/dober-strategy-review/scripts/strategy-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseApplyArgs, validateExamples, nextVersion } from './strategy-utils'
import type { StrategyExample } from '../../../../src/types'

const validExample: StrategyExample = {
  format: 'A',
  title: '▫️見出し',
  content: '本文',
  metrics: { impressions: 100, likes: 10 },
  score: 123.4,
  rationale: '理由',
}

describe('parseApplyArgs', () => {
  it('アカウント名とexamplesパスを解釈する', () => {
    expect(parseApplyArgs(['Dober', 'examples.json'])).toEqual({
      accountQuery: 'Dober',
      examplesPath: 'examples.json',
      sourceReportId: undefined,
    })
  })

  it('--source-report でレポートIDを受け取る', () => {
    expect(parseApplyArgs(['Dober', 'examples.json', '--source-report', 'rep-1'])).toEqual({
      accountQuery: 'Dober',
      examplesPath: 'examples.json',
      sourceReportId: 'rep-1',
    })
  })

  it('アカウント名が無い場合はエラー', () => {
    expect(() => parseApplyArgs([])).toThrow('アカウント名を指定してください')
  })

  it('examplesパスが無い場合はエラー', () => {
    expect(() => parseApplyArgs(['Dober'])).toThrow('examples JSONのパスを指定してください')
  })
})

describe('nextVersion', () => {
  it('既存が無ければ1を返す', () => {
    expect(nextVersion(null)).toBe(1)
  })
  it('既存の最大versionに1を足す', () => {
    expect(nextVersion(3)).toBe(4)
  })
})

describe('validateExamples', () => {
  it('正しい配列はそのまま返す', () => {
    expect(validateExamples([validExample])).toEqual([validExample])
  })
  it('配列でなければエラー', () => {
    expect(() => validateExamples({} as unknown)).toThrow('examples は配列である必要があります')
  })
  it('空配列はエラー', () => {
    expect(() => validateExamples([])).toThrow('examples が空です')
  })
  it('必須フィールド欠如はエラー', () => {
    const bad = { ...validExample, content: '' }
    expect(() => validateExamples([bad])).toThrow(/content/)
  })
  it('metricsにimpressions/likesが無ければエラー', () => {
    const bad = { ...validExample, metrics: { impressions: 1 } as unknown }
    expect(() => validateExamples([bad])).toThrow(/metrics/)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run .claude/skills/dober-strategy-review/scripts/strategy-utils.test.ts`
Expected: FAIL（`strategy-utils` モジュールが存在しない）

- [ ] **Step 3: strategy-utils.ts を実装**

`.claude/skills/dober-strategy-review/scripts/strategy-utils.ts`:

```typescript
import type { StrategyExample } from '../../../../src/types'

export interface ApplyArgs {
  accountQuery: string
  examplesPath: string
  sourceReportId: string | undefined
}

export function parseApplyArgs(argv: string[]): ApplyArgs {
  const positional: string[] = []
  let sourceReportId: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source-report') {
      sourceReportId = argv[i + 1]
      i++
    } else {
      positional.push(argv[i])
    }
  }
  if (positional.length < 1) throw new Error('アカウント名を指定してください')
  if (positional.length < 2) throw new Error('examples JSONのパスを指定してください')
  return { accountQuery: positional[0], examplesPath: positional[1], sourceReportId }
}

export function nextVersion(currentMax: number | null): number {
  return currentMax == null ? 1 : currentMax + 1
}

export function validateExamples(data: unknown): StrategyExample[] {
  if (!Array.isArray(data)) throw new Error('examples は配列である必要があります')
  if (data.length === 0) throw new Error('examples が空です')
  data.forEach((e, i) => {
    const prefix = `examples[${i}]`
    if (typeof e?.format !== 'string' || e.format.length === 0) throw new Error(`${prefix}.format が不正です`)
    if (typeof e?.title !== 'string') throw new Error(`${prefix}.title が不正です`)
    if (typeof e?.content !== 'string' || e.content.length === 0) throw new Error(`${prefix}.content が不正です`)
    if (typeof e?.score !== 'number') throw new Error(`${prefix}.score が不正です`)
    if (typeof e?.rationale !== 'string') throw new Error(`${prefix}.rationale が不正です`)
    const m = e?.metrics
    if (typeof m?.impressions !== 'number' || typeof m?.likes !== 'number') {
      throw new Error(`${prefix}.metrics には impressions と likes が必要です`)
    }
  })
  return data as StrategyExample[]
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run .claude/skills/dober-strategy-review/scripts/strategy-utils.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add .claude/skills/dober-strategy-review/scripts/strategy-utils.ts .claude/skills/dober-strategy-review/scripts/strategy-utils.test.ts
git commit -m "feat: dober-strategy-reviewのpure関数(strategy-utils)を追加"
```

---

## Task 4: apply-strategy.ts（DB書込みスクリプト）

**Files:**
- Create: `.claude/skills/dober-strategy-review/scripts/apply-strategy.ts`

I/O処理のためユニットテストは持たず、Task 6のシード実行で実DBに対して動作検証する。pure関数はTask 3でテスト済み。

- [ ] **Step 1: apply-strategy.ts を実装**

`.claude/skills/dober-strategy-review/scripts/apply-strategy.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { parseApplyArgs, validateExamples, nextVersion } from './strategy-utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../../..')

async function main() {
  const envPath = path.join(REPO_ROOT, '.env.local')
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath)

  const { accountQuery, examplesPath, sourceReportId } = parseApplyArgs(process.argv.slice(2))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません')
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // examples JSON 読込み・検証
  const raw = JSON.parse(fs.readFileSync(path.resolve(examplesPath), 'utf-8'))
  const examples = validateExamples(raw)

  // アカウント特定
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, account_name')
    .ilike('account_name', `%${accountQuery}%`)
  if (accErr) throw new Error(`アカウント検索エラー: ${accErr.message}`)
  if (!accounts || accounts.length === 0) {
    console.error(`アカウントが見つかりません: "${accountQuery}"`)
    process.exit(1)
  }
  if (accounts.length > 1) {
    console.error(`複数該当: ${accounts.map((a) => a.account_name).join(', ')}`)
    process.exit(1)
  }
  const account = accounts[0]

  // 現在の最大version取得
  const { data: maxRow, error: maxErr } = await supabase
    .from('account_content_strategy')
    .select('version')
    .eq('account_id', account.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw new Error(`version取得エラー: ${maxErr.message}`)
  const newVersion = nextVersion(maxRow?.version ?? null)

  // 旧アクティブを無効化（部分ユニークインデックスを壊さないため先に実行）
  const { error: deactErr } = await supabase
    .from('account_content_strategy')
    .update({ is_active: false })
    .eq('account_id', account.id)
    .eq('is_active', true)
  if (deactErr) throw new Error(`旧バージョン無効化エラー: ${deactErr.message}`)

  // 新バージョンをアクティブで挿入
  const { data: inserted, error: insErr } = await supabase
    .from('account_content_strategy')
    .insert({
      account_id: account.id,
      version: newVersion,
      examples,
      source_report_id: sourceReportId ?? null,
      is_active: true,
      activated_at: new Date().toISOString(),
    })
    .select('id, version')
    .single()
  if (insErr) throw new Error(`挿入エラー: ${insErr.message}`)

  console.log(`✅ 戦略を更新しました (account: ${account.account_name}, version: ${inserted.version}, id: ${inserted.id}, examples: ${examples.length}件)`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
```

- [ ] **Step 2: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラーなし（exit 0）

- [ ] **Step 3: コミット**

```bash
git add .claude/skills/dober-strategy-review/scripts/apply-strategy.ts
git commit -m "feat: 戦略をDBに適用するapply-strategyスクリプトを追加"
```

---

## Task 5: 共有フォーマット定義 references/formats.md を切り出す

**Files:**
- Create: `.claude/skills/dober-content-strategy/references/formats.md`

`dober-content-strategy` と `dober-strategy-review` の両方が参照する、A〜Gフォーマット定義の単一の真実源。現在 `dober-content-strategy/SKILL.md` の27〜39行目にある「## 高パフォーマンスなコンテンツフォーマット」テーブルを移設する（SKILL.md側の削除はTask 8）。

- [ ] **Step 1: formats.md を作成**

`.claude/skills/dober-content-strategy/references/formats.md`:

```markdown
# Dober コンテンツフォーマット定義（共有）

`dober-content-strategy`（投稿生成）と `dober-strategy-review`（実例の分類・更新提案）が共通で参照するA〜Gフォーマットの定義。投稿の分類・生成はすべてこの7区分に基づく。

CSVの全投稿をスコアリング（follows×50 + engagement×10 + log(impressions)）して抽出した、再現性の高い7フォーマット。

| 区分 | フォーマット | 概要 |
|------|------------|------|
| A | 規律リスト型 | 「静かに人生を変える男のルール」など。箇条書きで規律・習慣を列挙し、結論を付けない/最小限にする |
| B | 数字タイトル型「◯つの〜」 | 「人生が変わる瞬間に共通する5つのこと」など、数字を含むリスト形式タイトル |
| C | アルファ/シグマ フレームワーク型 | 「アルファ」と「シグマ」など男性アーキタイプを対比させる構成 |
| D | 資本主義/お金の構造論 | 「資産」と「負債」など、お金・労働・資本の構造的な対比論 |
| E | 有名人逸話型 | イチロー、大谷翔平、ブルース・リーなど実在の有名人の逸話から教訓を導く |
| F | 短文断定型 | タイトル装飾なし、数行の短い断定文で構成。対比構造（「Aする人は〜。Bする人は〜。」）が多い |
| G | メンタル系 | 「鬱から抜け出す方法」など再現性の高いメンタルヘルステーマ |
```

- [ ] **Step 2: コミット**

```bash
git add .claude/skills/dober-content-strategy/references/formats.md
git commit -m "feat: A〜Gフォーマット定義を共有references/formats.mdに切り出し"
```

---

## Task 6: version=1 のシード投入

**Files:**
- Create: `.claude/skills/dober-strategy-review/seed/version1-examples.json`

現在 `dober-content-strategy/SKILL.md` の「## 高パフォーマンス投稿例（TOP20）」ブロック（41〜301行目）にある実例を、`StrategyExample` 形式のJSON配列に転記し、Task 4の `apply-strategy.ts` で version=1 として投入する。これにより既存の生成品質を維持したままDBベースへ移行する。

**転記ルール（SKILL.mdの各実例ブロックから機械的に変換）:**
- `### X: <ラベル>` の見出し先頭文字（A〜G）→ `format`
- コードブロック内の1行目 → `title`
- コードブロック全体 → `content`
- 直後の `(imp=... / likes=... / follows=...)` 行 → `metrics.impressions` / `metrics.likes` / `metrics.follows`
- `score` = `follows*50 + likes*10 + Math.round(Math.log(impressions))`（並び替えヒント。手計算で算出）
- `rationale` = そのフォーマットの特徴を1文で記述（例: 「規律リスト型。follows寄与が大きく再現性が高い」）

- [ ] **Step 1: version1-examples.json を作成**

`.claude/skills/dober-strategy-review/seed/version1-examples.json`。SKILL.md 41〜301行目の全20実例を上記ルールで転記する。最初の3件の完成形を以下に示す（残り17件も同じ形式で、SKILL.mdの各 `### X:` ブロックから転記する）:

```json
[
  {
    "format": "F",
    "title": "お金持ちになろう。",
    "content": "お金持ちになろう。\nしかし、お金の話はしないように。\n\n鍛えよう。\nしかし、筋トレの話はしないように。\n\n賢くなろう。\nしかし、本を読んでいるという話はしないように。\n\n男であるなら、興奮して何かを自慢することはやめよう。\n静かに、目立たずに進む。",
    "metrics": { "impressions": 31466, "likes": 762, "follows": 64 },
    "score": 10831,
    "rationale": "短文断定型。対比構造でfollows寄与が非常に高い"
  },
  {
    "format": "A",
    "title": "▫️人生をイージーモードにする方法は規律",
    "content": "▫️人生をイージーモードにする方法は規律\n・オナ禁(エネルギー節約、集中力向上)\n・砂糖禁\n・細胞が依存するように水分補給\n・当たり前のように筋トレ\n・賢くパーティー(二日酔い=人生の無駄)\n・身だしなみを整える\n・静かに金を積み上げる\n・良い匂いをまとう\n・価値のある時だけ話す(沈黙=威厳)",
    "metrics": { "impressions": 78472, "likes": 526, "follows": 56 },
    "score": 8071,
    "rationale": "規律リスト型。高インプレッション×高follows、当該フォーマットの代表例"
  },
  {
    "format": "A",
    "title": "▫️トップ1%の男になる方法",
    "content": "▫️トップ1%の男になる方法\n\n・AVを断つ\n・水を3リットル飲む\n・瞑想する\n・タンパク質を摂る\n・本を読む\n・砂糖を避ける\n・毎日運動する\n・自分の事業を作る\n・ジャンクフードを避ける\n・人脈作りを始める\n・格闘技を学ぶ\n・ニュースを見るのをやめる\n・毎日1万歩歩く\n\nあなたなら、何を付け加えますか？",
    "metrics": { "impressions": 56288, "likes": 373, "follows": 43 },
    "score": 5891,
    "rationale": "規律リスト型（問いかけ終わり）。エンゲージメント誘発が効いている"
  }
]
```

残り17件（B:1,152,521のもの／C:アルファ・シグマ／B:真実列挙／G:鬱から抜け出す／B/G:悪癖→影響／C:対比表／B:趣味分類／D:金持ちになれない理由／B:価値の高い女性／D:現代男性の4つの困難／F/G:覚悟論／F:自問自答ジム／B/G:テストステロン／B:変化のビフォーアフター 等）を同形式で `dober-content-strategy/SKILL.md` の47〜301行目から転記する。

- [ ] **Step 2: JSONの妥当性を確認**

Run: `node -e "const a=require('./.claude/skills/dober-strategy-review/seed/version1-examples.json'); console.log('examples:', a.length)"`
Expected: `examples: 20`（転記した件数）

- [ ] **Step 3: apply-strategy.ts でシード投入**

Run:
```bash
npx tsx .claude/skills/dober-strategy-review/scripts/apply-strategy.ts "Dober" .claude/skills/dober-strategy-review/seed/version1-examples.json
```
Expected: `✅ 戦略を更新しました (account: ..., version: 1, id: ..., examples: 20件)`

- [ ] **Step 4: DBに反映されたことを確認**

`mcp__supabase__execute_sql`（project_id: fdmhkjiqsrzktfmbqlxg）で実行:
```sql
SELECT version, is_active, jsonb_array_length(examples) AS n
FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa';
```
Expected: 1行、`version=1, is_active=true, n=20`

- [ ] **Step 5: コミット**

```bash
git add .claude/skills/dober-strategy-review/seed/version1-examples.json
git commit -m "feat: Dober戦略のversion1シードデータを追加・投入"
```

---

## Task 7: dober-strategy-review スキルを作成

**Files:**
- Create: `.claude/skills/dober-strategy-review/SKILL.md`

- [ ] **Step 1: SKILL.md を作成**

`.claude/skills/dober-strategy-review/SKILL.md`:

```markdown
---
name: dober-strategy-review
description: Threadsアカウント「Dober」(@dober_fullstack)の週次パフォーマンスを振り返り、参照実例セット(account_content_strategy)の更新を提案・適用する。「Doberの今週の振り返り」「Doberの戦略を更新して」のように起動する。提案→ユーザー承認→DB適用の流れ。
---

# dober-strategy-review

Dober (account_id: `df3bd84a-b782-4c68-bbee-7697e95decaa`) の最新分析レポートを元に、投稿生成が参照する「実例セット」を進化させる。直近で伸びた投稿を高パフォーマンス実例としてA〜Gフォーマットに分類し、現行セットとの差分をユーザーに提示し、承認後に新バージョンとしてDBへ適用する。

フォーマット定義（A〜G）は `../dober-content-strategy/references/formats.md` を参照する。

## 実行手順

### Step 1: 最新の分析レポートを確認する

`mcp__supabase__execute_sql`（project_id: `fdmhkjiqsrzktfmbqlxg`）で最新レポートを取得する:

```sql
SELECT id, generated_at, report_data, insights
FROM account_analysis_reports
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa'
ORDER BY generated_at DESC
LIMIT 1;
```

- レポートが存在しない、または `generated_at` が7日より古い場合は、`account-post-analysis` スキルを実行して最新レポートを生成するようユーザーに促す（「最新レポートが無い/古いので先に分析しますか？」）。
- 取得した `report_data.summary.topByImpressions` / `topByEngagement` が高パフォーマンス投稿の候補。`insights.next_actions` は補足の方向性として読む。

### Step 2: 高パフォーマンス投稿をA〜Gに分類する

`../dober-content-strategy/references/formats.md` のA〜G定義に従い、Step 1で得たTOP投稿（重複除外）を各フォーマットに分類し、採用理由(rationale)を付ける。フォーマットが偏らないよう、できるだけ複数区分から選定する（目安: 計15〜20件）。

各実例は以下の `StrategyExample` 形式にする:

- `format`: A〜Gのいずれか
- `title`: 投稿本文の先頭行
- `content`: 投稿本文全体（report_dataの `content`）
- `metrics`: `{ impressions, likes, replies, reposts }`（report_dataの数値。follows はレポートに無いため省略可）
- `score`: `likes*10 + replies*5 + reposts*5 + Math.round(Math.log(impressions))`（並び替えヒント）
- `rationale`: なぜこの実例を参照に採用するか1文

### Step 3: 現行セットとの差分を提示する

現在アクティブな実例を取得する:

```sql
SELECT id, version, examples
FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' AND is_active = true;
```

現行 `examples` とStep 2の新セットを比較し、差分を提示する:
- ✅ 追加（今週伸びた新規実例）
- ❌ 除外（鮮度が落ちた/より良い実例に置き換える）
- ➖ 維持（引き続き参照する定番実例）

併せて、`insights.next_actions` の要約を「今週の所感」として添える。

### Step 4: ユーザー承認後にDBへ適用する

ユーザーが承認（または修正指示）したら、確定した新セットを一時JSONファイルに書き出し、`apply-strategy.ts` で適用する:

```bash
npx tsx .claude/skills/dober-strategy-review/scripts/apply-strategy.ts "Dober" /tmp/dober-strategy-new.json --source-report <Step1のレポートID>
```

成功メッセージ（新version・id・件数）をユーザーに報告し、次回以降の `dober-content-strategy` による生成にこの実例が反映される旨を伝える。
```

- [ ] **Step 2: コミット**

```bash
git add .claude/skills/dober-strategy-review/SKILL.md
git commit -m "feat: dober-strategy-reviewスキルを追加"
```

---

## Task 8: dober-content-strategy を DB読込みに改修

**Files:**
- Modify: `.claude/skills/dober-content-strategy/SKILL.md`

目的: ①フォーマット定義テーブルを `references/formats.md` 参照に置換、②肥大なTOP20実例ブロック（41〜301行目）を削除、③Step 2でDBのアクティブ実例を読む手順を追加。文体ルールはSKILL.mdに残す（生成の必須ルールのため）。

- [ ] **Step 1: フォーマット定義テーブルを参照に置換**

SKILL.md の「## 高パフォーマンスなコンテンツフォーマット」見出し〜その直下のテーブル（27〜39行目）を、以下に置き換える:

```markdown
## 高パフォーマンスなコンテンツフォーマット

A〜Gの7フォーマット定義は `references/formats.md` を参照する（`dober-strategy-review` と共有）。新規投稿作成時はこれらをバランスよく組み合わせる。
```

- [ ] **Step 2: TOP20実例ブロックを削除**

SKILL.md の「## 高パフォーマンス投稿例（TOP20）」見出しから、その最後の実例ブロック（`(imp=26,900 / likes=233 / follows=16)` の行）までを丸ごと削除する。実例はDB（`account_content_strategy`）が単一の真実源になる。

- [ ] **Step 3: Step 2 にDB読込み手順を追加**

「### Step 2: 投稿内容を作成する」の本文を以下に置き換える:

```markdown
### Step 2: 投稿内容を作成する

まず、現在アクティブな参照実例セットをDBから読み込む。`mcp__supabase__execute_sql`（project_id: `fdmhkjiqsrzktfmbqlxg`）で実行:

\`\`\`sql
SELECT version, examples
FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' AND is_active = true;
\`\`\`

取得した `examples`（A〜Gに分類された高パフォーマンス実例）を文体・構成のリファレンスとする。これらは `dober-strategy-review` により毎週更新される。

- 対象期間の投稿数を `references/formats.md` の7フォーマットに分配する（偏りなくバランスよく）。直近で使用したフォーマット・テーマと重複しないよう、`mcp__nexauto__list_posts`で直近の投稿を確認してから作成する。
- 各投稿は下記「文体ルール」に従う。
```

- [ ] **Step 4: 文体ルール見出しの位置を確認**

「## 文体ルール（厳守）」セクションはSKILL.md内に残す（削除しない）。Step 3の本文から「文体ルール」を参照できることを目視確認する。

- [ ] **Step 5: スキルの整合性を目視確認**

Run: `npx tsx -e "const fs=require('fs'); const s=fs.readFileSync('.claude/skills/dober-content-strategy/SKILL.md','utf-8'); console.log('TOP20 block removed:', !s.includes('高パフォーマンス投稿例')); console.log('references formats:', s.includes('references/formats.md')); console.log('DB read:', s.includes('account_content_strategy'));"`
Expected: 3つとも `true`

- [ ] **Step 6: コミット**

```bash
git add .claude/skills/dober-content-strategy/SKILL.md
git commit -m "refactor: dober-content-strategyをDB実例読込みに改修しTOP20を削除"
```

---

## Task 9: 全体検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テストを実行**

Run: `npx vitest run`
Expected: 全テストPASS（新規のマイグレーションテスト・strategy-utilsテストを含む）

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし（exit 0）

- [ ] **Step 3: 実スキルでの読込み検証（dober-content-strategy）**

`mcp__supabase__execute_sql`（project_id: fdmhkjiqsrzktfmbqlxg）で:
```sql
SELECT version, jsonb_array_length(examples) AS n, is_active
FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' AND is_active = true;
```
Expected: 1行 `version=1, n=20, is_active=true`。dober-content-strategyのStep 2クエリが同じSQLで実例を取得できることを確認。

- [ ] **Step 4: apply-strategyの冪等性・version増分を検証（任意）**

同じシードJSONで `apply-strategy.ts` を再実行し、version=2 がアクティブ・version=1 が `is_active=false` になること、アクティブ行が1つだけであることを確認:
```sql
SELECT version, is_active FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' ORDER BY version;
```
Expected: version=1（is_active=false）, version=2（is_active=true）。確認後、検証用のversion=2は不要なら削除し version=1 をアクティブに戻す:
```sql
DELETE FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' AND version = 2;
UPDATE account_content_strategy SET is_active = true
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' AND version = 1;
```

- [ ] **Step 5: 完了報告とPR**

実装完了。CLAUDE.mdのGit Workflowに従い、ここまでのコミットを `git push` し Pull Request を作成する。
```

---

## 自己レビュー結果

**スペックカバレッジ:**
- `account_content_strategy` テーブル（version管理・RLS・アクティブ一意制約）→ Task 1 ✅
- 型定義 → Task 2 ✅
- 戦略書込みスクリプト（提案→承認後に適用、SQLエスケープ回避）→ Task 3+4 ✅
- 共有 formats.md 切り出し → Task 5 ✅
- version=1 シード（既存TOP20移植）→ Task 6 ✅
- dober-strategy-review スキル（分析→分類→差分→承認→適用）→ Task 7 ✅
- dober-content-strategy のDB読込み改修・TOP20削除 → Task 8 ✅
- テスト戦略（マイグレーション・RLS・実スキル読込み・一意制約）→ Task 1, 3, 9 ✅
- 手動起動 / 提案→承認制 → Task 7 のStep設計に反映 ✅
- 新規MCPツールを作らない（execute_sql利用）→ 全タスクで遵守 ✅

**プレースホルダ:** Task 6のシードJSONは「既存ファイルからの機械的転記」であり、変換ルールと3件の完成形・残り17件の出典行を明示。コードロジックの未定義は無し。

**型整合性:** `StrategyExample`（Task 2定義）を `strategy-utils.ts`（Task 3）・`apply-strategy.ts`（Task 4）・シードJSON（Task 6）・両スキルが一貫して使用。`parseApplyArgs`/`validateExamples`/`nextVersion` の名前・シグネチャはTask 3定義とTask 4使用で一致。
