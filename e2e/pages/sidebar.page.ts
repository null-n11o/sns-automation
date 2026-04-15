import { type Page, type Locator } from '@playwright/test'

export class SidebarPage {
  readonly logoutButton: Locator

  constructor(private page: Page) {
    this.logoutButton = page.getByRole('button', { name: 'ログアウト' })
  }

  navLink(label: string): Locator {
    return this.page.getByRole('link', { name: label, exact: true })
  }

  async logout() {
    await this.logoutButton.click()
  }
}
