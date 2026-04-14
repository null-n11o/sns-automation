import { test, expect } from '@playwright/test'
import { SidebarPage } from '../pages/sidebar.page'
import { UsersPage } from '../pages/users.page'
import { CompaniesPage } from '../pages/companies.page'

// このファイルは operator プロジェクトで実行される

test.describe('operator の権限制御', () => {
  test('operator が /users にアクセスすると「管理者のみ」メッセージが表示される', async ({ page }) => {
    const usersPage = new UsersPage(page)
    await usersPage.goto()
    await expect(usersPage.accessDeniedMessage).toBeVisible()
    await expect(usersPage.inviteButton).not.toBeVisible()
  })

  test('operator が /companies にアクセスすると「管理者のみ」メッセージが表示される', async ({ page }) => {
    const companiesPage = new CompaniesPage(page)
    await companiesPage.goto()
    await expect(companiesPage.accessDeniedMessage).toBeVisible()
    await expect(companiesPage.saveButton).not.toBeVisible()
  })

  test('operator のサイドバーに「ユーザー管理」リンクが表示されない', async ({ page }) => {
    const sidebar = new SidebarPage(page)
    await page.goto('/posts')
    await expect(sidebar.navLink('ユーザー管理')).not.toBeVisible()
  })

  test('operator のサイドバーに「企業設定」リンクが表示されない', async ({ page }) => {
    const sidebar = new SidebarPage(page)
    await page.goto('/posts')
    await expect(sidebar.navLink('企業設定')).not.toBeVisible()
  })

  test('operator のサイドバーに「投稿管理」「アカウント」リンクは表示される', async ({ page }) => {
    const sidebar = new SidebarPage(page)
    await page.goto('/posts')
    await expect(sidebar.navLink('投稿管理')).toBeVisible()
    await expect(sidebar.navLink('アカウント')).toBeVisible()
  })
})
