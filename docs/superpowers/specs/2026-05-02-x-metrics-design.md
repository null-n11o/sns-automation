# X メトリクス取得機能 設計ドキュメント

## 概要

XのFree APIを使い、投稿済みツイートの `public_metrics`（likes・reposts・replies）を取得してDBに保存する。既存のThreadsメトリクス収集と同じパターンで実装する。

## アーキテクチャ

### 新規ファイル

**`src/lib/x-metrics.ts`**

- `twitter-api-v2` の `client.v2.singleTweet()` を使い `public_metrics` フィールドを取得
- シグネチャ: `fetchXPostMetrics({ tweetId, apiKey, apiSecret, accessToken, accessTokenSecret })`
- 戻り値: `{ impressions: 0, likes: number, reposts: number, replies: number }`
- `impressions` は Free プランで取得不可のため常に `0` を返す

### 修正ファイル

**`src/app/api/metrics/fetch/route.ts`**

- DBクエリの `select` に `api_key`, `api_secret`, `access_token_secret` を追加
- 現在 `platform !== 'threads'` でスキップしているロジックを以下に変更：
  - `platform === 'threads'` → `fetchThreadsPostMetrics` を呼ぶ（既存）
  - `platform === 'x'` → `fetchXPostMetrics` を呼ぶ（新規）
- マイルストーン（1h, 24h, 7d）のロジックは両プラットフォーム共通でそのまま使う

### テスト

**`src/test/lib/x-metrics.test.ts`**（新規）
- `twitter-api-v2` をモックして `fetchXPostMetrics` の正常系をテスト
- impressions が常に 0 であることを確認

**`src/test/api/metrics-fetch.test.ts`**（修正）
- Xプラットフォームの投稿に対してメトリクスが取得・保存されるケースを追加

## データフロー

```
Cron (1h/24h/7d) → GET /api/metrics/fetch
  → Supabaseからpublished投稿を取得
  → platform === 'x'  → fetchXPostMetrics → post_metricsに保存
  → platform === 'threads' → fetchThreadsPostMetrics → post_metricsに保存
```

## 制約・前提

- X Free プランで利用可能な `public_metrics` のみ使用
- `impressions` は常に `0` で保存（Free プランの制限）
- Xアカウントには `api_key`, `api_secret`, `access_token`, `access_token_secret` の4つが必要
- DBスキーマ変更なし（既存の `post_metrics` テーブルをそのまま使用）
