# フォロワー数トラッキング 設計

- 日付: 2026-07-27
- ブランチ: `feat/followers-count-tracking`

## 背景 / 課題

`account_analysis_reports`（アカウント分析レポート）は週次トレンドにフォロワー数推移を表示する設計になっているが、実際には常に `null` で表示される。

原因は、`analyze.ts` が `account_metrics` テーブルの `followers_count` を SELECT するだけで、**このテーブルに書き込む処理がリポジトリ内に一切存在しない**こと。Threads API からフォロワー数を取得する処理も未実装。

## ゴール

Threads アカウントのフォロワー数を日次で取得し `account_metrics` に蓄積することで、分析レポートの週次トレンドに「フォロワー数」が表示されるようにする。

## スコープ / 非スコープ

- **対象**: Threads アカウントのみ（登録中の2アカウントは両方 Threads）。
- **非対象**: X（Twitter）のフォロワー数収集。将来 `x-followers` として追加できる構造に留めるが、今回は実装しない。
- **履歴のバックフィルはしない**: Threads API の `followers_count` は「その時点の総数」を返す仕様で、過去日付の値は取得できない。実装した日から先の推移のみ蓄積する（ユーザー承認済み: 案A）。

## 既存資産（調査結果）

- Threads API ベース URL: `https://graph.threads.net/v1.0`
- `accounts` テーブル: `platform`, `access_token`(暗号化), `api_key`, `api_secret`, `access_token_secret`, `platform_user_id` を保持。
  - `platform_user_id` = Threads ユーザーID（publish 時の `userId` と同一）。ユーザーインサイト取得に必要。
  - `access_token` は暗号化されており `@/lib/crypto` の `decrypt()` で復号する。
- `account_metrics` テーブル（`supabase/migrations/20260418000001_plan2_schema.sql`）:
  - カラム: `id`, `account_id`, `fetched_at`(default now), `followers_count`(int, default 0)
  - 書き込む処理は現状なし。
- 既存 cron: Vercel Cron が `/api/metrics/fetch` を `0 10 * * *`(UTC = 19:00 JST) で日次実行。
  - 認証: `Authorization: Bearer ${CRON_SECRET}`
  - `createServiceClient()` を使用、`Promise.allSettled` でターゲット横断処理。
- 消費側: `analyze.ts` と `src/components/analytics/ReportDetail.tsx` は既に `followers_count` / `followersCount` を消費している。テーブルが埋まれば週次トレンドに自動反映される。

## アプローチ

**採用: 既存の日次 cron `/api/metrics/fetch` に相乗り**（案1）。

理由:
- 既に日次で回っており、認証・service client・`decrypt` を再利用できる。
- Vercel Cron の本数を増やさない。
- 「日次データ収集」が1エンドポイントに集約される。

関心の同居を避けるため、Threads API 呼び出しは専用モジュールに切り出す。

却下した案:
- 案2（専用 cron 新設）: cron 本数・監視対象が増える。日次1回で足りるため YAGNI。
- 案3（publish cron 相乗り / クライアント側収集）: 投稿有無に関係なく取りたい / トークンをクライアントに出せない。

## 詳細設計

### コンポーネント構成

#### 1. `src/lib/threads-followers.ts`（新規）

Threads ユーザーインサイト API の純粋なラッパー。責務は「フォロワー数を1件取得する」のみ。

```
fetchThreadsFollowersCount({ userId, accessToken }): Promise<number | null>
```

- リクエスト: `GET https://graph.threads.net/v1.0/{userId}/threads_insights?metric=followers_count&access_token=...`
- レスポンス形に注意: `followers_count` は `total_value` 型で返る。
  - `data[].name === 'followers_count'` の要素の `total_value.value` を読む。
  - （投稿単位の `/insights` は `values[0].value` だが、ユーザーインサイトの total 系は `total_value.value`。形が異なる。）
- 取得できない場合（フォロワー100人未満でメトリクス非返却、API エラー、値欠損）は `null` を返す。例外は投げない。

#### 2. `/api/metrics/fetch/route.ts`（変更）

既存の投稿メトリクス収集処理の後に、フォロワー数収集ステップを追加する。

- `accounts` から `platform = 'threads'` かつ `access_token` と `platform_user_id` が非 null のアカウントを取得。
- 各アカウントについて `decrypt(access_token)` → `fetchThreadsFollowersCount({ userId: platform_user_id, accessToken })`。
- 返り値が `number`（非 null）の場合のみ `account_metrics` に `{ account_id, followers_count }` を insert（`fetched_at` は default now）。
  - `null` の場合は insert しない（`0` を入れて推移を汚さない）。
- `Promise.allSettled` でアカウント横断。個別失敗は握りつぶし（console にログ）、他アカウントの処理は継続。
- レスポンス JSON に `followersCollected`（insert 成功件数）を追加。

### データフロー

```
Vercel Cron (日次 19:00 JST)
  → GET /api/metrics/fetch (Bearer CRON_SECRET)
    → [既存] 投稿メトリクス収集 → post_metrics へ insert
    → [新規] threads アカウント一覧取得
        → decrypt(access_token)
        → fetchThreadsFollowersCount()  ── null なら skip
        → account_metrics へ insert
  → 次回以降の分析レポートで週次トレンドに反映
```

### DB / UI

- DB スキーマ変更なし（`account_metrics` を再利用）。
- UI 変更なし（消費側は実装済み）。

### エラーハンドリング / 冪等性

- cron は日次1回のため 1日1スナップショットが基本。
- 手動で複数回叩くと同日に複数行入りうるが、`analyze.ts` は週次で最新値を拾うため実害は小さい。厳密な「1日1行」制約は今回は入れない（YAGNI。必要になれば後日 `(account_id, date)` の unique 制約を検討）。
- API 失敗・トークン欠損・値欠損はすべて「その回の収集をスキップ」に落とす。cron 全体は失敗させない。

## テスト

### `src/lib/threads-followers.test.ts`（新規）
`fetch` をモックして検証:
- `total_value.value` を正常にパースして number を返す。
- メトリクス非返却（`data` が空 / 対象要素なし）時に `null`。
- API エラー（`res.ok === false`）時に `null`。

### 収集ステップのユニット
- 返り値 `null` のアカウントは `account_metrics` に insert されない。
- 複数アカウントで一部が失敗しても、成功したアカウントは insert される。

## 受け入れ条件

- `/api/metrics/fetch` を叩くと、Threads アカウントの `account_metrics` に当日分のフォロワー数が1件蓄積される。
- 分析レポートを再生成すると、週次トレンドの「フォロワー数」に値が表示される（`null` でなくなる）。
- 既存の投稿メトリクス収集の挙動は変わらない。
- `npm run test:run` と `npm run lint` が通る。
