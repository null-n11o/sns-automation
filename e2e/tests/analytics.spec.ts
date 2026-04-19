import { test, expect } from '@playwright/test'
import { SidebarPage } from '../pages/sidebar.page'
import { AnalyticsPage } from '../pages/analytics.page'

// このファイルは admin プロジェクトで実行される

test.describe('未認証', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('未認証で /analytics にアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page).toHaveURL('/login')
  })
})

test.describe('分析ダッシュボード（認証済み）', () => {
  test('サイドバーに「分析」リンクが表示される', async ({ page }) => {
    const sidebar = new SidebarPage(page)
    await page.goto('/posts')
    await expect(sidebar.navLink('分析')).toBeVisible()
  })

  test('「分析」リンクをクリックすると /analytics に遷移する', async ({ page }) => {
    const sidebar = new SidebarPage(page)
    await page.goto('/posts')
    await sidebar.navLink('分析').click()
    await expect(page).toHaveURL('/analytics')
  })

  test('/analytics ページに「分析」見出しが表示される', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page)
    await analyticsPage.goto()
    await expect(analyticsPage.heading).toBeVisible()
  })

  test('アカウントがない場合は空メッセージ、ある場合はサマリーカードが表示される', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page)
    await analyticsPage.goto()

    const hasAccounts = await analyticsPage.totalPostsCard.isVisible()
    if (hasAccounts) {
      await expect(page.getByText('総表示回数')).toBeVisible()
      await expect(page.getByText('総いいね数')).toBeVisible()
    } else {
      await expect(analyticsPage.emptyAccountsMessage).toBeVisible()
    }
  })

  test('published 投稿がある場合、MetricsTable か空メッセージが表示される', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page)
    await analyticsPage.goto()

    const hasAccounts = await analyticsPage.totalPostsCard.isVisible()
    if (hasAccounts) {
      const tableVisible = await analyticsPage.metricsTable.isVisible()
      const emptyVisible = await analyticsPage.emptyMetricsMessage.isVisible()
      expect(tableVisible || emptyVisible).toBe(true)
    }
  })
})
