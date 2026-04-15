import { test, expect } from '@playwright/test'
import { CompaniesPage } from '../pages/companies.page'

test.describe('企業設定ページ（admin）', () => {
  test('企業IDと企業名が表示される', async ({ page }) => {
    const companiesPage = new CompaniesPage(page)
    await companiesPage.goto()
    await expect(companiesPage.companyIdText).toContainText('00000000-0000-0000-0000-000000000001')
    await expect(companiesPage.companyNameInput).toHaveValue('E2E Test Company')
  })

  test('企業名を変更して保存すると「保存しました」が表示される', async ({ page }) => {
    const companiesPage = new CompaniesPage(page)
    await companiesPage.goto()
    await companiesPage.updateName('Updated Company Name')
    await expect(companiesPage.successMessage).toHaveText('保存しました')
  })

  test('企業名変更後にリロードしても変更が反映されている', async ({ page }) => {
    const companiesPage = new CompaniesPage(page)
    await companiesPage.goto()
    await companiesPage.updateName('Reloaded Company Name')
    await expect(companiesPage.successMessage).toHaveText('保存しました')
    await page.reload()
    await companiesPage.companyNameInput.waitFor({ state: 'visible' })
    await expect(companiesPage.companyNameInput).toHaveValue('Reloaded Company Name')
    // テスト後に元に戻す
    await companiesPage.updateName('E2E Test Company')
  })
})
