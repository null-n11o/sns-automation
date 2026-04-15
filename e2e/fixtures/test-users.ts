// E2E テスト用ユーザー定数（auth.setup.ts と auth.spec.ts で共有）
export const ADMIN_EMAIL = 'e2e-admin@test.com'
export const ADMIN_PASSWORD = 'Admin123456!'
export const OPERATOR_EMAIL = 'e2e-operator@test.com'
export const OPERATOR_PASSWORD = 'Operator123456!'
// ログイン/ログアウトテスト専用ユーザー（admin.json のセッションを汚染しないため分離）
export const LOGINTEST_EMAIL = 'e2e-logintest@test.com'
export const LOGINTEST_PASSWORD = 'LoginTest123!'
export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
