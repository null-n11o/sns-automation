import { type Page, type Locator } from '@playwright/test'

export class UsersPage {
  readonly inviteEmailInput: Locator
  readonly invitePasswordInput: Locator
  readonly inviteButton: Locator
  readonly successMessage: Locator
  readonly accessDeniedMessage: Locator

  constructor(private page: Page) {
    this.inviteEmailInput = page.getByLabel('メールアドレス')
    this.invitePasswordInput = page.getByLabel('初期パスワード')
    this.inviteButton = page.getByRole('button', { name: 'ユーザーを追加' })
    this.successMessage = page.locator('p.text-green-600')
    // actual text ends with "。"
    this.accessDeniedMessage = page.getByText('この画面は管理者のみ閲覧できます。')
  }

  async goto() {
    await this.page.goto('/users')
  }

  getUserRow(email: string): Locator {
    return this.page.getByRole('row').filter({ hasText: email })
  }

  async inviteUser(email: string, password: string, role: 'operator' | 'admin' = 'operator') {
    await this.inviteEmailInput.fill(email)
    await this.invitePasswordInput.fill(password)
    if (role === 'admin') {
      await this.page.getByRole('combobox').click()
      await this.page.getByRole('option', { name: '管理者' }).click()
    }
    await this.inviteButton.click()
  }

  async deleteUser(email: string) {
    this.page.once('dialog', dialog => dialog.accept())
    await this.getUserRow(email).getByRole('button', { name: '削除' }).click()
  }
}
