# 分析ページのアカウント別対応 設計

- 日付: 2026-07-08
- ブランチ: `feat/analytics-per-account`

## 背景・課題

`/analytics`（メイン分析画面）と `/analytics/report`（印刷用）は、公開済み投稿を
**全アカウントまとめて**取得・集計している。`account_id` によるフィルタが無く、
上部サマリーカード（総投稿数・総表示回数・総いいね数）と投稿テーブルがアカウント混在になる。

複数アカウント（例: Dober / Kentaro Nakano）を運用しており、アカウントごとに
パフォーマンスを見たい。

同じ `/analytics` 配下の `/analytics/reports`（分析レポート一覧）は既に
`ReportsList` でアカウント切り替えタブを実装済み。UIとデータ取得の型をこれに合わせる。

## ゴール

- `/analytics` を「先頭アカウントをデフォルト表示し、ボタンタブで切り替え」に変更する。
- サマリーカードと投稿テーブルを**選択中アカウントのみ**で集計する。
- 印刷ページ `/analytics/report` も**選択アカウント単位**にする（`?account_id=`）。
- `.limit(100)` が**アカウント単位で効く**ようにする（現状は全アカウント合算で100件）。

## 非ゴール

- メトリクスの取得ロジック（1h/24h/7d の自動取得）自体は変更しない。
- 「全アカウント合算」ビューは提供しない（アカウント別に分けるのが目的）。
- `ReportsList` / `/api/analytics/reports` の既存挙動は変更しない。

## アーキテクチャ

`ReportsList` + `/api/analytics/reports` と同型で構成する。

### 1. 新APIルート `GET /api/analytics/metrics?account_id=`

- 認証・スコープは `/api/analytics/reports/route.ts` と同じ（`supabase.auth.getUser()` +
  RLS）。未認証は 401、`account_id` 未指定は 400。
- 指定アカウントの `status='published'` 投稿を `post_metrics(impressions, likes, reposts,
  replies, fetched_at)` 付きで取得。`.eq('account_id', accountId)`、
  `.order('published_at', { ascending: false })`、`.limit(100)`。
- 「各投稿の最新メトリクスだけ残す」処理をここ（サーバー側）に一本化し、
  `latest_metrics` を付与した配列を返す。
- レスポンス: `PostWithLatestMetrics[]`（JSON配列）。

### 2. 新クライアントコンポーネント `MetricsView`

- ファイル: `src/components/analytics/MetricsView.tsx`
- props: `accounts: AccountOption[]`, `initialPosts: PostWithLatestMetrics[]`
- state: `selectedAccountId`（初期値 `accounts[0].id`）, `posts`（初期値 `initialPosts`）
- タブUIは `ReportsList` と同じボタンチップ（選択中は `bg-gray-900 text-white`）。
- タブクリック → `fetch('/api/analytics/metrics?account_id=X')` で `posts` を差し替え。
  取得失敗時は空配列にフォールバック。
- サマリーカード3枚（総投稿数・総表示・総いいね）は**現在の `posts` から算出**。
- `<MetricsTable posts={posts} />` を描画。
- 「レポートを印刷」リンクをここに置き、選択中アカウントの
  `/analytics/report?account_id=<selectedAccountId>` を指す（`target="_blank"`）。

### 3. `src/app/(dashboard)/analytics/page.tsx`（サーバー）を薄くする

- `accounts` を取得（`id, account_name, platform`、`created_at` 昇順）。
- 先頭アカウント分の投稿＋最新メトリクスを取得（初期表示用、APIと同じクエリ）。
- ヘッダーの h1「分析」と「分析レポート」リンクは残す。
  「レポートを印刷」リンクは `MetricsView` 側に移す（選択アカウント連動のため）。
- アカウント0件時は現状どおり「アカウントがありません。」を表示。
- それ以外は `<MetricsView accounts={accounts} initialPosts={...} />`。

### 4. `src/app/(dashboard)/analytics/report/page.tsx`（印刷ページ）

- `searchParams.account_id` を受け取る。
- `account_id` 未指定時は先頭アカウントにフォールバック（`accounts` を取得して `[0].id`）。
- 投稿クエリに `.eq('account_id', accountId)` を追加。既存の `accounts(account_name,
  platform)` join はそのまま。
- ヘッダーにアカウント名を表示（例: 「SNS パフォーマンスレポート — Dober」）。
  アカウント名は取得した `accounts` から解決する。
- アカウント0件時は簡潔なメッセージ（「アカウントがありません。」）を表示。

## データ型

`MetricsTable` が既に受け取っている `PostWithMetrics`（`Post & { latest_metrics:
PostMetrics | null; account_name?: string }`）に合わせる。API・`MetricsView`・page で
共有できるよう、`latest_metrics` 付きの投稿型を `MetricsTable` の型定義に揃える
（必要なら export して再利用）。

## エラーハンドリング

- API: 未認証 401 / `account_id` 欠落 400 / Supabase エラー 400（`reports` ルート踏襲）。
- `MetricsView`: `fetch` が `!res.ok` の場合は `posts` を空配列にし、`MetricsTable` の
  既存の空表示（「メトリクスデータがありません。」）に委ねる。
- 印刷ページ: アカウント0件は明示メッセージ。投稿0件は既存テーブルが空行になるだけ。

## テスト

- 既存 `ReportDetail.test.tsx` と同じ vitest + Testing Library の枠組みに合わせる。
- `MetricsView`: 初期表示で先頭アカウントのカード値・件数が出ること、タブ切り替えで
  `fetch` が呼ばれ `posts` が差し替わること（`fetch` をモック）。
- 集計ロジック（総投稿数・総表示・総いいね）が `posts` から正しく算出されること。

## 影響範囲

- 追加: `src/app/api/analytics/metrics/route.ts`, `src/components/analytics/MetricsView.tsx`
- 変更: `src/app/(dashboard)/analytics/page.tsx`,
  `src/app/(dashboard)/analytics/report/page.tsx`
- 参照のみ（変更なし）: `MetricsTable.tsx`, `ReportsList.tsx`,
  `/api/analytics/reports/route.ts`

## 実装上の注意

- 本リポジトリの Next.js は破壊的変更ありのバージョン。ページ／ルートを書く前に
  `node_modules/next/dist/docs/` の該当ガイド（`searchParams`、Route Handler、
  Server Component のデータ取得）を確認してから書く。
