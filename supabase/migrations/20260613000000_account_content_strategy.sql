-- =============================================================================
-- account_content_strategy: dober-strategy-review が更新する参照実例セット。
-- account_id ごとに version 管理し、is_active=true の1行を投稿生成が参照する。
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_content_strategy (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  version          INTEGER     NOT NULL,
  examples         JSONB       NOT NULL,
  source_report_id UUID        REFERENCES account_analysis_reports(id) ON DELETE SET NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_account_content_strategy_account ON account_content_strategy(account_id);

-- アカウントごとアクティブは最大1つ
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_content_strategy_active
  ON account_content_strategy(account_id) WHERE is_active;

-- RLS: account_analysis_reports と同じ company_id スコープ
ALTER TABLE account_content_strategy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_content_strategy: select own company"
  ON account_content_strategy FOR SELECT TO authenticated
  USING (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );

CREATE POLICY "account_content_strategy: insert own company"
  ON account_content_strategy FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );

CREATE POLICY "account_content_strategy: update own company"
  ON account_content_strategy FOR UPDATE TO authenticated
  USING (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  )
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );
