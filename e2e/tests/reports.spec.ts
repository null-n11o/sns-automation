import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { AnalyticsPage } from '../pages/analytics.page'
import { TEST_COMPANY_ID } from '../fixtures/test-users'
import type { AnalysisReportData, AnalysisInsights } from '../../src/types'

test.describe('未認証', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('未認証で /analytics/reports にアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/analytics/reports')
    await expect(page).toHaveURL('/login')
  })

  test('未認証で /analytics/reports/[id] にアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/analytics/reports/00000000-0000-0000-0000-000000000000')
    await expect(page).toHaveURL('/login')
  })
})

test.describe('分析レポート（認証済み）', () => {
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const reportData: AnalysisReportData = {
    summary: {
      totalPosts: 1,
      totalImpressions: 1000,
      totalLikes: 50,
      totalReplies: 2,
      totalReposts: 1,
      avgImpressionsAll: 1000,
      avgEngagementRateAll: 5.3,
      recentPostsCount: 1,
      recentImpressions: 1000,
      recentLikes: 50,
      avgImpressionsRecent: 1000,
      oldestPostDate: '2026-06-01',
      latestPostDate: '2026-06-08',
      topByImpressions: [
        {
          id: 'post-1',
          content: 'E2Eテスト用の投稿です',
          scheduledDate: '2026-06-08',
          publishedAt: '2026-06-08T00:00:00Z',
          impressions: 1000,
          likes: 50,
          replies: 2,
          reposts: 1,
          engagementRate: 5.3,
        },
      ],
      topByEngagement: [
        {
          id: 'post-1',
          content: 'E2Eテスト用の投稿です',
          scheduledDate: '2026-06-08',
          publishedAt: '2026-06-08T00:00:00Z',
          impressions: 1000,
          likes: 50,
          replies: 2,
          reposts: 1,
          engagementRate: 5.3,
        },
      ],
    },
    weeklyTrend: [
      {
        weekLabel: '06/08',
        postsCount: 1,
        impressions: 1000,
        likes: 50,
        avgEngagementRate: 5.3,
        followersCount: 100,
      },
    ],
    daysRecent: 7,
    metricsFailedCount: 0,
    noPlatformIdCount: 0,
  }

  const insights: AnalysisInsights = {
    notable_posts: 'E2Eテスト用の注目投稿コメント',
    engagement_review: 'E2Eテスト用のエンゲージメント考察',
    next_actions: 'E2Eテスト用の次のアクション',
  }

  let accountId: string
  let reportId: string
  let reportWithInsightsId: string

  test.beforeAll(async () => {
    const { data: account, error: accountError } = await service
      .from('accounts')
      .insert({
        company_id: TEST_COMPANY_ID,
        platform: 'threads',
        account_name: 'E2Eテストアカウント',
      })
      .select('id')
      .single()
    if (accountError) throw new Error(`Failed to insert account: ${accountError.message}`)
    accountId = account.id

    const { data: report, error: reportError } = await service
      .from('account_analysis_reports')
      .insert({
        account_id: accountId,
        period_start: '2026-05-13T00:00:00Z',
        period_end: '2026-06-12T00:00:00Z',
        days_recent: 7,
        report_data: reportData,
      })
      .select('id')
      .single()
    if (reportError) throw new Error(`Failed to insert report: ${reportError.message}`)
    reportId = report.id

    const { data: reportWithInsights, error: reportWithInsightsError } = await service
      .from('account_analysis_reports')
      .insert({
        account_id: accountId,
        period_start: '2026-05-13T00:00:00Z',
        period_end: '2026-06-12T00:00:00Z',
        days_recent: 7,
        report_data: reportData,
        insights,
        insights_generated_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (reportWithInsightsError) {
      throw new Error(`Failed to insert report with insights: ${reportWithInsightsError.message}`)
    }
    reportWithInsightsId = reportWithInsights.id
  })

  test.afterAll(async () => {
    await service.from('accounts').delete().eq('id', accountId)
  })

  test('/analytics に「分析レポート」リンクが表示され、クリックで /analytics/reports に遷移する', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page)
    await analyticsPage.goto()

    const reportsLink = page.getByRole('link', { name: '分析レポート' })
    await expect(reportsLink).toBeVisible()
    await reportsLink.click()
    await expect(page).toHaveURL('/analytics/reports')
  })

  test('/analytics/reports にアカウントタブとレポート一覧が表示される', async ({ page }) => {
    await page.goto('/analytics/reports')

    await expect(page.getByRole('heading', { name: '分析レポート' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'E2Eテストアカウント' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()

    const detailLinks = page.getByRole('link', { name: '詳細' })
    await expect(detailLinks.first()).toBeVisible()
  })

  test('/analytics/reports/[id] でインサイト未生成のレポート詳細が表示される', async ({ page }) => {
    await page.goto(`/analytics/reports/${reportId}`)

    await expect(page.getByRole('heading', { name: 'E2Eテストアカウント 分析レポート' })).toBeVisible()
    await expect(page.getByText('全体サマリー')).toBeVisible()
    await expect(page.getByText('直近7日間のパフォーマンス')).toBeVisible()
    await expect(page.getByText('週次トレンド（直近8週）')).toBeVisible()
    await expect(page.getByText('E2Eテスト用の投稿です').first()).toBeVisible()
    await expect(page.getByText('インサイト分析は未生成です。')).toBeVisible()
  })

  test('/analytics/reports/[id] でインサイト生成済みのレポート詳細が表示される', async ({ page }) => {
    await page.goto(`/analytics/reports/${reportWithInsightsId}`)

    await expect(page.getByText('E2Eテスト用の注目投稿コメント')).toBeVisible()
    await expect(page.getByText('E2Eテスト用のエンゲージメント考察')).toBeVisible()
    await expect(page.getByText('E2Eテスト用の次のアクション')).toBeVisible()
  })

  test('存在しない id で /analytics/reports/[id] にアクセスすると404になる', async ({ page }) => {
    const response = await page.goto('/analytics/reports/00000000-0000-0000-0000-000000000000')
    expect(response?.status()).toBe(404)
  })
})
