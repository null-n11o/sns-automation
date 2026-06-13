---
name: dober-content-strategy
description: Threadsアカウント「Dober」(@dober_fullstack)向けの投稿を作成・予約する。「Doberの来週のポストを作って」「Doberの投稿を3件作成して」のように起動する。ブランドの文体ルールと高パフォーマンスなコンテンツフォーマットに従って下書き(draft)を作成する。
---

# dober-content-strategy

Threadsアカウント「Dober」(@dober_fullstack, account_id: `df3bd84a-b782-4c68-bbee-7697e95decaa`)向けに、過去の投稿パフォーマンス分析から導出した文体ルール・コンテンツフォーマットに基づいて投稿を作成し、`draft`としてDBにスケジュール登録する。

## アカウント概要

- ターゲット: 自己改善・モテ・資本主義的思考に関心のある男性
- テーマ: 恋愛/モテ、自己投資、規律、お金/資本主義、メンタル、アルファ/シグマ等の男性アーキタイプ、有名人逸話
- タイトル装飾: 本文の冒頭に `▫️` を付ける（つけない短文断定型もOK。下記フォーマットF参照）

## 文体ルール（厳守）

過去509投稿の分析に基づく必須ルール。

1. **命令形（〜しろ、〜せよ、〜使え、〜問え等）で終わる文を使わない。** 断定形（〜だ、〜である、〜を持っていく、等）で言い切る。
   - NG: 「語る時間があるなら、その時間を積み上げに使え。」
   - OK: 「語る時間を積み上げに変えられる人間が、最後に結果を持っていく。」
2. **「——」（em-dash, ダッシュ）を使わない。** 509投稿中、使用例は0件。区切りには読点・改行・「、」を使う。
3. 箇条書きの項目は名詞止め・動詞の辞書形（〜する、〜する）でよい（命令形ではないため問題なし）。
4. 引用を使う場合、引用内の命令形もできれば地の文の断定形に言い換える。

## 高パフォーマンスなコンテンツフォーマット

A〜Gの7フォーマット定義は `references/formats.md` を参照する（`dober-strategy-review` と共有）。新規投稿作成時はこれらをバランスよく組み合わせる。

## 実行手順

### Step 1: 投稿対象期間とスケジュールを確認する

ユーザーの発話から対象期間（例: 来週）を判断する。デフォルトのスケジュールは1日3件、JST 7:30 / 12:00 / 20:00。

JST → UTC変換（`scheduled_date`に使用）:
- 7:30 JST = 前日 22:30 UTC
- 12:00 JST = 同日 03:00 UTC
- 20:00 JST = 同日 11:00 UTC

### Step 2: 投稿内容を作成する

まず、現在アクティブな参照実例セットをDBから読み込む。`mcp__supabase__execute_sql`（project_id: `fdmhkjiqsrzktfmbqlxg`）で実行:

```sql
SELECT version, examples
FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' AND is_active = true;
```

取得した `examples`（A〜Gに分類された高パフォーマンス実例）を文体・構成のリファレンスとする。これらは `dober-strategy-review` により毎週更新される。

- 対象期間の投稿数を `references/formats.md` の7フォーマットに分配する（偏りなくバランスよく）。直近で使用したフォーマット・テーマと重複しないよう、`mcp__sns-automation__list_posts`で直近の投稿を確認してから作成する。
- 各投稿は上記「文体ルール」に従う。

### Step 3: draftとして登録する

`mcp__sns-automation__create_post`で、`account_id: df3bd84a-b782-4c68-bbee-7697e95decaa`, `status: 'draft'`, `source: 'ai'`として各投稿を登録する。

### Step 4: ユーザーに一覧を提示する

作成した投稿の日時・タイトル（先頭行）を一覧で提示し、内容の確認・修正依頼を受け付ける。
