# E2E Testing Setup Design

**Date:** 2026-04-14
**Scope:** Playwright E2E テスト基盤のセットアップ（Task 5 まで網羅、Task 9 まで拡張可能）

---

## 概要

Playwright を使った E2E テスト基盤を構築する。テスト実行環境は Supabase Local（Docker）を使い、本番DBとは完全に分離する。Page Object Model でテストコードを整理し、Task 9 まで安定してスケールできる構成にする。CI 対応は今回スコープ外とし、ローカル実行を前提とする。

---

## アーキテクチャ

### ディレクトリ構造

```
e2e/
  fixtures/
    auth.setup.ts         # admin / operator の storageState を保存
  pages/                  # Page Object Model
    login.page.ts         # ログインページの操作
    sidebar.page.ts       # サイドバーの操作・ナビゲーション
    companies.page.ts     # 企業設定ページの操作
    users.page.ts         # ユーザー管理ページの操作
  tests/
    auth.spec.ts          # ログイン・ログアウトフロー
    companies.spec.ts     # 企業設定（admin）
    users.spec.ts         # ユーザー管理（admin CRUD）
    access-control.spec.ts # operator の権限制御
playwright.config.ts
supabase/
  seed.sql                # E2E テスト用シードデータ（既存 migrations の後に適用）
.env.test.local           # Supabase Local 用の環境変数（gitignore 対象）
```

---

## 認証戦略

Playwright の `storageState` を使い、テストごとにログインしない。

1. `auth.setup.ts` を `setup` プロジェクトとして定義
2. admin / operator それぞれでログインし、セッションを `e2e/fixtures/.auth/` に保存
3. 各テストプロジェクトは `storageState` を読み込んで即ページアクセス

```
e2e/fixtures/.auth/
  admin.json       # admin の storageState
  operator.json    # operator の storageState
```

`.auth/` は `.gitignore` に追加する。

---

## Supabase Local との連携

### 環境変数（`.env.test.local`）

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001
CRON_SECRET=test-cron-secret
```

### テスト実行手順

```bash
supabase start             # Local Supabase を起動
supabase db reset          # migrations + seed.sql を適用
npm run test:e2e           # Playwright 実行（devサーバー自動起動）
```

`playwright.config.ts` の `webServer` で `next dev` を自動起動し、テスト完了後に停止する。

### シードデータ（`supabase/seed.sql`）

```sql
-- テスト用企業
INSERT INTO companies (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'E2E Test Company');

-- auth.users への挿入（GoTrue 互換）
-- パスワードは Supabase Local の auth.admin API で作成するため、
-- seed.sql は users テーブルへの挿入のみ行う
-- → auth.setup.ts 内で supabase.auth.admin.createUser() を使う
```

auth ユーザーの作成は `auth.setup.ts` 内で Supabase JS Client の `auth.admin.createUser()` を呼び出して行う（seed.sql での直接挿入は GoTrue との整合性リスクがあるため避ける）。

---

## テストカバレッジ（Task 5）

### `auth.spec.ts`

| テストケース | 確認内容 |
|---|---|
| 正しい認証情報でログイン | `/posts` にリダイレクトされる |
| 誤ったパスワードでログイン | エラーメッセージが表示される |
| ログアウト | `/login` にリダイレクトされる |
| 未認証で `/posts` にアクセス | `/login` にリダイレクトされる |

### `companies.spec.ts`（admin）

| テストケース | 確認内容 |
|---|---|
| 企業設定ページを開く | 企業名・企業IDが表示される |
| 企業名を変更して保存 | 「保存しました」が表示され、リロード後も反映されている |

### `users.spec.ts`（admin）

| テストケース | 確認内容 |
|---|---|
| ユーザー一覧を開く | admin・operator ユーザーが一覧に表示される |
| 新規ユーザーを追加 | 一覧に追加したユーザーが表示される |
| ユーザーを削除 | 一覧から削除されている |
| 自分自身には削除ボタンが表示されない | 「（自分）」ラベルが表示される |

### `access-control.spec.ts`

| テストケース | 確認内容 |
|---|---|
| operator が `/users` にアクセス | 「管理者のみ閲覧できます」が表示される |
| operator が `/companies` にアクセス | 「管理者のみ閲覧できます」が表示される |
| operator のサイドバー | 「ユーザー管理」「企業設定」リンクが表示されない |

---

## Page Object の責務

各 Page Object はセレクターとアクションを持ち、テストに assertion は書かない。assertion はテスト側の責務とする。

```ts
// 例: users.page.ts
class UsersPage {
  async goto() { ... }
  async inviteUser(email, password, role) { ... }
  async deleteUser(email) { ... }
  getUserRow(email) { ... }  // Locator を返す
}
```

---

## スコープ外

- GitHub Actions による CI 実行
- Playwright MCP の導入
- Task 6〜9 のテスト（各 Task 完了時に追加予定）
- Visual regression テスト

---

## `package.json` 追加スクリプト

```json
"test:e2e": "dotenv -e .env.test.local -- playwright test",
"test:e2e:ui": "dotenv -e .env.test.local -- playwright test --ui"
```

`dotenv-cli` を devDependency に追加して `.env.test.local` を読み込む。
