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
