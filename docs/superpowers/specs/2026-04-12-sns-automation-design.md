# SNS自動投稿プラットフォーム 設計書

**作成日**: 2026-04-12  
**ステータス**: 承認済み

---

## 1. システム概要

「承認フロー付きSNS運用AIエージェント」。マルチテナント対応のSNS自動投稿管理プラットフォーム。AIによる自律生成・スケジュール投稿・自己改善ループを備え、人間が最終承認を保持する構造。

初期フェーズは自社利用。将来的にSNS運用代行のクライアントへSaaSとして提供する。

---

## 2. アーキテクチャ

### 技術スタック

| レイヤー | 技術 |
|--------|------|
| フロントエンド/バックエンド | Next.js (App Router) + TypeScript |
| UIコンポーネント | shadcn/ui + Tailwind CSS |
| データベース・認証 | Supabase (PostgreSQL + Auth + RLS) |
| AI | Anthropic API (Claude) |
| デプロイ | Vercel |
| スケジューラー | Vercel Cron |
| MCPサーバー | packages/mcp-server（同リポジトリ内） |

### 全体構成図

```
┌─────────────────────────────────────────┐
│           Vercel (Next.js)              │
│                                         │
│  App Router                             │
│  ├── /app/(auth)/          認証ページ   │
│  ├── /app/(dashboard)/     管理UI       │
│  │   ├── companies/        企業管理     │
│  │   ├── accounts/         アカウント   │
│  │   └── posts/            投稿管理     │
│  └── /app/api/                          │
│      ├── generate/         AI生成       │
│      ├── publish/          即時投稿     │
│      ├── metrics/          メトリクス取得│
│      └── cron/publish      定期投稿     │
│                                         │
│  vercel.json → Cron: 毎分 /api/cron/publish
│               Cron: 定期 /api/metrics/fetch
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   Supabase               Anthropic API
   ├── PostgreSQL          (Claude)
   ├── Auth
   └── RLS (テナント分離)
         │
         ▼
   X API / Threads API
```

### データフロー

1. ユーザーが「1週間分を生成」ボタン押下
2. `/api/generate` が先週のメトリクスを分析 → `prompt_config` を自動更新 → Claude API でポスト生成
3. `draft` ステータスで一括保存 → テーブルに表示
4. ユーザーがレビュー・編集 → `ready` に変更
5. Vercel Cron が毎分 `/api/cron/publish` を実行 → `ready` かつ `scheduled_date <= now()` のポストをX/Threadsに投稿 → `published` に更新
6. 投稿後 1時間・24時間・7日後にメトリクスを自動取得

---

## 3. データモデル

```sql
-- 企業（テナント）
companies
  id          uuid PK
  name        text
  created_at  timestamptz

-- ユーザー（Supabase Authと連携）
users
  id          uuid PK  ← Supabase Auth の user.id と一致
  company_id  uuid FK → companies
  email       text
  role        text     -- 'admin' | 'operator'
  created_at  timestamptz

-- SNSアカウント
accounts
  id            uuid PK
  company_id    uuid FK → companies
  platform      text     -- 'x' | 'threads'
  account_name  text
  api_key       text     -- AES-256暗号化
  api_secret    text     -- AES-256暗号化
  posting_times jsonb    -- 例: ["09:00", "13:00", "19:00"]
  created_at    timestamptz

-- プロンプト設定（アカウントと1:1）
prompt_configs
  id             uuid PK
  account_id     uuid FK → accounts (UNIQUE)
  system_prompt  text
  reference_data text    -- 既存ポスト例・世界観ドキュメント
  updated_at     timestamptz
  updated_by     text    -- 'ai' | 'manual'

-- ポスト
posts
  id             uuid PK
  account_id     uuid FK → accounts
  content        text
  scheduled_date timestamptz
  status         text  -- 'draft' | 'review' | 'ready' | 'published' | 'failed'
  source         text  -- 'ai' | 'manual'
  error_message  text  -- failed時の理由
  created_at     timestamptz

-- パフォーマンスメトリクス（時系列）
post_metrics
  id          uuid PK
  post_id     uuid FK → posts
  fetched_at  timestamptz
  impressions int
  likes       int
  reposts     int
  replies     int

-- フォロワー数推移（アカウントごと）
account_metrics
  id              uuid PK
  account_id      uuid FK → accounts
  fetched_at      timestamptz
  followers_count int

-- プロンプト変更履歴
prompt_config_history
  id             uuid PK
  account_id     uuid FK → accounts
  system_prompt  text
  reference_data text
  changed_at     timestamptz
  changed_by     text  -- 'ai' | 'manual'
```

### マルチテナント分離（RLS）

全テーブルにRow Level Securityを設定。ログイン中ユーザーの `company_id` に属するデータのみ読み書き可能。APIレベルでの分離チェックを最小化。

---

## 4. 主要機能

### 4.1 ポスト生成（2ルート）

**Route A: プラットフォームAI生成（有料プラン向け）**
- 管理UIの「1週間分を生成」ボタンから実行
- プラットフォームのAnthropicAPIキーを使用
- 生成前に自己改善ループを実行（後述）

**Route B: Claude Code経由（自前Claudeプラン向け）**
- MCPサーバーに接続したClaude Codeから実行
- `create_post` ツールで1件ずつ保存（7件なら7回呼び出し）
- 同じ管理UIに反映される

### 4.2 アカウント設定UI

アカウント管理画面（admin権限のみ）：

```
アカウント設定
├── 基本情報（アカウント名・プラットフォーム選択）
├── API認証情報
│   ├── X:       API Key / API Secret / Access Token / Access Token Secret
│   └── Threads: App ID / App Secret / Access Token
├── 投稿時刻設定（posting_times: 時刻を追加・削除）
└── プロンプト設定
    ├── System Prompt（テキストエリア）
    └── Reference Data（既存ポスト例・世界観ドキュメント）
```

- APIキーは入力後マスク表示（`••••••••`）
- 「接続テスト」ボタンで認証情報の有効性を確認できる
- 保存時にサーバーサイドでAES-256暗号化

### 4.3 ポスト管理UI

```
投稿管理画面
├── アカウント切り替えタブ
├── 「＋ 新規作成」ボタン（手動ポスト作成モーダル）
├── 「1週間分を生成」ボタン（AI生成）
└── ポスト一覧テーブル
    ├── カラム: 内容・投稿日時・ステータス・ソース・操作
    ├── インライン編集（draft/review ステータス時のみ）
    ├── 即時投稿ボタン（各行）
    └── ステータス変更（ドロップダウン）
```

**ステータス遷移：**
```
draft → review → ready → published
                       ↘ failed（リトライ可）
```

- `ready` になったポストは編集ロック（「下書きに戻す」ボタンで `draft` に戻せる）

### 4.4 スケジュール投稿

- Vercel Cron が毎分 `/api/cron/publish` を実行
- `status = 'ready'` かつ `scheduled_date <= now()` のポストを対象に投稿
- 成功時: `status = 'published'`
- 失敗時: `status = 'failed'`、`error_message` にエラー内容を保存

### 4.5 手動・即時投稿

- テーブルの各行に「今すぐ投稿」ボタン
- `/api/publish` を直接呼び出し

### 4.6 自己改善ループ

「1週間分を生成」ボタン押下時に自動実行：

1. **分析**: 先週の `published` ポスト + メトリクスを取得
2. **評価**: Claudeが「伸びたポストの特徴 / 伸びなかったポストの特徴」を分析
3. **更新**: `prompt_config` の `system_prompt` と `reference_data` を自動更新
4. **生成**: 更新されたプロンプトで今週分を生成

変更履歴を保存し、人間がいつでも手動で上書き可能。「AIによる自動更新をスキップ」オプションも提供。

### 4.7 分析・レポート機能

**分析ダッシュボード（アカウントごと）：**
- 投稿別パフォーマンス（インプレッション・いいね・リポスト・リプライ）
- フォロワー数推移
- 期間フィルター（週・月・カスタム）

**メトリクス自動収集：**
- 投稿後 1時間・24時間・7日後に Vercel Cron で自動取得
- 初期対応: Threads（無料API）
- X: 有料APIプラン契約後に対応追加

**レポート生成：**
- アカウントごとに期間指定でレポートを生成
- 形式: 印刷対応ページ（ブラウザ印刷 / PDF保存）
- 管理者がクライアントのアカウントにログインしてレポートを作成・共有

---

## 5. MCPサーバー

### 位置づけ

`packages/mcp-server/` として同リポジトリに同梱。クライアントが自前のClaude Code / Claude Desktop から接続して使用する。

### 提供ツール

```
create_post(account_id, content, scheduled_date)
  → 1件のポストを draft で保存

list_accounts()
  → 利用可能なアカウント一覧を返す

list_posts(account_id, status?)
  → 既存ポストの一覧を返す

update_post(id, content?, scheduled_date?, status?)
  → ポストの内容・日時・ステータスを更新
```

### 設定方法

`~/.claude/claude_desktop_config.json` にMCPサーバーを登録することで利用可能。

---

## 6. セキュリティ

- X / Threads の APIキーは Supabase 保存前に AES-256 で暗号化
- 暗号化キーは Vercel 環境変数で管理（DBには入れない）
- Supabase RLS により全テーブルでテナント分離
- MCPサーバーは認証済みユーザーのトークンで Supabase に接続

---

## 7. 権限

| 権限 | admin | operator |
|------|-------|----------|
| 企業・ユーザー管理 | ✅ | ❌ |
| アカウント・API設定 | ✅ | ❌ |
| プロンプト設定 | ✅ | ✅ |
| ポスト生成・編集・承認 | ✅ | ✅ |
| 分析・レポート | ✅ | ✅ |

---

## 8. 対応プラットフォーム

| プラットフォーム | 投稿 | メトリクス自動取得 |
|---------------|------|-----------------|
| Threads | ✅ | ✅（無料API） |
| X (Twitter) | ✅ | 有料APIプラン後に対応 |

---

## 9. 実装ステップ（概略）

1. Supabase セットアップ（DB・Auth・RLS）
2. Next.js プロジェクト初期化・認証実装
3. マルチテナント基盤（企業・ユーザー・アカウントCRUD）
4. ポスト管理UI（テーブル・ステータス管理）
5. Claude API連携・ポスト生成機能
6. Threads API連携・スケジュール投稿
7. X API連携
8. メトリクス収集・分析ダッシュボード
9. 自己改善ループ実装
10. MCPサーバー実装
