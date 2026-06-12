# account-post-analysis スキル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SNSアカウント（Threads/X）の投稿パフォーマンスを分析し、Markdownレポートを生成する `account-post-analysis` スキルを `.claude/skills/account-post-analysis/` に追加する。

**Architecture:** Supabaseの`accounts`/`posts`/`account_metrics`テーブルからデータを取得し、各投稿の`platform_post_id`を使ってThreads/X APIから最新メトリクスをライブ取得する。集計・レポート生成は純粋関数として`analyze-utils.ts`に実装しvitestでテストする。I/O（Supabase接続・API呼び出し・ファイル書き込み）は`analyze.ts`のCLIスクリプトが担う。

**Tech Stack:** TypeScript, tsx（単発スクリプト実行）, @supabase/supabase-js, 既存の`src/lib/crypto.ts` / `src/lib/threads-metrics.ts` / `src/lib/x-metrics.ts`, vitest

参照設計: `docs/superpowers/specs/2026-06-12-account-post-analysis-skill-design.md`

---

### Task 1: tsxの追加

**Files:**
- Modify: `package.json`

- [ ] **Step 1: tsxをdevDependenciesに追加してインストール**

```bash
npm install -D tsx
```

- [ ] **Step 2: package.jsonにtsxが追加されたことを確認**

Run: `grep '"tsx"' package.json`
Expected: `"tsx": "^...",` が表示される

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: account-post-analysisスキル用にtsxを追加"
```

---

### Task 2: analyze-utils.ts の基礎関数（slugify, calcEngagementRate, parseArgs, formatReportFilename）

**Files:**
- Create: `.claude/skills/account-post-analysis/scripts/analyze-utils.ts`
- Test: `.claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`.claude/skills/account-post-analysis/scripts/analyze-utils.test.ts` を作成:

```ts
import { describe, it, expect } from 'vitest'
import { slugify, calcEngagementRate, parseArgs, formatReportFilename } from './analyze-utils'

describe('slugify', () => {
  it('英数字以外をハイフンに変換し、小文字化・前後のハイフンを除去する', () => {
    expect(slugify('Dober/Threads')).toBe('dober-threads')
    expect(slugify('  Foo_Bar 123 ')).toBe('foo-bar-123')
  })
})

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

describe('formatReportFilename', () => {
  it('YYYY-MM-DD_HHMM_analysis.md 形式のファイル名を返す', () => {
    expect(formatReportFilename(new Date(2026, 5, 12, 9, 5))).toBe('2026-06-12_0905_analysis.md')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: FAIL（`./analyze-utils` が存在しないエラー）

- [ ] **Step 3: 最小実装を書く**

`.claude/skills/account-post-analysis/scripts/analyze-utils.ts` を作成:

```ts
export interface ParsedArgs {
  accountQuery: string
  days: number
}

export function slugify(accountName: string): string {
  return accountName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

export function formatReportFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  return `${y}-${m}-${d}_${hh}${mm}_analysis.md`
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/account-post-analysis/scripts/analyze-utils.ts .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts
git commit -m "feat: account-post-analysisスキルの基礎ユーティリティ関数を追加"
```

---

### Task 3: aggregate関数の追加

**Files:**
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.ts`
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`analyze-utils.test.ts` に追記:

```ts
import { aggregate, type MetricsPost } from './analyze-utils'

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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: FAIL（`aggregate` is not exported）

- [ ] **Step 3: 実装を追加**

`analyze-utils.ts` に追記:

```ts
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

export interface ScoredPost extends MetricsPost {
  engagementRate: number
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

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: PASS（13 tests）

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/account-post-analysis/scripts/analyze-utils.ts .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts
git commit -m "feat: account-post-analysisスキルにaggregate関数を追加"
```

---

### Task 4: buildWeeklyTrend関数の追加

**Files:**
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.ts`
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`analyze-utils.test.ts` に追記:

```ts
import { buildWeeklyTrend, type FollowerSnapshot } from './analyze-utils'

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

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: FAIL（`buildWeeklyTrend` is not exported）

- [ ] **Step 3: 実装を追加**

`analyze-utils.ts` に追記:

```ts
export interface FollowerSnapshot {
  fetchedAt: string
  followersCount: number
}

export interface WeeklyTrendRow {
  weekLabel: string
  postsCount: number
  impressions: number
  likes: number
  avgEngagementRate: number
  followersCount: number | null
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
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: PASS（16 tests）

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/account-post-analysis/scripts/analyze-utils.ts .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts
git commit -m "feat: account-post-analysisスキルにbuildWeeklyTrend関数を追加"
```

---

### Task 5: generateReport関数の追加

**Files:**
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.ts`
- Modify: `.claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`analyze-utils.test.ts` に追記:

```ts
import { generateReport } from './analyze-utils'

describe('generateReport', () => {
  const now = new Date('2026-06-12T00:00:00Z')

  it('サマリー・週次トレンド・TOP投稿を含むMarkdownを生成する', () => {
    const posts: MetricsPost[] = [
      {
        id: '1',
        content: '今週のテスト投稿',
        scheduledDate: '2026-06-10',
        publishedAt: '2026-06-10T00:00:00Z',
        impressions: 1000,
        likes: 50,
        replies: 10,
        reposts: 5,
      },
    ]
    const summary = aggregate(posts, 7, now)
    const weeklyTrend = buildWeeklyTrend(posts, [], now)

    const report = generateReport({
      accountName: 'テストアカウント',
      summary,
      weeklyTrend,
      daysRecent: 7,
      metricsFailedCount: 1,
      noPlatformIdCount: 2,
      generatedAt: now,
    })

    expect(report).toContain('# テストアカウント 投稿分析レポート (2026年6月12日)')
    expect(report).toContain('## 全体サマリー')
    expect(report).toContain('| 総投稿数 | 1件 |')
    expect(report).toContain('| メトリクス取得失敗 | 1件 |')
    expect(report).toContain('| メトリクス対象外（未連携投稿） | 2件 |')
    expect(report).toContain('## 直近7日間のパフォーマンス')
    expect(report).toContain('## 週次トレンド（直近8週）')
    expect(report).toContain('## TOP10投稿（インプレッション順・直近30日）')
    expect(report).toContain('## TOP5投稿（エンゲージメント率順・直近30日）')
    expect(report).toContain('今週のテスト投稿')
    expect(report).toContain('*生成日時: 2026-06-12 00:00*')
  })

  it('投稿が0件の場合もエラーにならずレポートを生成する', () => {
    const summary = aggregate([], 7, now)
    const weeklyTrend = buildWeeklyTrend([], [], now)

    const report = generateReport({
      accountName: 'テストアカウント',
      summary,
      weeklyTrend,
      daysRecent: 7,
      metricsFailedCount: 0,
      noPlatformIdCount: 0,
      generatedAt: now,
    })

    expect(report).toContain('| 総投稿数 | 0件 |')
    expect(report).toContain('| データ期間 | N/A 〜 N/A |')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: FAIL（`generateReport` is not exported）

- [ ] **Step 3: 実装を追加**

`analyze-utils.ts` に追記:

```ts
export function generateReport(params: {
  accountName: string
  summary: AnalysisSummary
  weeklyTrend: WeeklyTrendRow[]
  daysRecent: number
  metricsFailedCount: number
  noPlatformIdCount: number
  generatedAt: Date
}): string {
  const { accountName, summary, weeklyTrend, daysRecent, metricsFailedCount, noPlatformIdCount, generatedAt } =
    params
  const pad = (n: number) => String(n).padStart(2, '0')
  const lines: string[] = []

  lines.push(
    `# ${accountName} 投稿分析レポート (${generatedAt.getFullYear()}年${generatedAt.getMonth() + 1}月${generatedAt.getDate()}日)`
  )
  lines.push('')

  lines.push('## 全体サマリー')
  lines.push('')
  lines.push('| 指標 | 値 |')
  lines.push('|------|-----|')
  lines.push(`| 総投稿数 | ${summary.totalPosts.toLocaleString()}件 |`)
  lines.push(`| 総インプレッション | ${summary.totalImpressions.toLocaleString()} |`)
  lines.push(`| 総ライク | ${summary.totalLikes.toLocaleString()} |`)
  lines.push(`| 総リプライ | ${summary.totalReplies.toLocaleString()} |`)
  lines.push(`| 総リポスト | ${summary.totalReposts.toLocaleString()} |`)
  lines.push(`| 平均インプレッション/投稿 | ${summary.avgImpressionsAll.toLocaleString()} |`)
  lines.push(`| 平均エンゲージメント率 | ${summary.avgEngagementRateAll}% |`)
  lines.push(`| メトリクス取得失敗 | ${metricsFailedCount}件 |`)
  lines.push(`| メトリクス対象外（未連携投稿） | ${noPlatformIdCount}件 |`)
  lines.push(`| データ期間 | ${summary.oldestPostDate} 〜 ${summary.latestPostDate} |`)
  lines.push('')

  lines.push(`## 直近${daysRecent}日間のパフォーマンス`)
  lines.push('')
  lines.push('| 指標 | 値 |')
  lines.push('|------|-----|')
  lines.push(`| 投稿数 | ${summary.recentPostsCount}件 |`)
  lines.push(`| インプレッション合計 | ${summary.recentImpressions.toLocaleString()} |`)
  lines.push(`| ライク合計 | ${summary.recentLikes.toLocaleString()} |`)
  lines.push(`| 平均インプレッション/投稿 | ${summary.avgImpressionsRecent.toLocaleString()} |`)
  lines.push('')

  lines.push('## 週次トレンド（直近8週）')
  lines.push('')
  lines.push('| 週末日 | 投稿数 | インプレッション | ライク | 平均エンゲージメント率 | フォロワー数 |')
  lines.push('|--------|--------|------------------|--------|------------------------|--------------|')
  for (const w of weeklyTrend) {
    const followers = w.followersCount === null ? '-' : w.followersCount.toLocaleString()
    lines.push(
      `| ${w.weekLabel} | ${w.postsCount} | ${w.impressions.toLocaleString()} | ${w.likes.toLocaleString()} | ${w.avgEngagementRate}% | ${followers} |`
    )
  }
  lines.push('')

  lines.push('## TOP10投稿（インプレッション順・直近30日）')
  lines.push('')
  lines.push('| # | 投稿内容（先頭70字） | インプレ | ライク | リプライ | リポスト | エンゲ率 |')
  lines.push('|---|---------------------|---------|--------|---------|---------|---------|')
  summary.topByImpressions.forEach((post, i) => {
    const title = post.content.slice(0, 70).replace(/\|/g, '｜').replace(/\n/g, ' ')
    lines.push(
      `| ${i + 1} | ${title} | ${post.impressions.toLocaleString()} | ${post.likes.toLocaleString()} | ${post.replies.toLocaleString()} | ${post.reposts.toLocaleString()} | ${post.engagementRate}% |`
    )
  })
  lines.push('')

  lines.push('## TOP5投稿（エンゲージメント率順・直近30日）')
  lines.push('')
  lines.push('| # | 投稿内容（先頭70字） | エンゲ率 | インプレ | ライク |')
  lines.push('|---|---------------------|---------|---------|--------|')
  summary.topByEngagement.forEach((post, i) => {
    const title = post.content.slice(0, 70).replace(/\|/g, '｜').replace(/\n/g, ' ')
    lines.push(
      `| ${i + 1} | ${title} | ${post.engagementRate}% | ${post.impressions.toLocaleString()} | ${post.likes.toLocaleString()} |`
    )
  })
  lines.push('')

  lines.push('---')
  lines.push(
    `*生成日時: ${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}*`
  )

  return lines.join('\n')
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts`
Expected: PASS（18 tests）

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/account-post-analysis/scripts/analyze-utils.ts .claude/skills/account-post-analysis/scripts/analyze-utils.test.ts
git commit -m "feat: account-post-analysisスキルにgenerateReport関数を追加"
```

---

### Task 6: analyze.ts CLIスクリプトの作成

**Files:**
- Create: `.claude/skills/account-post-analysis/scripts/analyze.ts`

- [ ] **Step 1: analyze.tsを作成**

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
  slugify,
  aggregate,
  buildWeeklyTrend,
  generateReport,
  formatReportFilename,
  type MetricsPost,
  type FollowerSnapshot,
} from './analyze-utils'

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

  // 6. レポート生成・保存
  const report = generateReport({
    accountName: account.account_name,
    summary,
    weeklyTrend,
    daysRecent: days,
    metricsFailedCount,
    noPlatformIdCount,
    generatedAt: now,
  })

  const reportsDir = path.join(__dirname, '..', 'reports', slugify(account.account_name))
  fs.mkdirSync(reportsDir, { recursive: true })
  const filePath = path.join(reportsDir, formatReportFilename(now))
  fs.writeFileSync(filePath, report, 'utf-8')

  console.log(`✅ レポートを保存しました: ${filePath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラーなし（既存のエラーが元々ある場合は、新規ファイルに起因するエラーが無いことを確認する）

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/account-post-analysis/scripts/analyze.ts
git commit -m "feat: account-post-analysisスキルのCLIスクリプトを追加"
```

---

### Task 7: SKILL.md の作成

**Files:**
- Create: `.claude/skills/account-post-analysis/SKILL.md`

- [ ] **Step 1: SKILL.mdを作成**

```markdown
---
name: account-post-analysis
description: SNSアカウント（Threads/X）の投稿パフォーマンスを分析し、インサイトレポートを生成する。「<アカウント名>の今週の投稿を分析して」「<アカウント名>のレポートを出して」「<アカウント名>の先月の振り返り」などで起動する。
---

# account-post-analysis

`accounts`テーブルに登録済みのSNSアカウントについて、直近30日の公開済み投稿のライブメトリクス（Threads/X APIから取得した最新のインプレッション・いいね・リプライ・リポスト）とフォロワー数推移を集計し、分析レポートを生成する。

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

### Step 2: レポートにインサイトを追記する

スクリプトが `.claude/skills/account-post-analysis/reports/<account-slug>/YYYY-MM-DD_HHMM_analysis.md` に保存したレポートを読み込み、末尾に以下のセクションを追記して保存する。

```markdown
## インサイト分析

### 注目投稿の傾向
（TOP投稿のテーマ・文体・フォーマットの共通点）

### エンゲージメント考察
（ライク率・リプライ率・週次トレンド・フォロワー推移から読み取れること）

### 次のアクション
（投稿テーマ・フォーマット・投稿時間に関する具体的な改善提案）
```

### Step 3: 要約をユーザーに提示する

レポートの主要な数値とインサイトをユーザーに要約して伝える。
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/account-post-analysis/SKILL.md
git commit -m "feat: account-post-analysisスキルのSKILL.mdを追加"
```

---

### Task 8: 実アカウントでの動作確認

**Files:** なし（動作確認のみ）

- [ ] **Step 1: Dober/Threadsアカウントに対してスクリプトを実行**

```bash
npx tsx .claude/skills/account-post-analysis/scripts/analyze.ts "Dober" --days 7
```

Expected:
- `✅ レポートを保存しました: .../reports/dober-threads/YYYY-MM-DD_HHMM_analysis.md` が出力される
- Threads APIへのアクセスでエラーが出た場合はエラーメッセージと失敗件数が報告されつつ処理が完了する

- [ ] **Step 2: 生成されたレポートを確認**

生成された `.claude/skills/account-post-analysis/reports/dober-threads/YYYY-MM-DD_HHMM_analysis.md` を読み、以下を確認する:
- 全体サマリーの数値が妥当な範囲か
- 週次トレンドのフォロワー数列が埋まっているか（`account_metrics`にデータがある場合）
- TOP投稿に投稿内容が表示されているか

- [ ] **Step 3: 存在しないアカウント名でエラーになることを確認**

```bash
npx tsx .claude/skills/account-post-analysis/scripts/analyze.ts "存在しないアカウント名XYZ"
```

Expected: `アカウントが見つかりません: "存在しないアカウント名XYZ"` が表示され、終了コード1で終了する

- [ ] **Step 4: 生成されたレポートをコミット**

```bash
git add .claude/skills/account-post-analysis/reports/
git commit -m "docs: Dober/Threadsの投稿分析レポートを生成"
```
