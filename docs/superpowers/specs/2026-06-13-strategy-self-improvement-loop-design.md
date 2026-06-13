# Dober 戦略自己改善ループ 設計

- 日付: 2026-06-13
- ステータス: 承認済み（実装計画待ち）

## 背景と目的

Dober向けの汎用投稿スキル（`dober-content-strategy`）と週次パフォーマンス分析のDB化（`account-post-analysis` → `account_analysis_reports`）が完了し、AIが読み込む分析データが常に存在する状態になった。

これを活用し、**毎週のレポートを元に投稿戦略を自律的に改善していくフィードバックループ**を構築する。具体的には、分析レポート → 参照実例セットの更新 → より良い投稿生成 → 分析、というサイクルを回す。

## スコープ（決定事項）

ブレインストーミングで以下を確定した。

| 論点 | 決定 |
|------|------|
| 戦略データの保存先 | **DBに戦略テーブルを新設**。SKILL.md は不変のメタルール＋DBから読む形に |
| 自律性の度合い | **提案→承認制**。AIが差分を提示し、ユーザー承認後にDB適用（ドリフト防止） |
| 進化させる対象 | **TOP実例の差し替えのみ**（YAGNI）。フォーマット配分・注力テーマ・投稿時間は当面固定 |
| トリガー | **手動起動**。「Doberの今週の振り返り」等で1連のスキルが走る |
| スキル構成 | レビュー処理を**新規Dober固有スキルに分離**。A〜G定義は共有ファイルへ切り出し |

## 全体アーキテクチャ

```
┌─ account-post-analysis (既存・汎用) ──────────┐
│  投稿パフォーマンス分析 → account_analysis_reports │
│  (report_data に TOP投稿、insights に next_actions)│
└───────────────┬──────────────────────────────┘
                │ report_data を消費
                ▼
┌─ dober-strategy-review (新規・Dober固有) ─────┐
│  1. 最新レポート読込（無ければ分析実行）          │
│  2. 直近の高パフォ投稿を A〜G に分類＋採用理由付与  │
│  3. 現行の参照実例セットと差分(diff)を提示         │
│  4. ユーザー承認 → 新バージョンをDBに書込み        │
└───────────────┬──────────────────────────────┘
                │ 書込み
                ▼
┌─ account_content_strategy テーブル (新規・汎用) ─┐
│  account_id ごとに「現在アクティブな参照実例セット」 │
└───────────────┬──────────────────────────────┘
                │ 生成時に読込み
                ▼
┌─ dober-content-strategy (既存・改修) ──────────┐
│  Step2 でハードコードTOP20の代わりにDBの            │
│  アクティブ実例を読んで投稿生成                     │
└──────────────────────────────────────────────┘
```

設計の肝は、**「分析（汎用データ生成）」「実例の進化判断（Dober固有の知能）」「生成（Dober固有）」を分離**すること。AIの判断＝A〜Gフォーマット分類と採用理由付けがレビュースキルに集約され、ここが承認ゲートになる。

## コンポーネント詳細

### 1. データ層: `account_content_strategy` テーブル（新規・汎用）

```sql
create table account_content_strategy (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  version int not null,
  examples jsonb not null,        -- 参照実例セット（下記スキーマ）
  source_report_id uuid references account_analysis_reports(id),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

-- アカウントごとアクティブは1つだけ
create unique index ux_strategy_active
  on account_content_strategy (account_id) where is_active;
```

- **RLS**: `account_analysis_reports` と同じ company_id スコープのパターンを踏襲する（accounts経由でcompany_idを判定）。
- `version` はアカウント単位の連番。新規提案適用時に `max(version)+1`。

`examples` JSONスキーマ（配列）:

```json
[{
  "format": "A",
  "title": "▫️静かに人生を変える男のルール",
  "content": "本文全体...",
  "metrics": { "impressions": 78472, "likes": 526, "follows": 56 },
  "score": 3120.5,
  "rationale": "規律リスト型。follows寄与が大きく当該フォーマットの再現性を示す"
}]
```

**シード**: マイグレーションで `version=1, is_active=true` の行を投入する。中身は現在 `dober-content-strategy/SKILL.md` にハードコードされている TOP20 実例を移植する。これにより既存の生成品質を維持したまま DB ベースへ移行できる。

### 2. スキル層

#### (a) `dober-strategy-review`（新規・Dober固有）

起動例: 「Doberの今週の振り返り」「Doberの戦略を更新して」

実行手順:

1. **最新レポートの確認**: `account_analysis_reports` から Dober の最新レポートを取得。鮮度が古い、または存在しない場合は `account-post-analysis` を実行してレポートを得る。
   - 鮮度の判定基準: 最新レポートの `created_at` が7日より古ければ「古い」とみなし再分析を促す（ユーザーに確認のうえ再実行）。
2. **候補抽出と分類**: `report_data` の TOP 投稿＋直近投稿から候補を抽出し、各候補を **A〜G に分類・採用理由を記述**（AIの判断）。フォーマットが偏らないよう選定する。
3. **差分提示**: 現在アクティブな `examples` を DB から読み、差分を提示する（追加 ✅ / 除外 ❌ / 維持 ➖）。レポートの `insights.next_actions` は補足コンテキストとして併記する。
4. **承認と書込み**: ユーザー承認（または編集指示）後、旧 version を `is_active=false`、新 version 行を `is_active=true, source_report_id=<該当>, activated_at=now()` で INSERT する（`mcp__supabase__execute_sql`）。

#### (b) `references/formats.md`（新規・共有）

A〜G フォーマット定義と文体ルールを切り出し、`dober-content-strategy` と `dober-strategy-review` の両方から参照する。フォーマット分類という共通言語を単一ファイルに集約し、定義の二重管理を避ける。

#### (c) `dober-content-strategy`（改修）

- Step 2 の冒頭で、アクティブな `examples` を DB から読み込む手順を追加する（ハードコード TOP20 を置換）。
- 文体ルール・フォーマット定義は `references/formats.md` 参照に変更する。
- SKILL.md から肥大な TOP20 実例ブロック（約260行）を削除し、DB を単一の真実源にする。

### 3. データフローと整合性

- **単一の真実源**: 参照実例は DB のアクティブ version のみ。SKILL.md からは実例の重複を排除する。
- **ロールバック**: version 履歴が残るため、過去 version を `is_active` に戻すだけで巻き戻し可能。
- **監査**: `source_report_id` でどのレポートがどの戦略変更を駆動したかを追跡できる。
- **承認ゲート**: DB 書込みは必ず Step 4 のユーザー承認後に行う。誤った方向へのドリフトを防ぐ。

### 4. MCP / スクリプト

- 読み書きとも既存の `mcp__supabase__execute_sql` で完結する（`account-post-analysis` の insights 更新と同じ流儀）。**新規 MCP ツールは作らない**（YAGNI）。
- `analyze.ts` は変更不要（既に TOP 投稿を report_data に出力済み）。

## テスト戦略

- マイグレーションの up/down＋シード投入の検証。
- RLS ポリシー（company_id スコープ）の検証。
- `dober-content-strategy` がアクティブ実例を正しく読み込んで投稿生成に反映することの実スキル実行確認。
- `dober-strategy-review` の差分提示→承認→新 version 適用が、アクティブ version 一意制約を壊さないことの確認。

## 非対象（将来拡張の余地）

- フォーマット配分（重み）・注力テーマ・投稿時間の自動進化。`examples` と同じ `account_content_strategy` 行に JSON キーを追加すれば拡張可能な設計にしておく。
- スケジュール起動＋通知による完全自律化。
- 他アカウントへの横展開（テーブルは汎用設計のため対応可能。フォーマット分類のみアカウント固有）。
