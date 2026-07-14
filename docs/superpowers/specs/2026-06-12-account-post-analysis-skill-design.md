# account-post-analysis スキル設計

## 背景・目的

`dober`リポジトリには `.claude/skills/dober-analysis` というスキルがあり、Notionに同期したThreadsデータを分析してレポートを生成している。これをこのリポジトリ(`nexauto`)にも適用したい。

NexAutoは複数のSNSアカウント（Threads/X）を管理するアプリであり、Supabaseに `posts` / `accounts` / `post_metrics` / `account_metrics` テーブルを持つ。dober側のようなNotion経由ではなく、このアプリ自身のデータと、投稿時点のプラットフォームAPIから取得する最新メトリクスを使って分析レポートを生成する。

将来的に分析系スキルが増える可能性（競合分析、コンテンツ戦略など）を考慮し、機能を1つに絞った汎用スキルとして実装する。アカウント固有の追加設定（KPIなど）は今回は不要と判断し、対象外とする。

## スキル概要

- **スキル名**: `account-post-analysis`
- **場所**: `.claude/skills/account-post-analysis/`
- **トリガー例**: 「Doberの今週の投稿を分析して」「〇〇アカウントのレポートを出して」「先月の振り返り」など
- **対応範囲**: `accounts`テーブルに登録されている任意のアカウント（platform: threads / x）。アカウント名は部分一致で解決する

## ディレクトリ構成

```
.claude/skills/account-post-analysis/
├── SKILL.md
├── scripts/
│   └── analyze.ts        # メイン処理（ライブ取得＋集計＋レポート生成）
└── reports/
    └── <account-slug>/
        └── YYYY-MM-DD_HHMM_analysis.md
```

- `<account-slug>`: `account_name` を英数字とハイフンのみにスラッグ化したもの（例: `Dober/Threads` → `dober-threads`）

## 前提となる変更

### devDependencyの追加

単発のTSスクリプトを実行するため、`tsx` を devDependencies に追加する。

```bash
npm install -D tsx
```

実行例:
```bash
npx tsx .claude/skills/account-post-analysis/scripts/analyze.ts "Dober" --days 7
```

## `analyze.ts` の処理仕様

### CLI引数

| 引数 | 必須 | デフォルト | 説明 |
|------|------|-----------|------|
| 第1引数（アカウント名） | 必須 | - | `accounts.account_name` への部分一致（ILIKE）検索文字列 |
| `--days` | 任意 | `7` | 「直近N日間のパフォーマンス」セクションの対象期間 |

直近30日分は固定でTOP投稿集計用に取得する（dober-analysisと同様）。

### Supabaseクライアント

`src/lib/supabase/server.ts` の `createServiceClient()` はNext.jsの`next/headers`に依存するモジュールを経由するため、スクリプトからは使わない。代わりに `@supabase/supabase-js` の `createClient` を直接呼び出し、`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を使ってサービスロールクライアントを作成する。

### 処理ステップ

1. **アカウント特定**
   - `accounts` テーブルを `account_name ILIKE '%<入力>%'` で検索
   - 0件: エラー終了（候補なしを通知）。複数件: 候補一覧を表示して終了（曖昧性をユーザーに解消させる）
   - 取得カラム: `id, account_name, platform, api_key, api_secret, access_token, access_token_secret`

2. **投稿一覧の取得**
   - `posts` テーブルから `account_id = <特定したID>` かつ `status = 'published'` かつ `published_at >= now() - interval '30 days'` を取得
   - 取得カラム: `id, content, scheduled_date, published_at, platform_post_id, source`
   - `platform_post_id` が `null` の投稿は「メトリクス取得対象外」として件数のみ別集計する

3. **ライブメトリクス取得**
   - 各投稿について、`platform`に応じて以下を呼び出す:
     - `threads`: `decrypt(account.access_token)` → `fetchThreadsPostMetrics({ mediaId: post.platform_post_id, accessToken })`（`src/lib/threads-metrics.ts`, `src/lib/crypto.ts` を直接import）
     - `x`: `decrypt(...)` した4トークンを使い `fetchXPostMetrics({ tweetId: post.platform_post_id, apiKey, apiSecret, accessToken, accessTokenSecret })`（`src/lib/x-metrics.ts`）
   - API呼び出し間に簡単な待機（例: 300ms〜1秒）を入れてレート制限を回避する
   - 取得失敗（例外・エラーレスポンス）した投稿は `fetchError: true` を付与し、後段の集計からは除外しつつ件数をレポートに明記する

4. **フォロワー数トレンドの取得**
   - `account_metrics` テーブルから `account_id` に紐づくレコードを `fetched_at` 降順で取得
   - 週次トレンド（直近8週）の各週について、その週の最終時点に最も近い `followers_count` を採用する

5. **集計**
   - dober-analysisの`analyze()`関数と同等のロジックをTSで実装:
     - 総投稿数・総インプレッション・総ライク・総リプライ・総リポスト・平均インプレッション・平均エンゲージメント率
     - エンゲージメント率 = `(likes + replies + reposts) / impressions * 100`（impressions=0なら0）
     - 直近`--days`日間のサマリー
     - 週次トレンド（直近8週）: 投稿数・インプレッション・ライク・平均エンゲージメント率・週末時点のフォロワー数
     - TOP10投稿（直近30日・インプレッション順）
     - TOP5投稿（直近30日・エンゲージメント率順）

6. **レポート生成・保存**
   - dober-analysisの`generate_report()`と同等のMarkdownを生成（KPIギャップセクションは含めない）
   - 取得失敗投稿があれば「メトリクス取得失敗: N件」を全体サマリーに注記
   - `platform_post_id`なし投稿があれば「メトリクス対象外（未連携投稿）: N件」を注記
   - 保存先: `.claude/skills/account-post-analysis/reports/<account-slug>/YYYY-MM-DD_HHMM_analysis.md`
   - ディレクトリが無ければ作成する

### レポートフォーマット（Markdown構成）

```markdown
# <account_name> 投稿分析レポート (YYYY年MM月DD日)

## 全体サマリー
| 指標 | 値 |
|------|-----|
| 総投稿数 | ... |
| 総インプレッション | ... |
| 総ライク | ... |
| 総リプライ | ... |
| 総リポスト | ... |
| 平均インプレッション/投稿 | ... |
| 平均エンゲージメント率 | ...% |
| メトリクス取得失敗 | N件 |
| メトリクス対象外（未連携投稿） | N件 |
| データ期間 | YYYY-MM-DD 〜 YYYY-MM-DD |

## 直近N日間のパフォーマンス
（dober-analysisと同様）

## 週次トレンド（直近8週）
| 週末日 | 投稿数 | インプレッション | ライク | 平均エンゲージメント率 | フォロワー数 |
|--------|--------|------------------|--------|------------------------|--------------|

## TOP10投稿（インプレッション順・直近30日）
## TOP5投稿（エンゲージメント率順・直近30日）

---
*生成日時: ...*
```

## SKILL.md の役割

1. ユーザー発話からアカウント名候補を抽出
2. `npx tsx .claude/skills/account-post-analysis/scripts/analyze.ts "<アカウント名>" --days <N>` を実行
   - `<N>`は発話内容（「今週」=7、「今月」=30など）から判断、指定なしはデフォルト7
3. スクリプトが生成したレポートファイルを読み込み、以下のセクションを追記して保存：
   ```markdown
   ## インサイト分析

   ### 注目投稿の傾向
   （高パフォーマンス投稿のテーマ・文体・フォーマットの共通点）

   ### エンゲージメント考察
   （ライク率・リプライ率・週次トレンド・フォロワー推移から読み取れること）

   ### 次のアクション
   （投稿テーマ・フォーマット・投稿時間に関する具体的な改善提案）
   ```
4. レポートの要約をユーザーに提示

## エラー処理まとめ

| ケース | 挙動 |
|--------|------|
| アカウント名が0件/複数件マッチ | スクリプトはエラー終了し、候補一覧 or 該当なしメッセージを表示。SKILL側はユーザーに確認を求める |
| `platform_post_id`が無い投稿 | 集計対象外、件数のみレポートに記載 |
| プラットフォームAPI呼び出し失敗 | その投稿を集計から除外、失敗件数をレポートに記載。処理は継続 |
| 投稿が0件 | レポートにその旨を記載し、セクションは空欄または「データなし」と表示 |

## スコープ外

- KPI目標・アカウント別背景コンテキストの管理（今回は不要と判断）
- `post_metrics`テーブルへの書き込み・更新（既存cronの責務のまま変更しない）
- 複数アカウントの一括レポート生成（1回の実行で1アカウント）
