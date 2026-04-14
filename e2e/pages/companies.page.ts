import { type Page, type Locator } from '@playwright/test'

export class CompaniesPage {
  readonly companyNameInput: Locator
  readonly saveButton: Locator
  readonly successMessage: Locator
  readonly companyIdText: Locator
  readonly accessDeniedMessage: Locator

  constructor(private page: Page) {
    this.companyNameInput = page.getByLabel('企業名')
    this.saveButton = page.getByRole('button', { name: '保存' })
    this.successMessage = page.locator('p.text-green-600')
    // actual class: "text-sm font-mono text-gray-700"
    this.companyIdText = page.locator('p.font-mono.text-gray-700')
    // actual text ends with "。"
    this.accessDeniedMessage = page.getByText('この画面は管理者のみ閲覧できます。')
  }

  async goto() {
    await this.page.goto('/companies')
  }

  async updateName(name: string) {
    await this.companyNameInput.fill(name)
    await this.saveButton.click()
  }
}
