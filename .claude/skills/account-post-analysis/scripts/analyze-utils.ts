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
