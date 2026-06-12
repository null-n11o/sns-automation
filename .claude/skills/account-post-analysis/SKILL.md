---
name: account-post-analysis
description: SNSアカウント（Threads/X）の投稿パフォーマンスを分析し、インサイトレポートを生成する。「<アカウント名>の今週の投稿を分析して」「<アカウント名>のレポートを出して」「<アカウント名>の先月の振り返り」などで起動する。
---

# account-post-analysis

`accounts`テーブルに登録済みのSNSアカウントについて、直近30日の公開済み投稿のライブメトリクス（Threads/X APIから取得した最新のインプレッション・いいね・リプライ・リポスト）とフォロワー数推移を集計し、分析レポートを`account_analysis_reports`テーブルに保存する。

## 実行手順

### Step 1: 分析スクリプトを実行する

ユーザーの発話からアカウント名と分析期間を判断し、以下を実行する。

```bash
npx tsx .claude/skills/account-post-analysis/scripts/analyze.ts "<アカウント名>" --days <N>
```

- `<アカウント名>`: ユーザーが言及したアカウント名の一部（`accounts.account_name`への部分一致）。例: `"Dober"`
- `<N>`: 「今週」→ `7`、「今月」→ `30`、指定が無ければ省略（デフォルト7）

アカウントが見つからない、または複数該当する場合はスクリプトがエラー終了し候補/該当なしを表示する。その場合はユーザーにアカウント名を確認する。

スクリプトはThreads/X APIへ投稿ごとにライブアクセスするため、投稿数に応じて時間がかかる場合がある。

スクリプトは標準出力に以下を出力する:
1. `✅ レポートをDBに保存しました (id: <レコードID>)`
2. `report_data`のJSON（サマリー・週次トレンド・TOP投稿等）

### Step 2: インサイト分析をDBに追記する

Step 1で出力された`report_data`のJSONを読み、以下のキーを持つインサイトJSONを作成する。

```json
{
  "notable_posts": "注目投稿の傾向（TOP投稿のテーマ・文体・フォーマットの共通点）",
  "engagement_review": "エンゲージメント考察（ライク率・リプライ率・週次トレンド・フォロワー推移から読み取れること）",
  "next_actions": "次のアクション（投稿テーマ・フォーマット・投稿時間に関する具体的な改善提案）"
}
```

`mcp__supabase__execute_sql`（`project_id: fdmhkjiqsrzktfmbqlxg`）を使い、Step 1で取得したレコードIDを指定して以下のSQLを実行する（`<...>`部分を実際の値に置き換える）。

```sql
UPDATE account_analysis_reports
SET insights = '<インサイトJSON（エスケープ済み）>'::jsonb,
    insights_generated_at = now()
WHERE id = '<レコードID>';
```

### Step 3: 要約をユーザーに提示する

レポートの主要な数値（全体サマリー・直近N日間のパフォーマンス）とインサイトをユーザーに要約して伝える。レポートはダッシュボードの「分析レポート」ページからも確認できる旨を伝える。
