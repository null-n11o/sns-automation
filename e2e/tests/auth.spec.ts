import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { SidebarPage } from '../pages/sidebar.page'
import { LOGINTEST_EMAIL, LOGINTEST_PASSWORD } from '../fixtures/test-users'

// このファイルは admin プロジェクトで実行される
// ログイン/ログアウトテストは専用ユーザーを使い、admin.json のセッションを汚染しない

test.describe('未認証', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('正しい認証情報でログインすると /posts に遷移する', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(LOGINTEST_EMAIL, LOGINTEST_PASSWORD)
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
  // ログアウトはセッショントークンをサーバー側で無効化するため、
  // admin.json の storageState を汚染しないよう手動ログインで独立したセッションを使う
  test.use({ storageState: { cookies: [], origins: [] } })

  test('ログアウトすると /login にリダイレクトされる', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(LOGINTEST_EMAIL, LOGINTEST_PASSWORD)
    await expect(page).toHaveURL('/posts')

    const sidebar = new SidebarPage(page)
    await sidebar.logout()
    await expect(page).toHaveURL('/login')
  })
})
