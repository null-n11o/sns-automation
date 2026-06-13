# account-post-analysis レポートのDB化 設計

## 背景・目的

`account-post-analysis`スキル（PR #22）は分析レポートを`.claude/skills/account-post-analysis/reports/<account-slug>/YYYY-MM-DD_HHMM_analysis.md`にMarkdownファイルとして保存する。

運用してみたところ、「ファイルとして残るのは不便。アカウント管理者がいつでも分析レポートを見られるようにしたい」という要望が出た。Markdownファイル（git管理）はアカウント管理者（非エンジニア）がアクセスしづらいため、レポートをSupabaseのDBにJSON形式で保存し、ダッシュボードUIから閲覧できるようにする。

合わせて、Claude Code（MCP経由）からも過去レポートを期間指定で取得できるようにする。

## 全体アーキテクチャ・データフロー

```
analyze.ts (CLI)
  ├─ 既存の集計処理（変更なし）
  └─ buildReportData()でJSON構築 → account_analysis_reports へ INSERT
       (report_data = summary/weeklyTrend/topPosts等のJSON、insights = null)
       → 標準出力にレコードIDとreport_dataのJSONを出力

SKILL.md フロー
  ├─ analyze.ts実行 → 標準出力からレコードIDとreport_dataを取得
  ├─ Claudeがreport_dataを元にインサイト分析（JSON形式）を作成
  └─ mcp__supabase__execute_sql で account_analysis_reports をUPDATE
       （insights, insights_generated_at）

ダッシュボード（/analytics/reports, /analytics/reports/[id]）
  └─ account_analysis_reports を一覧・詳細表示

MCPサーバー（packages/mcp-server）
  └─ list_analysis_reports ツールでSupabase経由取得（期間指定対応）
```

Markdownファイルへの出力（生成・追記・保存）は廃止し、DBへの保存に一本化する。

## DBスキーマ

新規テーブル `account_analysis_reports` をマイグレーションで追加する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK (default gen_random_uuid()) | |
| account_id | uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE | |
| period_start | timestamptz NOT NULL | 集計対象期間の開始（直近30日の開始時点） |
| period_end | timestamptz NOT NULL | 集計対象期間の終了（実行時刻） |
| days_recent | integer NOT NULL | `--days`の値（「直近N日間」サマリーの対象） |
| report_data | jsonb NOT NULL | サマリー・直近N日間サマリー・週次トレンド・TOP投稿等の集計データ |
| insights | jsonb (nullable) | Step2でClaudeが追記するインサイト分析（注目投稿の傾向／エンゲージメント考察／次のアクション） |
| generated_at | timestamptz NOT NULL DEFAULT NOW() | レポート生成日時 |
| insights_generated_at | timestamptz (nullable) | インサイト追記日時 |

- インデックス: `account_id`、`generated_at`
- RLS: `account_metrics`と同様に`account_id`経由で`company_id`判定（select/insert/update、authenticated）
  - updateポリシーが必要な点が`account_metrics`と異なる（インサイト追記のため）

フロー: ① analyze.tsが集計後INSERT（`insights`はnull） → ② SKILL.mdがClaudeでインサイト分析 → 該当レコードをUPDATEして`insights`・`insights_generated_at`を埋める。

## analyze.ts / analyze-utils.ts の変更

- ファイル出力処理（`fs.mkdirSync` / `fs.writeFileSync` / レポートファイルパス生成）を削除
- `generateReport`（Markdown生成）・`formatReportFilename`・`slugify`は使用箇所がなくなるため、関数本体とテストを削除
- 新規関数 `buildReportData()` を追加：以下をまとめたJSONオブジェクトを構築
  - 全体サマリー（総投稿数・総インプレッション・総ライク・総リプライ・総リポスト・平均インプレッション・平均エンゲージメント率）
  - 直近`--days`日間のサマリー
  - 週次トレンド（直近8週）
  - TOP10投稿（インプレッション順・直近30日）
  - TOP5投稿（エンゲージメント率順・直近30日）
  - `metricsFailedCount`・`noPlatformIdCount`
- 集計後、`account_analysis_reports`に以下でINSERT：
  - `account_id`
  - `period_start` = 30日前時点（既存の`since`）
  - `period_end` = 実行時刻（`now`）
  - `days_recent` = `--days`の値
  - `report_data` = `buildReportData()`の結果
  - `generated_at` = `now`
- INSERT後、レコードの`id`と`report_data`のJSONを標準出力に出力する（SKILL.mdが読み取り、UPDATE時に使う）

## SKILL.md の変更

新フロー：

1. ユーザー発話からアカウント名候補を抽出（変更なし）
2. `npx tsx .../analyze.ts "<アカウント名>" --days <N>` を実行
   - 標準出力から`レコードID`と`report_data`（JSON）を取得
3. Claudeが`report_data`を読み、インサイト分析をJSON形式で作成：
   ```json
   {
     "notable_posts": "注目投稿の傾向（高パフォーマンス投稿のテーマ・文体・フォーマットの共通点）",
     "engagement_review": "エンゲージメント考察（ライク率・リプライ率・週次トレンド・フォロワー推移から読み取れること）",
     "next_actions": "次のアクション（投稿テーマ・フォーマット・投稿時間に関する具体的な改善提案）"
   }
   ```
4. `mcp__supabase__execute_sql`で該当レコードの`insights`・`insights_generated_at`をUPDATE
5. レポートの要約（サマリー数値＋インサイトの要点）をユーザーに提示

Markdownファイルへの追記・保存ステップは廃止。

## MCPサーバー: list_analysis_reports ツール

`packages/mcp-server/src/index.ts`に既存ツール群と同じパターンで追加：

```ts
{
  name: 'list_analysis_reports',
  description: 'アカウントの分析レポート一覧を返す（期間指定可）',
  inputSchema: {
    type: 'object',
    properties: {
      account_id: { type: 'string', description: 'アカウントID' },
      since: { type: 'string', description: '取得開始日時 ISO8601（省略可、generated_atでフィルタ）' },
      until: { type: 'string', description: '取得終了日時 ISO8601（省略可）' },
      limit: { type: 'number', description: '取得件数上限（デフォルト10）' },
    },
    required: ['account_id'],
  },
}
```

- `account_analysis_reports`を`account_id`で絞り込み、`generated_at`の範囲指定（あれば）・`order by generated_at desc`・`limit`で取得
- 返却カラム: `id, period_start, period_end, days_recent, report_data, insights, generated_at, insights_generated_at`

## ダッシュボードUI

- `/analytics`ページのヘッダーに「分析レポート」へのリンクを追加（既存の「レポートを印刷」リンクと並列）
- 新規ページ `/analytics/reports`
  - 上部にアカウント選択（プルダウン、`accounts`一覧）
  - 選択アカウントの`account_analysis_reports`を`generated_at`降順で一覧表示（期間・生成日時・インサイト有無バッジ）
  - 各行クリックで詳細表示（`/analytics/reports/[id]`）へ遷移
- 新規ページ `/analytics/reports/[id]`
  - `report_data`をセクション分けして表示（全体サマリー／直近N日間のパフォーマンス／週次トレンド／TOP投稿）
  - `insights`があれば「インサイト分析」セクションを表示、なければ「未生成」の旨を表示

## 既存ファイルの扱い

- `.claude/skills/account-post-analysis/reports/dober-threads/`配下のコミット済みMarkdownレポート（1件）は履歴としてそのまま残す
- 未コミットの`2026-06-12_1133_analysis.md`は削除する
- 今後はMarkdownファイルが生成されないため、`reports/`ディレクトリへの新規ファイル追加は発生しない（ディレクトリ自体は既存ファイルのため残る）

## スコープ外

- 既存の`.claude/skills/account-post-analysis/reports/`配下ファイルの一括移行（過去レポートのDBへの取り込み）
- レポートの編集・削除UI（閲覧のみ）
- アカウント横断でのレポート一覧・比較UI
