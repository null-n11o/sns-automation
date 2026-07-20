-- =============================================================================
-- publish_logs: publish試行(成功/失敗)の事後解析ログ
-- =============================================================================

CREATE TABLE IF NOT EXISTS publish_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id             UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform            TEXT        NOT NULL,
  trigger             TEXT        NOT NULL,
  result              TEXT        NOT NULL,
  failed_step         TEXT,
  total_ms            INTEGER     NOT NULL,
  create_http_status  INTEGER,
  container_id        TEXT,
  create_ms           INTEGER,
  create_response     JSONB,
  publish_http_status INTEGER,
  platform_post_id    TEXT,
  publish_ms          INTEGER,
  publish_response    JSONB,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_logs_created_at ON publish_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_publish_logs_account ON publish_logs(account_id);

-- RLS: publish_logs（selectは自社アカウントのみ / insertは自社アカウント。
--      cronはservice roleでRLSバイパス）
ALTER TABLE publish_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "publish_logs: select own company"
  ON publish_logs FOR SELECT TO authenticated
  USING (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );

CREATE POLICY "publish_logs: insert own company"
  ON publish_logs FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE company_id = get_my_company_id())
  );
