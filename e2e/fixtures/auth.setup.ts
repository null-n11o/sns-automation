import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const ADMIN_EMAIL = 'e2e-admin@test.com'
const ADMIN_PASSWORD = 'Admin123456!'
const OPERATOR_EMAIL = 'e2e-operator@test.com'
const OPERATOR_PASSWORD = 'Operator123456!'
const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'

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
