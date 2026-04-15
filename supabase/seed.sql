-- E2E テスト用シードデータ
-- supabase db reset により migrations の後に適用される
-- テストユーザーは e2e/fixtures/auth.setup.ts で API 経由作成するため、ここでは companies のみ

INSERT INTO companies (id, name, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'E2E Test Company',
  NOW()
)
ON CONFLICT (id) DO NOTHING;
