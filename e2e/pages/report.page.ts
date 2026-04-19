import { type Page, type Locator } from '@playwright/test'

export class ReportPage {
  readonly heading: Locator
  readonly printButton: Locator
  readonly generatedAt: Locator
  readonly totalPostsCard: Locator
  readonly totalImpressionsCard: Locator
  readonly totalLikesCard: Locator
  readonly postsTable: Locator

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: 'SNS パフォーマンスレポート' })
    this.printButton = page.getByRole('button', { name: '印刷 / PDF保存' })
    this.generatedAt = page.locator('p.text-sm.text-gray-500')
    this.totalPostsCard = page.getByText('総投稿数')
    this.totalImpressionsCard = page.getByText('総表示回数')
    this.totalLikesCard = page.getByText('総いいね数')
    this.postsTable = page.locator('table')
  }

  async goto() {
    await this.page.goto('/analytics/report')
  }
}
