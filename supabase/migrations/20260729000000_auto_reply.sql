-- Momentum-gated LINE CTA auto-reply support.

-- posts: 発火状態（1投稿1リプの冪等担保）
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS cta_reply_posted  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cta_reply_post_id TEXT;

-- accounts: アカウント別オートリプ設定
--   { "enabled": bool, "threshold": int, "window_minutes": int, "templates": string[] }
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS auto_reply_config JSONB;

-- 監視対象（未発火の published 投稿）を絞る部分index
CREATE INDEX IF NOT EXISTS idx_posts_auto_reply_pending
  ON posts (published_at)
  WHERE status = 'published' AND cta_reply_posted = FALSE;
