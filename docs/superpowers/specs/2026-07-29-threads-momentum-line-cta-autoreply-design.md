---
title: Threads モメンタム連動 LINE誘導オートリプライ 設計書
date: 2026-07-29
status: draft
target_account: Dober/Threads (df3bd84a-b782-4c68-bbee-7697e95decaa)
---

# Threads モメンタム連動 LINE誘導オートリプライ

## 1. 背景と目的

Dober/Threads は月間最大220万/通常20万インプレ・毎週最低1本は1万インプ超という安定したリーチを持つ。一方で、Threads → 公式LINE への送客導線が弱く、伸びた投稿のリーチを回収できていない（ボトルネック = capture）。

本機能は、**publish後に伸び始めた投稿にだけ、LINE誘導リプライを自動でぶら下げる**ことで、投稿の残りの波（+数百〜数万インプ）にLINE導線を乗せ、リストインを増やす。

### 選別ロジックの根拠

Doberの投稿は「伸びない投稿は最初の1時間で500インプ未満で停滞し、500を超えた投稿は最低1000インプ以上に伸びる」という特性がある。したがって「**publish後60分以内にインプレ500到達**」は、不発弾を除外しつつ本当に波が来ている投稿だけを拾う、実効的なモメンタムゲートになる。500到達時点でリプを差し込めば、そのリプ自身も親投稿の継続配信に乗る。

## 2. スコープ

### やること
- 対象アカウントの published 投稿を publish後60分間監視し、インプレ ≥ 閾値 に達した投稿へLINE誘導リプを1回だけ投稿する。
- 1投稿1リプ（冪等）。60分ウィンドウ内に閾値未達なら永久に発火しない。

### やらないこと（YAGNI）
- 複数種類のリプ（LINE以外のCTA）— 将来拡張。
- リプのインプレ計測・A/Bレポート — 別機能。
- Dober以外のアカウントへの適用（初期は Dober/Threads のみ enabled）。
- ダッシュボードUI（設定はDB直投入で開始。UIは後回し）。

## 3. アーキテクチャ

既存の `/api/cron/publish`（cron-job.org が定期起動 → CRON_SECRET認証 → posts を走査 → publish）と同じパターンを踏襲した、独立した cron エンドポイントとして実装する。

```
cron-job.org (10分毎)
   │  Bearer CRON_SECRET
   ▼
GET /api/cron/auto-reply
   │  1. 対象投稿抽出（published / threads / 60分以内 / 未発火）
   │  2. 各投稿の insights を取得（fetchThreadsPostMetrics）
   │  3. impressions ≥ threshold → LINE誘導リプを投稿（reply_to_id）
   │  4. cta_reply_posted = true に更新（冪等）
   ▼
Threads API（親投稿にリプがぶら下がる）
```

### コンポーネント境界

| ユニット | 責務 | 依存 |
|---|---|---|
| `postToThreads`（拡張） | Threadsへ投稿。`replyToId` 指定時は返信として投稿 | Threads Graph API |
| `fetchThreadsPostMetrics`（既存・無変更） | media単位の views/likes/replies/reposts 取得 | Threads Insights API |
| `/api/cron/auto-reply`（新規） | 対象抽出→判定→リプ投稿→フラグ更新のオーケストレーション | 上記2つ + Supabase |
| `auto_reply_config`（accounts列） | アカウント別の有効化・閾値・ウィンドウ・文面 | — |
| `posts.cta_reply_posted` / `cta_reply_post_id` | 発火状態の記録（冪等性） | — |

## 4. 詳細設計

### 4.1 Threads API 拡張（`src/lib/threads-api.ts`）

`ThreadsPostOptions` に `replyToId?: string` を追加。コンテナ作成 URL に、指定時のみ `reply_to_id` を付与する。

```ts
interface ThreadsPostOptions {
  accessToken: string
  userId: string
  content: string
  imageUrl?: string | null
  replyToId?: string | null   // 追加
}
// create container 時:
if (replyToId) createUrl.searchParams.set('reply_to_id', replyToId)
```

既存の新規投稿経路（`replyToId` 未指定）は完全に無変更。container→status→publish の3ステップフローはそのまま流用する。

### 4.2 DB 変更

**マイグレーション（新規）:**

```sql
-- posts: 発火状態の記録
ALTER TABLE posts
  ADD COLUMN cta_reply_posted  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN cta_reply_post_id TEXT;

-- accounts: アカウント別設定
ALTER TABLE accounts
  ADD COLUMN auto_reply_config JSONB;
```

`auto_reply_config` の形:

```json
{
  "enabled": true,
  "threshold": 500,
  "window_minutes": 60,
  "templates": [
    "公式LINE登録者に以下無料で配布しておりますのでぜひ。「無料特典を受け取る」とメッセージお願いいたします。\nnote記事『人生をイージーモードに変える「規律」の教科書：一流の男たちが実践するメンタルと習慣の作り方』\nhttps://lin.ee/NnXNfzd"
  ]
}
```

Dober アカウント（`df3bd84a-…`）にのみこの config を投入する。他アカウントは `NULL`（＝無効）。

### 4.3 発火cron（`src/app/api/cron/auto-reply/route.ts`）

`/api/cron/publish` と同一の認証・構造。

**処理:**

1. `authorization === Bearer CRON_SECRET` を検証（不一致は401）。
2. 対象投稿を抽出:
   - `status = 'published'`
   - `accounts.platform = 'threads'` かつ `accounts.auto_reply_config->>'enabled' = 'true'`
   - `cta_reply_posted = false`
   - `platform_post_id IS NOT NULL`
   - `published_at >= now() - (window_minutes 分)`
3. 各投稿を `Promise.allSettled` で並列処理:
   - `fetchThreadsPostMetrics({ mediaId: platform_post_id, accessToken })` でインプレ取得。
   - `impressions >= threshold` の場合のみ:
     - `templates` から1件選択（複数あればランダム／ローテ）。
     - `postToThreads({ ..., content: template, replyToId: platform_post_id })` でリプ投稿。
     - 成功時 `posts.cta_reply_posted = true`, `cta_reply_post_id = <返信のmedia id>` を更新。
   - 閾値未達なら何もしない（次回cronで再評価。60分を過ぎると抽出対象から外れ、永久に未発火）。
4. `publish_logs` へ記録（既存 `publishAndLog` を流用 or 軽量ログ。冪等性はDBフラグで担保するため、ログ失敗は本処理を止めない）。

**冪等性:** 抽出条件に `cta_reply_posted = false` を含めるため、一度発火した投稿は次回以降の対象にならない。リプ投稿成功→フラグ更新の間にcronが再入しても、Threads側で二重投稿が起きる確率は低いが、`published_at` 単位ではなく `posts.id` 単位でフラグ管理することで実質1回に収束させる。

### 4.4 トリガー（運用設定・コード外）

cron-job.org に新ジョブを追加:
- URL: `<APP_URL>/api/cron/auto-reply`
- Header: `Authorization: Bearer <CRON_SECRET>`
- スケジュール: 10分毎（`*/10 * * * *`）

## 5. 文面（リプ本文）

初期テンプレート（Dober公式コピー・確定）:

> 公式LINE登録者に以下無料で配布しておりますのでぜひ。「無料特典を受け取る」とメッセージお願いいたします。
> note記事『人生をイージーモードに変える「規律」の教科書：一流の男たちが実践するメンタルと習慣の作り方』
> https://lin.ee/NnXNfzd

**スパム・重複対策（推奨）:** 同一文面を多数の投稿へ短期間で繰り返し投稿すると、Threads側のスパム検知や、複数投稿を見る読者への重複印象のリスクがある。オファー・URLは固定のまま、導入文だけ変えた2〜3のバリエーションを `templates` に入れてローテーションすることを推奨（バリエーション案は中野の確認後に追加）。ただし発火するのは「伸びた投稿」だけ＝1日数本のため、リスクは限定的。初期は確定コピー1本で開始し、運用を見て追加する。

## 6. エラー処理・エッジケース

- **Insights APIの遅延:** publish直後は views が反映されない場合がある。閾値未達として扱い、次回cronで再評価。60分を過ぎたら未発火のまま確定（許容）。
- **リプ投稿失敗:** `cta_reply_posted` は更新しない → 次回cronで再試行（60分ウィンドウ内なら）。`error_message` 相当をログに残す。
- **60分ぎりぎりで500到達:** ウィンドウ内なら発火。ウィンドウ経過後の遅咲きは対象外（＝「1時間で500」の仕様どおり）。
- **メトリクス取得コスト:** 常時ウィンドウ内にある投稿は0〜1本程度（Doberは1日2〜3投稿）。API負荷は無視できる。
- **サービスクライアント:** publish cron同様、RLSをバイパスするservice roleで実行する。

## 7. テスト方針

- `threads-api.test.ts`: `replyToId` 指定時に `reply_to_id` パラメータが付与されること／未指定時は従来どおり付与されないこと。
- `auto-reply/route.test.ts`（新規、`cron/publish` のテストを踏襲）:
  - 認証失敗で401。
  - 閾値到達投稿にのみリプ投稿＆フラグ更新が走る。
  - 閾値未達では何もしない。
  - `cta_reply_posted = true` の投稿は抽出されない（冪等）。
  - 60分超過投稿は抽出されない。
- 既存のpublish経路（`replyToId` 無し）に回帰が無いこと。

## 8. 実装タスク（プラン化の入力）

1. マイグレーション: `posts.cta_reply_posted` / `posts.cta_reply_post_id` / `accounts.auto_reply_config`。
2. `postToThreads` に `replyToId` 対応（＋テスト）。
3. `/api/cron/auto-reply` route 実装（＋テスト）。
4. Dober accounts レコードへ `auto_reply_config` 投入（seed or 手動SQL）。
5. cron-job.org に10分毎ジョブ追加（運用）。
6. 本番で1〜2本、実際に発火することを確認。

## 9. 未決事項

- リプ文面のバリエーション（2〜3案）を追加するか（初期は1本で開始可）。
- 閾値・ウィンドウの初期値は `500 / 60分 / 10分毎` で確定。運用データを見て調整。
