-- =============================================================================
-- Plan2 Schema Additions
-- =============================================================================

-- posts: published_at（投稿完了時刻）と platform_post_id（SNS側のID）を追加
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS published_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_post_id TEXT;

-- prompt_config_history: プロンプト変更履歴
CREATE TABLE IF NOT EXISTS prompt_config_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  system_prompt  TEXT        NOT NULL,
  reference_data TEXT        NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by     TEXT        NOT NULL CHECK (changed_by IN ('ai', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_config_history_account
  ON prompt_config_history(account_id);

-- account_metrics: フォロワー数推移
CREATE TABLE IF NOT EXISTS account_metrics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  followers_count INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_account_metrics_account
  ON account_metrics(account_id);

-- RLS: prompt_config_history
ALTER TABLE prompt_config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_config_history: select own company"
  ON prompt_config_history FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "prompt_config_history: insert own company"
  ON prompt_config_history FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

-- RLS: account_metrics
ALTER TABLE account_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_metrics: select own company"
  ON account_metrics FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "account_metrics: insert own company"
  ON account_metrics FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );
