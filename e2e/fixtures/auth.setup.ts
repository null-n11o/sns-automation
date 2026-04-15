import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  OPERATOR_EMAIL,
  OPERATOR_PASSWORD,
  LOGINTEST_EMAIL,
  LOGINTEST_PASSWORD,
  TEST_COMPANY_ID,
} from './test-users'

const authDir = path.join(__dirname, '.auth')
const adminFile = path.join(authDir, 'admin.json')
const operatorFile = path.join(authDir, 'operator.json')

type Role = 'admin' | 'operator'

async function ensureUser(
  service: ReturnType<typeof createClient>,
  email: string,
  password: string,
  role: Role,
) {
  const { data: existing } = await service
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existing) return

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`Failed to create ${email}: ${error.message}`)

  const { error: insertError } = await service.from('users').insert({
    id: data.user.id,
    company_id: TEST_COMPANY_ID,
    email,
    role,
  })
  if (insertError) throw new Error(`Failed to insert user row: ${insertError.message}`)
}

setup.describe('create auth states', () => {
  setup.beforeAll(async () => {
    fs.mkdirSync(authDir, { recursive: true })

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    await ensureUser(service, ADMIN_EMAIL, ADMIN_PASSWORD, 'admin')
    await ensureUser(service, OPERATOR_EMAIL, OPERATOR_PASSWORD, 'operator')
    await ensureUser(service, LOGINTEST_EMAIL, LOGINTEST_PASSWORD, 'operator')

    // テスト前に企業名を初期状態にリセット
    await service
      .from('companies')
      .update({ name: 'E2E Test Company' })
      .eq('id', TEST_COMPANY_ID)
  })

  setup('save admin auth state', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(ADMIN_EMAIL)
    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/posts')
    await page.context().storageState({ path: adminFile })
  })

  setup('save operator auth state', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(OPERATOR_EMAIL)
    await page.getByLabel('Password').fill(OPERATOR_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/posts')
    await page.context().storageState({ path: operatorFile })
  })
})
