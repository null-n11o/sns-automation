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
