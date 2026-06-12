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
