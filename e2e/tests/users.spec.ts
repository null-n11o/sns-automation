import { test, expect } from '@playwright/test'
import { UsersPage } from '../pages/users.page'

test.describe('ユーザー管理ページ（admin）', () => {
  test('admin と operator ユーザーが一覧に表示される', async ({ page }) => {
    const usersPage = new UsersPage(page)
    await usersPage.goto()
    await expect(usersPage.getUserRow('e2e-admin@test.com')).toBeVisible()
    await expect(usersPage.getUserRow('e2e-operator@test.com')).toBeVisible()
  })

  test('自分自身の行には削除ボタンがなく「（自分）」と表示される', async ({ page }) => {
    const usersPage = new UsersPage(page)
    await usersPage.goto()
    const adminRow = usersPage.getUserRow('e2e-admin@test.com')
    await expect(adminRow.getByText('（自分）')).toBeVisible()
    await expect(adminRow.getByRole('button', { name: '削除' })).not.toBeVisible()
  })

  test('新規ユーザーを追加すると一覧に表示される', async ({ page }) => {
    const usersPage = new UsersPage(page)
    const newEmail = `e2e-new-${Date.now()}@test.com`
    await usersPage.goto()
    await usersPage.inviteUser(newEmail, 'NewUser123!')
    await expect(usersPage.successMessage).toHaveText('ユーザーを追加しました')
    await expect(usersPage.getUserRow(newEmail)).toBeVisible()

    // クリーンアップ
    await usersPage.deleteUser(newEmail)
  })

  test('ユーザーを削除すると一覧から消える', async ({ page }) => {
    const usersPage = new UsersPage(page)
    const deleteEmail = `e2e-delete-${Date.now()}@test.com`

    // まず削除対象ユーザーを追加
    await usersPage.goto()
    await usersPage.inviteUser(deleteEmail, 'DeleteMe123!')
    await expect(usersPage.getUserRow(deleteEmail)).toBeVisible()

    // 削除する
    await usersPage.deleteUser(deleteEmail)

    // 一覧から消えていることを確認
    await expect(usersPage.getUserRow(deleteEmail)).not.toBeVisible()
  })
})
