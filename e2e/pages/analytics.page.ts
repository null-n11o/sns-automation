import { type Page, type Locator } from '@playwright/test'

export class AnalyticsPage {
  readonly heading: Locator
  readonly printLink: Locator
  readonly emptyAccountsMessage: Locator
  readonly emptyMetricsMessage: Locator
  readonly totalPostsCard: Locator
  readonly metricsTable: Locator

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: '分析', level: 1 })
    this.printLink = page.getByRole('link', { name: 'レポートを印刷' })
    this.emptyAccountsMessage = page.getByText('アカウントがありません。')
    this.emptyMetricsMessage = page.getByText('メトリクスデータがありません。投稿が公開されるとここに表示されます。')
    this.totalPostsCard = page.getByText('総投稿数')
    this.metricsTable = page.locator('table')
  }

  async goto() {
    await this.page.goto('/analytics')
  }
}
