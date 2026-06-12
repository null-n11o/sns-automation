import { describe, it, expect } from 'vitest'
import { slugify, calcEngagementRate, parseArgs, formatReportFilename, aggregate, type MetricsPost } from './analyze-utils'

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
