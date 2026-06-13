# account-post-analysis レポートDB化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `account-post-analysis`スキルが生成する分析レポートをMarkdownファイルではなくSupabaseのDB（`account_analysis_reports`テーブル）にJSON形式で保存し、ダッシュボードUIとMCPサーバーから閲覧・取得できるようにする。

**Architecture:** `analyze.ts`が集計データ(`report_data`)をJSONとしてDBにINSERTし、レコードIDとJSONを標準出力に返す。SKILL.mdはそのJSONからインサイト分析を生成し、Supabase MCPの`execute_sql`で同レコードを`insights`列にUPDATEする。ダッシュボードに`/analytics/reports`（一覧）・`/analytics/reports/[id]`（詳細）ページを追加し、`packages/mcp-server`に`list_analysis_reports`ツールを追加する。

**Tech Stack:** Next.js (App Router) / Supabase (Postgres, RLS) / TypeScript / vitest / @modelcontextprotocol/sdk

参照spec: `docs/superpowers/specs/2026-06-12-account-analysis-reports-db-design.md`

---

## 設計上の補足（specからの軽微な調整）

- spec内の`buildReportData()`は単純なオブジェクト組み立てのみのため、専用関数を作らず`analyze.ts`内で直接`AnalysisReportData`型オブジェクトを構築する（YAGNI）。
- `AnalysisSummary` / `ScoredPost` / `WeeklyTrendRow`型は、ダッシュボードとスキルスクリプトの両方から参照する共有型として`src/types/index.ts`に移動する。

---

### Task 1: DBマイグレーション追加・適用

**Files:**
- Create: `supabase/migrations/20260612000000_account_analysis_reports.sql`

- [ ] **Step 1: マイグレーションファイルを作成する**

```sql
-- =============================================================================
-- account_analysis_reports: account-post-analysisスキルが生成する分析レポート
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_analysis_reports (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  days_recent           INTEGER     NOT NULL,
  report_data           JSONB       NOT NULL,
  insights              JSONB,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  insights_generated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_account_analysis_reports_account
  ON account_analysis_reports(account_id);

CREATE INDEX IF NOT EXISTS idx_account_analysis_reports_generated_at
  ON account_analysis_reports(generated_at);

-- RLS: account_analysis_reports
ALTER TABLE account_analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_analysis_reports: select own company"
  ON account_analysis_reports FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "account_analysis_reports: insert own company"
  ON account_analysis_reports FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "account_analysis_reports: update own company"
  ON account_analysis_reports FOR UPDATE TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );
```

- [ ] **Step 2: Supabase MCPでマイグレーションを適用する**

`mcp__supabase__apply_migration` ツールを使い、`project_id: fdmhkjiqsrzktfmbqlxg`、`name: account_analysis_reports`、`query`に上記SQLを渡して適用する。

- [ ] **Step 3: テーブルが作成されたことを確認する**

`mcp__supabase__list_tables` で`account_analysis_reports`がpublicスキーマに存在し、RLSが有効になっていることを確認する。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260612000000_account_analysis_reports.sql
git commit -m "feat: account_analysis_reportsテーブルのマイグレーションを追加"
```

---

### Task 2: 共有型定義の追加とanalyze-utils.tsのMarkdown関連処理削除

**Files:**
- Modify: `src/types/index.ts`
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.ts`
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`

- [ ] **Step 1: `src/types/index.ts`に共有型を追加する**

ファイル末尾（`PostMetrics`インターフェースの後）に以下を追加する。

```ts

export interface ScoredPost {
  id: string
  content: string
  scheduledDate: string
  publishedAt: string
  impressions: number
  likes: number
  replies: number
  reposts: number
  engagementRate: number
}

export interface WeeklyTrendRow {
  weekLabel: string
  postsCount: number
  impressions: number
  likes: number
  avgEngagementRate: number
  followersCount: number | null
}

export interface AnalysisSummary {
  totalPosts: number
  totalImpressions: number
  totalLikes: number
  totalReplies: number
  totalReposts: number
  avgImpressionsAll: number
  avgEngagementRateAll: number
  recentPostsCount: number
  recentImpressions: number
  recentLikes: number
  avgImpressionsRecent: number
  topByImpressions: ScoredPost[]
  topByEngagement: ScoredPost[]
  oldestPostDate: string
  latestPostDate: string
}

export interface AnalysisReportData {
  summary: AnalysisSummary
  weeklyTrend: WeeklyTrendRow[]
  daysRecent: number
  metricsFailedCount: number
  noPlatformIdCount: number
}

export interface AnalysisInsights {
  notable_posts: string
  engagement_review: string
  next_actions: string
}

export interface AccountAnalysisReport {
  id: string
  account_id: string
  period_start: string
  period_end: string
  days_recent: number
  report_data: AnalysisReportData
  insights: AnalysisInsights | null
  generated_at: string
  insights_generated_at: string | null
}
```

- [ ] **Step 2: `analyze-utils.ts`を更新する**

`generateReport` / `formatReportFilename` / `slugify`を削除し、`AnalysisSummary` / `ScoredPost` / `WeeklyTrendRow`を`src/types`からimportするように変更する。ファイル全体を以下に置き換える。

```ts
import type { AnalysisSummary, ScoredPost, WeeklyTrendRow } from '../../../../src/types'

export interface ParsedArgs {
  accountQuery: string
  days: number
}

export function calcEngagementRate(
  impressions: number,
  likes: number,
  replies: number,
  reposts: number
): number {
  if (impressions === 0) return 0
  return Math.round(((likes + replies + reposts) / impressions) * 10000) / 100
}

export function parseArgs(argv: string[]): ParsedArgs {
  let days = 7
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') {
      const value = argv[i + 1]
      if (!value || Number.isNaN(Number(value))) {
        throw new Error('--days には数値を指定してください')
      }
      days = Number(value)
      i++
    } else {
      positional.push(argv[i])
    }
  }

  if (positional.length === 0) {
    throw new Error('アカウント名を指定してください')
  }

  return { accountQuery: positional[0], days }
}

export interface MetricsPost {
  id: string
  content: string
  scheduledDate: string
  publishedAt: string
  impressions: number
  likes: number
  replies: number
  reposts: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

function scorePosts(posts: MetricsPost[]): ScoredPost[] {
  return posts.map(p => ({
    ...p,
    engagementRate: calcEngagementRate(p.impressions, p.likes, p.replies, p.reposts),
  }))
}

export interface FollowerSnapshot {
  fetchedAt: string
  followersCount: number
}

export function buildWeeklyTrend(
  posts: MetricsPost[],
  followerHistory: FollowerSnapshot[],
  now: Date
): WeeklyTrendRow[] {
  const scored = scorePosts(posts)

  const sortedFollowers = [...followerHistory].sort(
    (a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime()
  )

  const rows: WeeklyTrendRow[] = []
  for (let week = 7; week >= 0; week--) {
    const weekEnd = new Date(now.getTime() - week * 7 * DAY_MS)
    const weekStart = new Date(weekEnd.getTime() - 7 * DAY_MS)

    const weekPosts = scored.filter(p => {
      const t = new Date(p.publishedAt).getTime()
      return t >= weekStart.getTime() && t < weekEnd.getTime()
    })

    const followerSnapshot = sortedFollowers.find(
      f => new Date(f.fetchedAt).getTime() <= weekEnd.getTime()
    )

    rows.push({
      weekLabel: `${String(weekEnd.getMonth() + 1).padStart(2, '0')}/${String(weekEnd.getDate()).padStart(2, '0')}`,
      postsCount: weekPosts.length,
      impressions: weekPosts.reduce((sum, p) => sum + p.impressions, 0),
      likes: weekPosts.reduce((sum, p) => sum + p.likes, 0),
      avgEngagementRate: average(weekPosts.map(p => p.engagementRate)),
      followersCount: followerSnapshot ? followerSnapshot.followersCount : null,
    })
  }
  return rows
}

export function aggregate(posts: MetricsPost[], daysRecent: number, now: Date): AnalysisSummary {
  const scored = scorePosts(posts)

  const sortedByDate = [...scored].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  const recentCutoff = now.getTime() - daysRecent * DAY_MS
  const recentPosts = scored.filter(p => new Date(p.publishedAt).getTime() >= recentCutoff)

  return {
    totalPosts: scored.length,
    totalImpressions: scored.reduce((sum, p) => sum + p.impressions, 0),
    totalLikes: scored.reduce((sum, p) => sum + p.likes, 0),
    totalReplies: scored.reduce((sum, p) => sum + p.replies, 0),
    totalReposts: scored.reduce((sum, p) => sum + p.reposts, 0),
    avgImpressionsAll: average(scored.map(p => p.impressions)),
    avgEngagementRateAll: average(scored.map(p => p.engagementRate)),
    recentPostsCount: recentPosts.length,
    recentImpressions: recentPosts.reduce((sum, p) => sum + p.impressions, 0),
    recentLikes: recentPosts.reduce((sum, p) => sum + p.likes, 0),
    avgImpressionsRecent: average(recentPosts.map(p => p.impressions)),
    topByImpressions: [...scored].sort((a, b) => b.impressions - a.impressions).slice(0, 10),
    topByEngagement: [...scored].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5),
    oldestPostDate:
      sortedByDate.length > 0 ? sortedByDate[sortedByDate.length - 1].publishedAt.slice(0, 10) : 'N/A',
    latestPostDate: sortedByDate.length > 0 ? sortedByDate[0].publishedAt.slice(0, 10) : 'N/A',
  }
}
```

- [ ] **Step 3: `analyze-utils.test.ts`から削除した関数のテストを取り除く**

`slugify` / `formatReportFilename` / `generateReport`の`describe`ブロックとimportを削除する。ファイル全体を以下に置き換える。

```ts
import { describe, it, expect } from 'vitest'
import { calcEngagementRate, parseArgs, aggregate, buildWeeklyTrend, type MetricsPost, type FollowerSnapshot } from './analyze-utils'

describe('calcEngagementRate', () => {
  it('インプレッションに対するライク・リプライ・リポストの割合をパーセントで返す', () => {
    expect(calcEngagementRate(1000, 50, 10, 5)).toBe(6.5)
  })

  it('インプレッションが0のときは0を返す', () => {
    expect(calcEngagementRate(0, 5, 0, 0)).toBe(0)
  })
})

describe('parseArgs', () => {
  it('アカウント名のみ指定した場合、daysはデフォルト7になる', () => {
    expect(parseArgs(['Dober'])).toEqual({ accountQuery: 'Dober', days: 7 })
  })

  it('--daysオプションを指定できる', () => {
    expect(parseArgs(['Dober', '--days', '30'])).toEqual({ accountQuery: 'Dober', days: 30 })
  })

  it('アカウント名が無い場合はエラーになる', () => {
    expect(() => parseArgs([])).toThrow('アカウント名を指定してください')
    expect(() => parseArgs(['--days', '30'])).toThrow('アカウント名を指定してください')
  })

  it('--daysに数値以外を指定するとエラーになる', () => {
    expect(() => parseArgs(['Dober', '--days', 'abc'])).toThrow('--days には数値を指定してください')
  })
})

describe('aggregate', () => {
  const now = new Date('2026-06-12T00:00:00Z')

  const posts: MetricsPost[] = [
    {
      id: '1',
      content: 'A'.repeat(80),
      scheduledDate: '2026-06-10',
      publishedAt: '2026-06-10T00:00:00Z',
      impressions: 1000,
      likes: 50,
      replies: 10,
      reposts: 5,
    },
    {
      id: '2',
      content: 'short post',
      scheduledDate: '2026-06-05',
      publishedAt: '2026-06-05T00:00:00Z',
      impressions: 2000,
      likes: 20,
      replies: 0,
      reposts: 0,
    },
    {
      id: '3',
      content: 'old post',
      scheduledDate: '2026-05-01',
      publishedAt: '2026-05-01T00:00:00Z',
      impressions: 500,
      likes: 100,
      replies: 0,
      reposts: 0,
    },
  ]

  it('全体サマリーを計算する', () => {
    const summary = aggregate(posts, 7, now)

    expect(summary.totalPosts).toBe(3)
    expect(summary.totalImpressions).toBe(3500)
    expect(summary.totalLikes).toBe(170)
    expect(summary.totalReplies).toBe(10)
    expect(summary.totalReposts).toBe(5)
    expect(summary.avgImpressionsAll).toBe(1166.7)
    expect(summary.avgEngagementRateAll).toBe(9.2)
    expect(summary.oldestPostDate).toBe('2026-05-01')
    expect(summary.latestPostDate).toBe('2026-06-10')
  })

  it('直近N日間のサマリーを計算する（境界値は含む）', () => {
    const summary = aggregate(posts, 7, now)

    // 06-05, 06-10 は now(06-12) から7日以内
    expect(summary.recentPostsCount).toBe(2)
    expect(summary.recentImpressions).toBe(3000)
    expect(summary.recentLikes).toBe(70)
    expect(summary.avgImpressionsRecent).toBe(1500)
  })

  it('TOP10をインプレッション順、TOP5をエンゲージメント率順で返す', () => {
    const summary = aggregate(posts, 7, now)

    expect(summary.topByImpressions.map(p => p.id)).toEqual(['2', '1', '3'])
    expect(summary.topByEngagement.map(p => p.id)).toEqual(['3', '1', '2'])
    expect(summary.topByEngagement[0].engagementRate).toBe(20)
  })

  it('投稿が0件の場合はゼロ値とN/Aを返す', () => {
    const summary = aggregate([], 7, now)

    expect(summary.totalPosts).toBe(0)
    expect(summary.totalImpressions).toBe(0)
    expect(summary.avgImpressionsAll).toBe(0)
    expect(summary.oldestPostDate).toBe('N/A')
    expect(summary.latestPostDate).toBe('N/A')
    expect(summary.topByImpressions).toEqual([])
    expect(summary.topByEngagement).toEqual([])
  })
})

describe('buildWeeklyTrend', () => {
  const now = new Date('2026-06-12T00:00:00Z')

  const posts: MetricsPost[] = [
    {
      id: 'a',
      content: 'this week post',
      scheduledDate: '2026-06-10',
      publishedAt: '2026-06-10T00:00:00Z',
      impressions: 1000,
      likes: 50,
      replies: 10,
      reposts: 5,
    },
    {
      id: 'b',
      content: 'five weeks ago post',
      scheduledDate: '2026-05-02',
      publishedAt: '2026-05-02T00:00:00Z',
      impressions: 400,
      likes: 40,
      replies: 0,
      reposts: 0,
    },
  ]

  const followerHistory: FollowerSnapshot[] = [
    { fetchedAt: '2026-06-11T00:00:00Z', followersCount: 1200 },
    { fetchedAt: '2026-06-04T00:00:00Z', followersCount: 1100 },
    { fetchedAt: '2026-04-20T00:00:00Z', followersCount: 900 },
  ]

  it('直近8週分の行を、過去から現在の順で返す', () => {
    const rows = buildWeeklyTrend(posts, followerHistory, now)

    expect(rows).toHaveLength(8)
    // 最後の行が直近の週（週末日 = nowの日付）
    expect(rows[7].weekLabel).toBe('06/12')
  })

  it('各週の投稿数・インプレッション・ライク・平均エンゲージメント率を集計する', () => {
    const rows = buildWeeklyTrend(posts, followerHistory, now)

    // week0 (06/05 ～ 06/12): postA が含まれる
    const thisWeek = rows[7]
    expect(thisWeek.postsCount).toBe(1)
    expect(thisWeek.impressions).toBe(1000)
    expect(thisWeek.likes).toBe(50)
    expect(thisWeek.avgEngagementRate).toBe(6.5)
    expect(thisWeek.followersCount).toBe(1200)

    // week1 (05/29 ～ 06/05): 投稿なし
    const lastWeek = rows[6]
    expect(lastWeek.postsCount).toBe(0)
    expect(lastWeek.followersCount).toBe(1100)

    // week5 (05/01 ～ 05/08): postB が含まれる
    const fiveWeeksAgo = rows[2]
    expect(fiveWeeksAgo.postsCount).toBe(1)
    expect(fiveWeeksAgo.impressions).toBe(400)
    expect(fiveWeeksAgo.avgEngagementRate).toBe(10)
    expect(fiveWeeksAgo.followersCount).toBe(900)
  })

  it('フォロワー数のスナップショットが無い週はnullを返す', () => {
    const rows = buildWeeklyTrend(posts, [], now)

    expect(rows.every(r => r.followersCount === null)).toBe(true)
  })
})
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: PASS（全テストが成功し、`slugify`/`formatReportFilename`/`generateReport`関連のテストは存在しない）

- [ ] **Step 5: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts .claude/skills/account-post-analysis/scripts/analyze-utils.ts .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts
git commit -m "refactor: 分析レポートの型をsrc/types/index.tsに集約しMarkdown生成関数を削除"
```

---

### Task 3: analyze.tsをDB保存に変更し、未コミットのMarkdownレポートを削除

**Files:**
- Modify: `.claude/skills/account-post-analysis/scripts/analyze.ts`
- Delete: `.claude/skills/account-post-analysis/reports/dober-threads/2026-06-12_1133_analysis.md`（未コミット）

- [ ] **Step 1: 未コミットのMarkdownレポートを削除する**

```bash
rm ".claude/skills/account-post-analysis/reports/dober-threads/2026-06-12_1133_analysis.md"
```

- [ ] **Step 2: `analyze.ts`を更新する**

ファイル全体を以下に置き換える（Markdownファイル出力を削除し、`account_analysis_reports`へのINSERTに変更）。

```ts
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { decrypt } from '../../../../src/lib/crypto'
import { fetchThreadsPostMetrics } from '../../../../src/lib/threads-metrics'
import { fetchXPostMetrics } from '../../../../src/lib/x-metrics'
import {
  parseArgs,
  aggregate,
  buildWeeklyTrend,
  type MetricsPost,
  type FollowerSnapshot,
} from './analyze-utils'
import type { AnalysisReportData } from '../../../../src/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../../..')

const DAY_MS = 24 * 60 * 60 * 1000
const METRICS_FETCH_INTERVAL_MS = 500

async function main() {
  const envPath = path.join(REPO_ROOT, '.env.local')
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }

  const { accountQuery, days } = parseArgs(process.argv.slice(2))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. アカウント特定
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, account_name, platform, api_key, api_secret, access_token, access_token_secret')
    .ilike('account_name', `%${accountQuery}%`)

  if (accountsError) throw new Error(`アカウント検索エラー: ${accountsError.message}`)
  if (!accounts || accounts.length === 0) {
    console.error(`アカウントが見つかりません: "${accountQuery}"`)
    process.exit(1)
  }
  if (accounts.length > 1) {
    console.error(`複数のアカウントが見つかりました: ${accounts.map(a => a.account_name).join(', ')}`)
    process.exit(1)
  }
  const account = accounts[0]

  // 2. 投稿一覧の取得（直近30日・公開済み）
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, content, scheduled_date, published_at, platform_post_id')
    .eq('account_id', account.id)
    .eq('status', 'published')
    .gte('published_at', since)

  if (postsError) throw new Error(`投稿取得エラー: ${postsError.message}`)

  const allPosts = posts ?? []
  const withPlatformId = allPosts.filter(p => p.platform_post_id)
  const noPlatformIdCount = allPosts.length - withPlatformId.length

  // 3. ライブメトリクス取得
  const metricsPosts: MetricsPost[] = []
  let metricsFailedCount = 0

  for (const post of withPlatformId) {
    try {
      const metrics =
        account.platform === 'threads'
          ? await fetchThreadsPostMetrics({
              mediaId: post.platform_post_id as string,
              accessToken: decrypt(account.access_token as string),
            })
          : await fetchXPostMetrics({
              tweetId: post.platform_post_id as string,
              apiKey: decrypt(account.api_key as string),
              apiSecret: decrypt(account.api_secret as string),
              accessToken: decrypt(account.access_token as string),
              accessTokenSecret: decrypt(account.access_token_secret as string),
            })

      metricsPosts.push({
        id: post.id,
        content: post.content,
        scheduledDate: post.scheduled_date,
        publishedAt: post.published_at as string,
        impressions: metrics.impressions,
        likes: metrics.likes,
        replies: metrics.replies,
        reposts: metrics.reposts,
      })
    } catch (err) {
      metricsFailedCount++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`メトリクス取得失敗 (post ${post.id}): ${message}`)
    }

    await new Promise(resolve => setTimeout(resolve, METRICS_FETCH_INTERVAL_MS))
  }

  // 4. フォロワー数トレンド
  const { data: accountMetrics, error: accountMetricsError } = await supabase
    .from('account_metrics')
    .select('fetched_at, followers_count')
    .eq('account_id', account.id)
    .order('fetched_at', { ascending: false })

  if (accountMetricsError) throw new Error(`フォロワー数取得エラー: ${accountMetricsError.message}`)

  const followerHistory: FollowerSnapshot[] = (accountMetrics ?? []).map(m => ({
    fetchedAt: m.fetched_at,
    followersCount: m.followers_count,
  }))

  // 5. 集計
  const now = new Date()
  const summary = aggregate(metricsPosts, days, now)
  const weeklyTrend = buildWeeklyTrend(metricsPosts, followerHistory, now)

  // 6. レポートデータの構築・DB保存
  const reportData: AnalysisReportData = {
    summary,
    weeklyTrend,
    daysRecent: days,
    metricsFailedCount,
    noPlatformIdCount,
  }

  const { data: report, error: reportError } = await supabase
    .from('account_analysis_reports')
    .insert({
      account_id: account.id,
      period_start: since,
      period_end: now.toISOString(),
      days_recent: days,
      report_data: reportData,
      generated_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (reportError) throw new Error(`レポート保存エラー: ${reportError.message}`)

  console.log(`✅ レポートをDBに保存しました (id: ${report.id})`)
  console.log(JSON.stringify(reportData, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 3: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/account-post-analysis/scripts/analyze.ts ".claude/skills/account-post-analysis/reports/dober-threads/2026-06-12_1133_analysis.md"
git commit -m "feat: analyze.tsの出力先をMarkdownファイルからaccount_analysis_reportsテーブルに変更"
```

注: `git add`に削除したファイルのパスを含めることで削除がステージされる（`git rm`と同等）。

---

### Task 4: SKILL.md の更新

**Files:**
- Modify: `.claude/skills/account-post-analysis/SKILL.md`

- [ ] **Step 1: SKILL.mdを以下の内容に置き換える**

```markdown
---
name: account-post-analysis
description: SNSアカウント（Threads/X）の投稿パフォーマンスを分析し、インサイトレポートを生成する。「<アカウント名>の今週の投稿を分析して」「<アカウント名>のレポートを出して」「<アカウント名>の先月の振り返り」などで起動する。
---

# account-post-analysis

`accounts`テーブルに登録済みのSNSアカウントについて、直近30日の公開済み投稿のライブメトリクス（Threads/X APIから取得した最新のインプレッション・いいね・リプライ・リポスト）とフォロワー数推移を集計し、分析レポートを`account_analysis_reports`テーブルに保存する。

## 実行手順

### Step 1: 分析スクリプトを実行する

ユーザーの発話からアカウント名と分析期間を判断し、以下を実行する。

```bash
npx tsx .claude/skills/account-post-analysis/scripts/analyze.ts "<アカウント名>" --days <N>
```

- `<アカウント名>`: ユーザーが言及したアカウント名の一部（`accounts.account_name`への部分一致）。例: `"Dober"`
- `<N>`: 「今週」→ `7`、「今月」→ `30`、指定が無ければ省略（デフォルト7）

アカウントが見つからない、または複数該当する場合はスクリプトがエラー終了し候補/該当なしを表示する。その場合はユーザーにアカウント名を確認する。

スクリプトはThreads/X APIへ投稿ごとにライブアクセスするため、投稿数に応じて時間がかかる場合がある。

スクリプトは標準出力に以下を出力する:
1. `✅ レポートをDBに保存しました (id: <レコードID>)`
2. `report_data`のJSON（サマリー・週次トレンド・TOP投稿等）

### Step 2: インサイト分析をDBに追記する

Step 1で出力された`report_data`のJSONを読み、以下のキーを持つインサイトJSONを作成する。

```json
{
  "notable_posts": "注目投稿の傾向（TOP投稿のテーマ・文体・フォーマットの共通点）",
  "engagement_review": "エンゲージメント考察（ライク率・リプライ率・週次トレンド・フォロワー推移から読み取れること）",
  "next_actions": "次のアクション（投稿テーマ・フォーマット・投稿時間に関する具体的な改善提案）"
}
```

`mcp__supabase__execute_sql`（`project_id: fdmhkjiqsrzktfmbqlxg`）を使い、Step 1で取得したレコードIDを指定して以下のSQLを実行する（`<...>`部分を実際の値に置き換える）。

```sql
UPDATE account_analysis_reports
SET insights = '<インサイトJSON（エスケープ済み）>'::jsonb,
    insights_generated_at = now()
WHERE id = '<レコードID>';
```

### Step 3: 要約をユーザーに提示する

レポートの主要な数値（全体サマリー・直近N日間のパフォーマンス）とインサイトをユーザーに要約して伝える。レポートはダッシュボードの「分析レポート」ページからも確認できる旨を伝える。
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/account-post-analysis/SKILL.md
git commit -m "docs: account-post-analysisスキルのフローをDB保存ベースに更新"
```

---

### Task 5: MCPサーバーに list_analysis_reports ツールを追加

**Files:**
- Modify: `packages/mcp-server/src/index.ts`
- Modify: `packages/mcp-server/README.md`

- [ ] **Step 1: ツール定義を`ListToolsRequestSchema`のハンドラに追加する**

`packages/mcp-server/src/index.ts`内の`tools`配列（`update_post`の定義の後）に以下を追加する。

```ts
    {
      name: 'list_analysis_reports',
      description: 'アカウントの分析レポート一覧を返す（期間指定可）',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'アカウントID' },
          since: { type: 'string', description: '取得開始日時 ISO8601（省略可、generated_atでフィルタ）' },
          until: { type: 'string', description: '取得終了日時 ISO8601（省略可）' },
          limit: { type: 'number', description: '取得件数上限（デフォルト10）' },
        },
        required: ['account_id'],
      },
    },
```

- [ ] **Step 2: `CallToolRequestSchema`のハンドラに処理を追加する**

`update_post`の処理ブロックの後（`throw new Error(\`Unknown tool: ${name}\`)`の前）に以下を追加する。

```ts
  if (name === 'list_analysis_reports') {
    const { account_id, since, until, limit = 10 } = args as {
      account_id: string; since?: string; until?: string; limit?: number
    }

    let query = supabase
      .from('account_analysis_reports')
      .select('id, period_start, period_end, days_recent, report_data, insights, generated_at, insights_generated_at')
      .eq('account_id', account_id)
      .order('generated_at', { ascending: false })
      .limit(limit)

    if (since) query = query.gte('generated_at', since)
    if (until) query = query.lte('generated_at', until)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

```

- [ ] **Step 3: READMEのツール表に行を追加する**

`packages/mcp-server/README.md`の「利用可能なツール」テーブルに以下の行を追加する。

```markdown
| `list_analysis_reports` | アカウントの分析レポート一覧を取得（期間指定可） |
```

- [ ] **Step 4: ビルドして型エラーがないことを確認する**

Run: `npm run build --workspace=packages/mcp-server` （または `cd packages/mcp-server && npm run build`）
Expected: エラーなく`dist/index.js`が生成される

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/index.ts packages/mcp-server/README.md
git commit -m "feat: MCPサーバーにlist_analysis_reportsツールを追加"
```

---

### Task 6: /api/analytics/reports エンドポイント追加

**Files:**
- Create: `src/app/api/analytics/reports/route.ts`

- [ ] **Step 1: ルートハンドラを作成する**

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('account_analysis_reports')
    .select('id, period_start, period_end, days_recent, generated_at, insights_generated_at')
    .eq('account_id', accountId)
    .order('generated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analytics/reports/route.ts
git commit -m "feat: 分析レポート一覧を返すAPIエンドポイントを追加"
```

---

### Task 7: /analytics/reports 一覧ページ追加

**Files:**
- Create: `src/components/analytics/ReportsList.tsx`
- Create: `src/app/(dashboard)/analytics/reports/page.tsx`

- [ ] **Step 1: `ReportsList`クライアントコンポーネントを作成する**

`PostsTable`と同様の「アカウントタブ＋fetchで切り替え」パターンを使う。

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface AccountOption {
  id: string
  account_name: string
  platform: string
}

interface ReportListItem {
  id: string
  period_start: string
  period_end: string
  days_recent: number
  generated_at: string
  insights_generated_at: string | null
}

interface Props {
  accounts: AccountOption[]
  initialReports: ReportListItem[]
}

export function ReportsList({ accounts, initialReports }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [reports, setReports] = useState(initialReports)

  const selectAccount = async (accountId: string) => {
    setSelectedAccountId(accountId)
    const res = await fetch(`/api/analytics/reports?account_id=${accountId}`)
    setReports(await res.json())
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => selectAccount(a.id)}
            className={`px-4 py-2 rounded text-sm font-medium ${
              selectedAccountId === a.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 border hover:bg-gray-50'
            }`}
          >
            {a.account_name}
          </button>
        ))}
      </div>

      {!reports.length ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          分析レポートがありません。account-post-analysisスキルを実行するとここに表示されます。
        </p>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">対象期間</th>
                <th className="text-left p-3 font-medium">直近N日間</th>
                <th className="text-left p-3 font-medium">生成日時</th>
                <th className="text-left p-3 font-medium">インサイト</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 whitespace-nowrap text-gray-700">
                    {new Date(r.period_start).toLocaleDateString('ja-JP')} 〜{' '}
                    {new Date(r.period_end).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-500">{r.days_recent}日間</td>
                  <td className="p-3 whitespace-nowrap text-gray-500">
                    {new Date(r.generated_at).toLocaleString('ja-JP')}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {r.insights_generated_at ? (
                      <Badge>生成済み</Badge>
                    ) : (
                      <Badge variant="secondary">未生成</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link href={`/analytics/reports/${r.id}`} className="text-blue-600 hover:underline">
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `Badge`コンポーネントの`variant`プロパティを確認する**

`src/components/ui/badge.tsx`を読み、`variant="secondary"`が利用可能なバリアントとして定義されているか確認する。定義されていない場合は、利用可能な値（例: `"outline"`）に置き換える。

- [ ] **Step 3: 一覧ページ（サーバーコンポーネント）を作成する**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsList } from '@/components/analytics/ReportsList'

export default async function AnalysisReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const firstAccountId = accounts?.[0]?.id

  const { data: reports } = firstAccountId
    ? await supabase
        .from('account_analysis_reports')
        .select('id, period_start, period_end, days_recent, generated_at, insights_generated_at')
        .eq('account_id', firstAccountId)
        .order('generated_at', { ascending: false })
    : { data: [] }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">分析レポート</h1>
      {!accounts?.length ? (
        <p className="text-sm text-gray-500">アカウントがありません。</p>
      ) : (
        <ReportsList accounts={accounts} initialReports={reports ?? []} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/ReportsList.tsx "src/app/(dashboard)/analytics/reports/page.tsx"
git commit -m "feat: 分析レポート一覧ページを追加"
```

---

### Task 8: /analytics/reports/[id] 詳細ページ追加

**Files:**
- Create: `src/components/analytics/ReportDetail.tsx`
- Create: `src/components/analytics/ReportDetail.test.tsx`
- Create: `src/app/(dashboard)/analytics/reports/[id]/page.tsx`

- [ ] **Step 1: `ReportDetail`の失敗するテストを書く**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportDetail } from './ReportDetail'
import type { AccountAnalysisReport } from '@/types'

const baseReport: AccountAnalysisReport = {
  id: 'report-1',
  account_id: 'account-1',
  period_start: '2026-05-13T00:00:00Z',
  period_end: '2026-06-12T00:00:00Z',
  days_recent: 7,
  generated_at: '2026-06-12T01:00:00Z',
  insights_generated_at: null,
  insights: null,
  report_data: {
    daysRecent: 7,
    metricsFailedCount: 1,
    noPlatformIdCount: 2,
    summary: {
      totalPosts: 3,
      totalImpressions: 3500,
      totalLikes: 170,
      totalReplies: 10,
      totalReposts: 5,
      avgImpressionsAll: 1166.7,
      avgEngagementRateAll: 9.2,
      recentPostsCount: 2,
      recentImpressions: 3000,
      recentLikes: 70,
      avgImpressionsRecent: 1500,
      oldestPostDate: '2026-05-01',
      latestPostDate: '2026-06-10',
      topByImpressions: [
        {
          id: '2',
          content: 'short post',
          scheduledDate: '2026-06-05',
          publishedAt: '2026-06-05T00:00:00Z',
          impressions: 2000,
          likes: 20,
          replies: 0,
          reposts: 0,
          engagementRate: 1,
        },
      ],
      topByEngagement: [
        {
          id: '3',
          content: 'old post',
          scheduledDate: '2026-05-01',
          publishedAt: '2026-05-01T00:00:00Z',
          impressions: 500,
          likes: 100,
          replies: 0,
          reposts: 0,
          engagementRate: 20,
        },
      ],
    },
    weeklyTrend: [
      {
        weekLabel: '06/12',
        postsCount: 1,
        impressions: 1000,
        likes: 50,
        avgEngagementRate: 6.5,
        followersCount: 1200,
      },
    ],
  },
}

describe('ReportDetail', () => {
  it('全体サマリー・直近N日間・週次トレンド・TOP投稿を表示する', () => {
    render(<ReportDetail report={baseReport} accountName="Dober/Threads" />)

    expect(screen.getByText('Dober/Threads 分析レポート')).toBeInTheDocument()
    expect(screen.getByText('3件')).toBeInTheDocument() // 総投稿数
    expect(screen.getByText('直近7日間のパフォーマンス')).toBeInTheDocument()
    expect(screen.getByText('週次トレンド（直近8週）')).toBeInTheDocument()
    expect(screen.getByText('06/12')).toBeInTheDocument()
    expect(screen.getByText('short post')).toBeInTheDocument()
    expect(screen.getByText('old post')).toBeInTheDocument()
    expect(screen.getByText('インサイト分析は未生成です。')).toBeInTheDocument()
  })

  it('insightsがある場合はインサイトのテキストを表示する', () => {
    const report: AccountAnalysisReport = {
      ...baseReport,
      insights_generated_at: '2026-06-12T02:00:00Z',
      insights: {
        notable_posts: '注目投稿の傾向テキスト',
        engagement_review: 'エンゲージメント考察テキスト',
        next_actions: '次のアクションテキスト',
      },
    }

    render(<ReportDetail report={report} accountName="Dober/Threads" />)

    expect(screen.getByText('注目投稿の傾向テキスト')).toBeInTheDocument()
    expect(screen.getByText('エンゲージメント考察テキスト')).toBeInTheDocument()
    expect(screen.getByText('次のアクションテキスト')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/components/analytics/ReportDetail.test.tsx`
Expected: FAIL（`./ReportDetail`が存在しない）

- [ ] **Step 3: `ReportDetail`コンポーネントを実装する**

```tsx
import type { AccountAnalysisReport } from '@/types'

interface Props {
  report: AccountAnalysisReport
  accountName: string
}

export function ReportDetail({ report, accountName }: Props) {
  const { summary, weeklyTrend, daysRecent, metricsFailedCount, noPlatformIdCount } = report.report_data

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{accountName} 分析レポート</h1>
        <p className="text-sm text-gray-500 mt-1">
          生成日時: {new Date(report.generated_at).toLocaleString('ja-JP')}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">全体サマリー</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総投稿数</td>
              <td className="py-1 text-right">{summary.totalPosts.toLocaleString()}件</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総インプレッション</td>
              <td className="py-1 text-right">{summary.totalImpressions.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総ライク</td>
              <td className="py-1 text-right">{summary.totalLikes.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総リプライ</td>
              <td className="py-1 text-right">{summary.totalReplies.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総リポスト</td>
              <td className="py-1 text-right">{summary.totalReposts.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">平均インプレッション/投稿</td>
              <td className="py-1 text-right">{summary.avgImpressionsAll.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">平均エンゲージメント率</td>
              <td className="py-1 text-right">{summary.avgEngagementRateAll}%</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">メトリクス取得失敗</td>
              <td className="py-1 text-right">{metricsFailedCount}件</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">メトリクス対象外（未連携投稿）</td>
              <td className="py-1 text-right">{noPlatformIdCount}件</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-gray-500">データ期間</td>
              <td className="py-1 text-right">
                {summary.oldestPostDate} 〜 {summary.latestPostDate}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">直近{daysRecent}日間のパフォーマンス</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">投稿数</td>
              <td className="py-1 text-right">{summary.recentPostsCount}件</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">インプレッション合計</td>
              <td className="py-1 text-right">{summary.recentImpressions.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">ライク合計</td>
              <td className="py-1 text-right">{summary.recentLikes.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-gray-500">平均インプレッション/投稿</td>
              <td className="py-1 text-right">{summary.avgImpressionsRecent.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">週次トレンド（直近8週）</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">週末日</th>
              <th className="text-right py-2 pr-4 font-semibold">投稿数</th>
              <th className="text-right py-2 pr-4 font-semibold">インプレッション</th>
              <th className="text-right py-2 pr-4 font-semibold">ライク</th>
              <th className="text-right py-2 pr-4 font-semibold">平均エンゲ率</th>
              <th className="text-right py-2 font-semibold">フォロワー数</th>
            </tr>
          </thead>
          <tbody>
            {weeklyTrend.map(w => (
              <tr key={w.weekLabel} className="border-b">
                <td className="py-1 pr-4">{w.weekLabel}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.postsCount}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.impressions.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.likes.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.avgEngagementRate}%</td>
                <td className="py-1 text-right tabular-nums">
                  {w.followersCount === null ? '-' : w.followersCount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">TOP10投稿（インプレッション順・直近30日）</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">投稿内容</th>
              <th className="text-right py-2 pr-4 font-semibold">インプレ</th>
              <th className="text-right py-2 pr-4 font-semibold">ライク</th>
              <th className="text-right py-2 pr-4 font-semibold">リプライ</th>
              <th className="text-right py-2 pr-4 font-semibold">リポスト</th>
              <th className="text-right py-2 font-semibold">エンゲ率</th>
            </tr>
          </thead>
          <tbody>
            {summary.topByImpressions.map(post => (
              <tr key={post.id} className="border-b">
                <td className="py-1 pr-4 max-w-xs">
                  <p className="line-clamp-2">{post.content}</p>
                </td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.impressions.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.likes.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.replies.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.reposts.toLocaleString()}</td>
                <td className="py-1 text-right tabular-nums">{post.engagementRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">TOP5投稿（エンゲージメント率順・直近30日）</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">投稿内容</th>
              <th className="text-right py-2 pr-4 font-semibold">エンゲ率</th>
              <th className="text-right py-2 pr-4 font-semibold">インプレ</th>
              <th className="text-right py-2 font-semibold">ライク</th>
            </tr>
          </thead>
          <tbody>
            {summary.topByEngagement.map(post => (
              <tr key={post.id} className="border-b">
                <td className="py-1 pr-4 max-w-xs">
                  <p className="line-clamp-2">{post.content}</p>
                </td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.engagementRate}%</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.impressions.toLocaleString()}</td>
                <td className="py-1 text-right tabular-nums">{post.likes.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">インサイト分析</h2>
        {report.insights ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">注目投稿の傾向</h3>
              <p className="text-sm whitespace-pre-wrap">{report.insights.notable_posts}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">エンゲージメント考察</h3>
              <p className="text-sm whitespace-pre-wrap">{report.insights.engagement_review}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">次のアクション</h3>
              <p className="text-sm whitespace-pre-wrap">{report.insights.next_actions}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">インサイト分析は未生成です。</p>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run src/components/analytics/ReportDetail.test.tsx`
Expected: PASS

- [ ] **Step 5: 詳細ページ（サーバーコンポーネント）を作成する**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ReportDetail } from '@/components/analytics/ReportDetail'
import type { AccountAnalysisReport } from '@/types'

export default async function AnalysisReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: report } = await supabase
    .from('account_analysis_reports')
    .select('*, accounts(account_name)')
    .eq('id', id)
    .single()

  if (!report) notFound()

  const { accounts, ...reportFields } = report as AccountAnalysisReport & {
    accounts: { account_name: string }
  }

  return <ReportDetail report={reportFields} accountName={accounts.account_name} />
}
```

- [ ] **Step 6: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add src/components/analytics/ReportDetail.tsx src/components/analytics/ReportDetail.test.tsx "src/app/(dashboard)/analytics/reports/[id]/page.tsx"
git commit -m "feat: 分析レポート詳細ページを追加"
```

---

### Task 9: /analyticsページに「分析レポート」へのリンクを追加

**Files:**
- Modify: `src/app/(dashboard)/analytics/page.tsx:34-43`

- [ ] **Step 1: ヘッダー部分にリンクを追加する**

`src/app/(dashboard)/analytics/page.tsx`の以下の箇所を変更する。

変更前:
```tsx
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">分析</h1>
        <a
          href="/analytics/report"
          target="_blank"
          className="text-sm text-blue-600 hover:underline"
        >
          レポートを印刷
        </a>
      </div>
```

変更後:
```tsx
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">分析</h1>
        <div className="flex gap-4">
          <a href="/analytics/reports" className="text-sm text-blue-600 hover:underline">
            分析レポート
          </a>
          <a
            href="/analytics/report"
            target="_blank"
            className="text-sm text-blue-600 hover:underline"
          >
            レポートを印刷
          </a>
        </div>
      </div>
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat: 分析ページに分析レポートへのリンクを追加"
```

---

### Task 10: 全体テスト実行と動作確認

**Files:** なし（確認のみ）

- [ ] **Step 1: 全テストを実行する**

Run: `npx vitest run`
Expected: 全テストPASS

- [ ] **Step 2: 開発サーバーを起動して画面を確認する**

```bash
npm run dev
```

ブラウザで以下を確認する:
- `/analytics` → 「分析レポート」リンクが表示される
- `/analytics/reports` → アカウントタブと（存在すれば）レポート一覧が表示される
- `account-post-analysis`スキルを実行し、`account_analysis_reports`に新しいレコードが作成されることを確認する
- `/analytics/reports/[id]` → 生成されたレポートの詳細（サマリー・週次トレンド・TOP投稿・インサイト）が表示される

- [ ] **Step 3: 動作確認完了後、ブランチをpushしてPRを作成する**

```bash
git push -u origin feat/account-post-analysis-skill
gh pr create --title "feat: account-post-analysisレポートをDB化" --body "$(cat <<'EOF'
## Summary
- account-post-analysisスキルの分析レポートをMarkdownファイルではなくaccount_analysis_reportsテーブルに保存するよう変更
- ダッシュボードに分析レポート一覧・詳細ページを追加
- MCPサーバーにlist_analysis_reportsツールを追加

## Test plan
- [ ] `npx vitest run` が全件PASSすること
- [ ] account-post-analysisスキルを実行し、account_analysis_reportsにレコードが作成されること
- [ ] /analytics/reports で一覧・詳細が表示されること
EOF
)"
```
