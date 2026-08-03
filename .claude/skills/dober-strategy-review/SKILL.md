---
name: dober-strategy-review
description: Threadsアカウント「Dober」(@dober_fullstack)の週次パフォーマンスを振り返り、参照実例セット(account_content_strategy)の更新を提案・適用する。「Doberの今週の振り返り」「Doberの戦略を更新して」のように起動する。提案→ユーザー承認→DB適用の流れ。
---

# dober-strategy-review

Dober (account_id: `df3bd84a-b782-4c68-bbee-7697e95decaa`) の最新分析レポートと過去CSVの5000imp超実績を元に、投稿生成が参照する「実例セット」を進化させる。直近で伸びた投稿を高パフォーマンス実例としてA〜Gフォーマットに分類し、現行セットとの差分をユーザーに提示し、承認後に新バージョンとしてDBへ適用する。

フォーマット定義（A〜G）は `../dober-content-strategy/references/formats.md` を参照する。

## 週次振り返りレポートの方針

Doberの週次振り返り／分析レポートを提示・記述するときは、投稿ごとの「読み」まで踏み込んだ深さで、以下の章立て・粒度で書く。

章立て・粒度:

- **フォロワー推移**（純増つき）
- **KPIサマリー**（各指標に前週比を付ける）
- **日別推移**（日ごとの imp / エンゲージ / 投稿数）
- **勝ち投稿 / リーチ上位 / 負け投稿** に分け、各投稿に一言の「読み」を添える
- **仮説検証**（前週立てた仮説の達成/一部達成/未達を根拠つきで判定）
- **結論**
- **次週の実験**（実行内容と判定基準を表で）
- **来週の投稿方針**
- **残リスク**（数値の前提・定義差・未検証事項）

データ上の制約（手本と異なる点）:

- DoberはThreadsで、投稿別メトリクスは Threads Live API 由来の `views(=impressions) / likes / replies / reposts` の4つのみ（`src/lib/threads-metrics.ts`）。
- 手本にある **ブックマーク・プロフィール訪問・詳細クリック・URLクリック・投稿別の新規フォロー/解除・共有** は取得できないため載せない。勝ち投稿の質指標は **リプライ・リポスト** で代替する。
- フォロワー数・純増は分析レポートのスナップショット（`report_data.weeklyTrend[].followersCount`）から取る。
- 前週比は同一ソース・同一定義の数値どうしでのみ算出し、断定できない因果は「可能性がある」として扱う。

## 実行手順

### Step 1: 最新の分析レポートを確認する

`mcp__supabase__execute_sql`（project_id: `fdmhkjiqsrzktfmbqlxg`）で最新レポートを取得する:

```sql
SELECT id, generated_at, report_data, insights
FROM account_analysis_reports
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa'
ORDER BY generated_at DESC
LIMIT 1;
```

- レポートが存在しない、または `generated_at` が7日より古い場合は、`account-post-analysis` スキルを実行して最新レポートを生成するようユーザーに促す（「最新レポートが無い/古いので先に分析しますか？」）。
- 取得した `report_data.summary.topByImpressions` / `topByEngagement` が高パフォーマンス投稿の候補。`insights.next_actions` は補足の方向性として読む。
- 直近レポートだけでなく、過去CSVの5000imp超で確認済みの強い型（危機・負債型、基本基準型、社会が思う/本当の価値対比型、人工刺激/やめる・やる型、退屈な規律型、階層分類型、恋愛・女性視点型）を優先する。

### Step 2: 高パフォーマンス投稿をA〜Gに分類する

`../dober-content-strategy/references/formats.md` のA〜G定義に従い、Step 1で得たTOP投稿（重複除外）を各フォーマットに分類し、採用理由(rationale)を付ける。現行定義ではA〜Eを厚めにし、F/Gを補助的に選定する（目安: 計15〜20件）。

通常ローテーションから外すもの:
- アルファ/シグマ型。5000imp超データ内の出現が少なく、直近でも伸びが弱い。
- 「お金の使い方」単体の訓話。採用するなら「社会が思う成功/本当の成功」「金で買える/買えない」「仕組み/自由」の構造に変換する。
- 有名人逸話単体。採用するなら「退屈な規律」「毎朝の反復」など現行A〜Gに接続する。

各実例は以下の `StrategyExample` 形式にする:

- `format`: A〜Gのいずれか
- `title`: 投稿本文の先頭行
- `content`: 投稿本文全体（report_dataの `content`）
- `metrics`: `{ impressions, likes, replies, reposts }`（report_dataの数値。follows はレポートに無いため省略可）
- `score`: `likes*10 + replies*5 + reposts*5 + Math.round(Math.log(impressions))`（並び替えヒント）
- `rationale`: なぜこの実例を参照に採用するか1文

### Step 3: 現行セットとの差分を提示する

現在アクティブな実例を取得する:

```sql
SELECT id, version, examples
FROM account_content_strategy
WHERE account_id = 'df3bd84a-b782-4c68-bbee-7697e95decaa' AND is_active = true;
```

現行 `examples` とStep 2の新セットを比較し、差分を提示する:
- ✅ 追加（今週伸びた新規実例）
- ❌ 除外（鮮度が落ちた/より良い実例に置き換える）
- ➖ 維持（引き続き参照する定番実例）

併せて、`insights.next_actions` の要約を「今週の所感」として添える。

### Step 4: ユーザー承認後にDBへ適用する

ユーザーが承認（または修正指示）したら、確定した新セットを一時JSONファイルに書き出し、`apply-strategy.ts` で適用する:

```bash
npx tsx .claude/skills/dober-strategy-review/scripts/apply-strategy.ts "Dober" /tmp/dober-strategy-new.json --source-report <Step1のレポートID>
```

成功メッセージ（新version・id・件数）をユーザーに報告し、次回以降の `dober-content-strategy` による生成にこの実例が反映される旨を伝える。
