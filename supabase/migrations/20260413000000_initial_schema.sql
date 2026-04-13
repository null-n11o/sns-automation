-- =============================================================================
-- SNS Automation Platform — Initial Schema Migration
-- =============================================================================
-- Tables:  companies, users, accounts, prompt_configs, posts, post_metrics
-- RLS:     All tables secured with Row Level Security
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- companies: top-level tenant
CREATE TABLE companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- users: one-to-one with auth.users, scoped to a company
CREATE TABLE users (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  role       TEXT        NOT NULL CHECK (role IN ('admin', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- accounts: social media accounts belonging to a company
CREATE TABLE accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform            TEXT        NOT NULL CHECK (platform IN ('x', 'threads')),
  account_name        TEXT        NOT NULL,
  -- API credentials are stored AES-256-GCM encrypted (see src/lib/crypto.ts)
  api_key             TEXT,
  api_secret          TEXT,
  access_token        TEXT,
  access_token_secret TEXT,
  platform_user_id    TEXT,
  posting_times       TEXT[]      NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- prompt_configs: LLM prompt settings per account (one active record per account)
CREATE TABLE prompt_configs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  system_prompt  TEXT        NOT NULL,
  reference_data TEXT        NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT        NOT NULL CHECK (updated_by IN ('ai', 'manual'))
);

-- posts: generated / manually written posts
CREATE TABLE posts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  content        TEXT        NOT NULL,
  scheduled_date DATE        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'review', 'ready', 'published', 'failed')),
  source         TEXT        NOT NULL CHECK (source IN ('ai', 'manual')),
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- post_metrics: engagement stats fetched by the Vercel Cron job
CREATE TABLE post_metrics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  impressions INTEGER     NOT NULL DEFAULT 0,
  likes       INTEGER     NOT NULL DEFAULT 0,
  reposts     INTEGER     NOT NULL DEFAULT 0,
  replies     INTEGER     NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_users_company_id         ON users(company_id);
CREATE INDEX idx_accounts_company_id      ON accounts(company_id);
CREATE INDEX idx_prompt_configs_account   ON prompt_configs(account_id);
CREATE INDEX idx_posts_account_id         ON posts(account_id);
CREATE INDEX idx_posts_status             ON posts(status);
CREATE INDEX idx_posts_scheduled_date     ON posts(scheduled_date);
CREATE INDEX idx_post_metrics_post_id     ON post_metrics(post_id);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid infinite RLS recursion)
-- ---------------------------------------------------------------------------

-- Returns the company_id of the currently authenticated user
CREATE OR REPLACE FUNCTION get_my_company_id()
  RETURNS UUID
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT company_id FROM users WHERE id = auth.uid();
$$;

-- Returns true when the current user has the 'admin' role
CREATE OR REPLACE FUNCTION is_admin()
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role = 'admin' FROM users WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — enable on all tables
-- ---------------------------------------------------------------------------
ALTER TABLE companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_metrics  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS Policies — companies
-- ---------------------------------------------------------------------------
-- Users can only see their own company
CREATE POLICY "companies: select own"
  ON companies FOR SELECT
  TO authenticated
  USING (id = get_my_company_id());

-- ---------------------------------------------------------------------------
-- RLS Policies — users
-- ---------------------------------------------------------------------------
-- All authenticated users can read members of their company
CREATE POLICY "users: select own company"
  ON users FOR SELECT
  TO authenticated
  USING (company_id = get_my_company_id());

-- Only admins can create users within their company
CREATE POLICY "users: admin insert"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_my_company_id() AND is_admin());

-- Only admins can update users within their company
CREATE POLICY "users: admin update"
  ON users FOR UPDATE
  TO authenticated
  USING  (company_id = get_my_company_id() AND is_admin())
  WITH CHECK (company_id = get_my_company_id());

-- Only admins can delete users from their company
CREATE POLICY "users: admin delete"
  ON users FOR DELETE
  TO authenticated
  USING (company_id = get_my_company_id() AND is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — accounts
-- ---------------------------------------------------------------------------
CREATE POLICY "accounts: select own company"
  ON accounts FOR SELECT
  TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "accounts: admin insert"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_my_company_id() AND is_admin());

CREATE POLICY "accounts: admin update"
  ON accounts FOR UPDATE
  TO authenticated
  USING  (company_id = get_my_company_id() AND is_admin())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "accounts: admin delete"
  ON accounts FOR DELETE
  TO authenticated
  USING (company_id = get_my_company_id() AND is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — prompt_configs
-- ---------------------------------------------------------------------------
CREATE POLICY "prompt_configs: select own company"
  ON prompt_configs FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "prompt_configs: insert own company"
  ON prompt_configs FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "prompt_configs: update own company"
  ON prompt_configs FOR UPDATE
  TO authenticated
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

-- ---------------------------------------------------------------------------
-- RLS Policies — posts
-- ---------------------------------------------------------------------------
CREATE POLICY "posts: select own company"
  ON posts FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "posts: insert own company"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

CREATE POLICY "posts: update own company"
  ON posts FOR UPDATE
  TO authenticated
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

CREATE POLICY "posts: delete own company"
  ON posts FOR DELETE
  TO authenticated
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE company_id = get_my_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS Policies — post_metrics
-- ---------------------------------------------------------------------------
-- Authenticated users can read metrics for their company's posts
CREATE POLICY "post_metrics: select own company"
  ON post_metrics FOR SELECT
  TO authenticated
  USING (
    post_id IN (
      SELECT p.id FROM posts p
      JOIN accounts a ON p.account_id = a.id
      WHERE a.company_id = get_my_company_id()
    )
  );

-- Authenticated users (and the service role via Vercel Cron) can insert metrics
-- Note: service_role bypasses RLS automatically; this policy covers authenticated callers
CREATE POLICY "post_metrics: insert own company"
  ON post_metrics FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (
      SELECT p.id FROM posts p
      JOIN accounts a ON p.account_id = a.id
      WHERE a.company_id = get_my_company_id()
    )
  );
