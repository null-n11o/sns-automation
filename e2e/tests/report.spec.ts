import { test, expect } from '@playwright/test'
import { ReportPage } from '../pages/report.page'
import { AnalyticsPage } from '../pages/analytics.page'

test.describe('未認証', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('未認証で /analytics/report にアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/analytics/report')
    await expect(page).toHaveURL('/login')
  })
})

test.describe('レポートページ（認証済み）', () => {
  test('/analytics/report にアクセスするとレポートのタイトルが表示される', async ({ page }) => {
    const reportPage = new ReportPage(page)
    await reportPage.goto()
    await expect(reportPage.heading).toBeVisible()
  })

  test('サマリーカード（総投稿数・総表示回数・総いいね数）が3つ表示される', async ({ page }) => {
    const reportPage = new ReportPage(page)
    await reportPage.goto()
    await expect(reportPage.totalPostsCard).toBeVisible()
    await expect(reportPage.totalImpressionsCard).toBeVisible()
    await expect(reportPage.totalLikesCard).toBeVisible()
  })

  test('印刷ボタンが表示される', async ({ page }) => {
    const reportPage = new ReportPage(page)
    await reportPage.goto()
    await expect(reportPage.printButton).toBeVisible()
  })

  test('生成日が表示される', async ({ page }) => {
    const reportPage = new ReportPage(page)
    await reportPage.goto()
    await expect(page.getByText(/生成日:/)).toBeVisible()
  })

  test('投稿別パフォーマンステーブルが表示される', async ({ page }) => {
    const reportPage = new ReportPage(page)
    await reportPage.goto()
    await expect(page.getByRole('heading', { name: '投稿別パフォーマンス' })).toBeVisible()
    await expect(reportPage.postsTable).toBeVisible()
  })

  test('/analytics の「レポートを印刷」リンクをクリックすると /analytics/report に遷移する', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page)
    await analyticsPage.goto()
    await analyticsPage.printLink.click()
    // target="_blank" なので新しいタブが開く場合に対応
    const newPage = await page.context().waitForEvent('page').catch(() => null)
    if (newPage) {
      await expect(newPage).toHaveURL(/\/analytics\/report/)
    } else {
      await expect(page).toHaveURL(/\/analytics\/report/)
    }
  })
})
