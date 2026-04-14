import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { SidebarPage } from '../pages/sidebar.page'

// このファイルは admin プロジェクトで実行される
// 未認証テストは storageState を上書きして実行する

test.describe('未認証', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('正しい認証情報でログインすると /posts に遷移する', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('e2e-admin@test.com', 'Admin123456!')
    await expect(page).toHaveURL('/posts')
  })

  test('誤ったパスワードではエラーメッセージが表示される', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('e2e-admin@test.com', 'wrongpassword')
    await expect(loginPage.errorMessage).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('未認証で /posts にアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/posts')
    await expect(page).toHaveURL('/login')
  })
})

test.describe('認証済み', () => {
  // admin の storageState を使用（プロジェクト設定から引き継ぐ）

  test('ログアウトすると /login にリダイレクトされる', async ({ page }) => {
    const sidebar = new SidebarPage(page)
    await page.goto('/posts')
    await sidebar.logout()
    await expect(page).toHaveURL('/login')
  })
})
