-- =============================================================================
-- account_analysis_reports: account-post-analysisスキルが生成する分析レポート
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_analysis_reports (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  days_recent           INTEGER     NOT NULL,
  report_data           JSONB       NOT NULL,
  insights              JSONB,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  insights_generated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_account_analysis_reports_account
  ON account_analysis_reports(account_id);

CREATE INDEX IF NOT EXISTS idx_account_analysis_reports_generated_at
  ON account_analysis_reports(generated_at);

-- RLS: account_analysis_reports
ALTER TABLE account_analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_analysis_reports: select own company"
  ON account_analysis_reports FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "account_analysis_reports: insert own company"
  ON account_analysis_reports FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "account_analysis_reports: update own company"
  ON account_analysis_reports FOR UPDATE TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );
