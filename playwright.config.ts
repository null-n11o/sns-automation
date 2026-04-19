import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.test.local' })

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
] as const

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}. Copy .env.test.local.example to .env.test.local`)
  }
}

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testDir: './e2e/fixtures',
      testMatch: '**/auth.setup.ts',
    },
    {
      name: 'admin',
      testMatch: [
        '**/tests/companies.spec.ts',
        '**/tests/users.spec.ts',
        '**/tests/auth.spec.ts',
        '**/tests/analytics.spec.ts',
        '**/tests/report.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/fixtures/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'operator',
      testMatch: ['**/tests/access-control.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/fixtures/.auth/operator.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'next dev --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '',
      CRON_SECRET: process.env.CRON_SECRET ?? '',
    },
  },
})
