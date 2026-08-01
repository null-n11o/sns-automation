# 自動リプライ設定 UI 設計

- 日付: 2026-08-01
- 対象: Threads モメンタム連動 LINE誘導オートリプライ（PR #42 / #43）の設定を UI から編集可能にする
- 目的: 外販に向け、顧客・アカウント単位で自動リプライの ON/OFF・発火条件・リプ文面を画面から設定できるようにする

## 背景

現状、自動リプライの設定は `accounts.auto_reply_config` (JSONB) に保存され、cron
(`src/app/api/cron/auto-reply/route.ts`) が参照して発火判定する。設定の投入は
`scripts/seed-dober-auto-reply.mjs` のようなスクリプトを手動実行する運用になっており、
外販で顧客・アカウントごとに設定するには UI が必要。

既存の設定構造（cron の型と一致）:

```jsonc
{
  "enabled": true,
  "tiers": [                       // いずれかの tier を満たせば発火（OR）
    { "window_minutes": 30,  "threshold": 200 },
    { "window_minutes": 60,  "threshold": 350 }
  ],
  "templates": ["リプ文面（ランダムで1つ選択）"]
}
```

cron は `tiers` 省略時に従来の単一 `threshold`/`window_minutes`（既定 500/60分）へ
フォールバックする後方互換を持つ。本 UI は常に `tiers` 形式で保存する。

## スコープ

- ON/OFF・発火条件（tiers）・リプ文面（templates）をすべて UI で編集可能にする
- アカウントごとの設定ページ `/accounts/[id]` を新設
- 編集権限は **admin のみ**、company スコープでガード
- 自動リプライは **Threads 専用**。X アカウントでは設定欄を出さず注記のみ

対象外（将来対応）:
- X（Twitter）向け自動リプライ
- アカウント基本情報（名前・投稿時刻・APIキー）の編集（設定ページでは読み取り専用表示）
- リプ文面のA/B配信ロジック変更（現状のランダム選択のまま）

## 全体構成

```
/accounts            … 既存一覧。各行に「設定」リンクと自動リプライ ON/OFF バッジを追加
/accounts/[id]       … 新設。アカウント基本情報（読取専用）+ 自動リプライ設定フォーム
  actions.ts         … updateAutoReplyConfig(accountId, config) を追加
```

- 設定ページはサーバーコンポーネントで account を取得（company スコープ確認、
  該当なし・非 admin はリダイレクト）。
- 自動リプライ設定フォームはクライアントコンポーネント。保存は Server Action で
  `accounts.auto_reply_config` を丸ごと更新。

## データ構造とバリデーション

保存する `auto_reply_config` は cron の既存型と完全一致させる。

```jsonc
{
  "enabled": true,
  "tiers": [                       // 最大4つ。ON時は最低1つ必須
    { "window_minutes": 60,  "threshold": 300 },
    { "window_minutes": 300, "threshold": 600 }
  ],
  "templates": ["リプ文面1", "リプ文面2"]   // ON時は最低1つ必須
}
```

### UI ↔ 保存の変換

- 経過時間は UI では **時間単位**で入力（例: 1, 5）。小数を許可し 0.5 = 30分を表現できる。
  保存時 `window_minutes = Math.round(hours * 60)`。読み込み時は `window_minutes / 60` で表示。
- 既存 Dober 設定には 30分(=0.5h)・360分(=6h) 等があるため、小数表示に対応する。

### バリデーション（Server Action 内）

ON（enabled=true）時のみ厳格適用:

- `tiers`: 1〜4個。各 `window_minutes ≥ 1`、`threshold ≥ 1`（正の整数）。
  空欄行は送信前にクライアント側で除外。サーバー側でも再検証する。
- `templates`: 1個以上、各要素は非空文字列（trim 後）。
- OFF（enabled=false）時: tiers/templates が空でも保存可（enabled=false を確定）。
  既存の tiers/templates は極力保持する（入力があればそれを保存、無ければ既存を維持）。
- 権限: admin かつ account.company_id が自分の company と一致（既存 `deleteAccount` と同じパターン）。

## UI 挙動

### 設定ページ (`/accounts/[id]`)

- 上部: アカウント基本情報（名前・プラットフォーム・投稿時刻）を読み取り専用表示。
- Threads の場合のみ「自動リプライ設定」フォームを表示。
- X の場合は「自動リプライは Threads のみ対応」と注記し、設定欄を出さない。

### 自動リプライフォーム（クライアントコンポーネント）

- **ON/OFF トグル**（Switch）。OFF 時は条件・文面欄を淡色/折りたたみ表示（保存は可能）。
- **条件（tiers）**: 行リスト。各行に「経過時間（h）」「インプレ閾値」の数値入力 + 削除ボタン。
  「条件を追加」ボタン（4行到達で非活性）。初期表示は既存 config から復元、無ければ 1 行空。
- **文面（templates）**: テキストエリアの行リスト + 追加/削除ボタン。
  「ランダムで1つ選択される」旨を注記。
- **保存**ボタン → Server Action。成功/エラーメッセージを表示。
  バリデーションエラーはフィールド近傍に表示。

### 一覧ページ

- 各行に「設定」リンク（`/accounts/[id]`）を追加。
- Threads 行に自動リプライの ON/OFF が一目でわかる小バッジ（「自動リプライ: ON/OFF」）を表示。

## テスト（TDD）

Server Action `updateAutoReplyConfig` の単体テストを中心に据える:

- 正常保存: tiers/templates の変換が正しい（時間→分の丸め含む）
- ON時バリデーション: tier 0件・threshold 不正・templates 空 → エラー
- 権限: 非 admin・別 company のアカウント → 拒否
- OFF保存で既存 templates を消さない

UI コンポーネントは既存方針に倣い軽め（Action 中心）。
`npm run lint` / `npx vitest run` がクリーンであることを確認する。
