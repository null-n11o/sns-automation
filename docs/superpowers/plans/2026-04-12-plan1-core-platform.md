# SNS Automation Platform — Plan 1: Core Platform

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working multi-tenant SNS management platform where users can manually create posts, set scheduled dates, and have them automatically published to X and Threads.

**Architecture:** Next.js App Router for full-stack (UI + API routes), Supabase for database/auth/RLS-based multi-tenancy, Vercel Cron for scheduled publishing. SNS API credentials stored AES-256-GCM encrypted in Supabase.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (`@supabase/ssr`), shadcn/ui, Tailwind CSS, Vitest, `twitter-api-v2`, Vercel

---

**This is Plan 1 of 3:**
- **Plan 1 (this):** Foundation + Core Post Flow
- **Plan 2:** AI Post Generation + Self-improvement Loop + Analytics
- **Plan 3:** MCP Server

---

## File Structure

```
sns-automation/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                    # redirects to /posts
│   │   │   ├── companies/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── accounts/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   └── posts/page.tsx
│   │   └── api/
│   │       ├── publish/route.ts
│   │       └── cron/publish/route.ts
│   ├── components/
│   │   ├── posts/
│   │   │   ├── PostsTable.tsx
│   │   │   ├── PostStatusBadge.tsx
│   │   │   └── CreatePostModal.tsx
│   │   └── accounts/
│   │       └── AccountSettingsForm.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   ├── crypto.ts
│   │   ├── threads-api.ts
│   │   └── x-api.ts
│   ├── types/
│   │   └── index.ts
│   └── middleware.ts
├── supabase/
│   └── migrations/
│       └── 20260412000000_initial.sql
├── vercel.json
├── vitest.config.ts
└── package.json
```

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `vitest.config.ts`, `.env.local.example`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /Users/nakanokentaro/01_repos/active/sns-automation
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-git
```

When prompted:
- Import alias: `@/*` (default)

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install twitter-api-v2
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted: Default style, Default base color, CSS variables: yes.

Then add required components:

```bash
npx shadcn@latest add button input label table badge dialog select dropdown-menu form textarea toast
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Create `src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

Add to `package.json` scripts:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Create environment variables template**

Create `.env.local.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_KEY=your-64-char-hex-string
CRON_SECRET=your-random-secret-string
```

Copy it:

```bash
cp .env.local.example .env.local
```

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize Next.js project with Supabase, shadcn/ui, Vitest"
```

---

## Task 2: TypeScript Types + Crypto Module

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/crypto.ts`
- Create: `src/test/lib/crypto.test.ts`

- [ ] **Step 1: Write failing test for crypto module**

Create `src/test/lib/crypto.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte hex key for testing
})

describe('crypto', () => {
  it('encrypts and decrypts a string', () => {
    const original = 'my-secret-api-key'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(decrypt(encrypted)).toBe(original)
  })

  it('produces different ciphertext for same input (random IV)', () => {
    const encrypted1 = encrypt('same-value')
    const encrypted2 = encrypt('same-value')
    expect(encrypted1).not.toBe(encrypted2)
  })

  it('encrypted value contains three colon-separated parts', () => {
    const encrypted = encrypt('test')
    expect(encrypted.split(':')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run src/test/lib/crypto.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/crypto'`

- [ ] **Step 3: Create shared types**

Create `src/types/index.ts`:

```typescript
export type UserRole = 'admin' | 'operator'
export type Platform = 'x' | 'threads'
export type PostStatus = 'draft' | 'review' | 'ready' | 'published' | 'failed'
export type PostSource = 'ai' | 'manual'

export interface Company {
  id: string
  name: string
  created_at: string
}

export interface User {
  id: string
  company_id: string
  email: string
  role: UserRole
  created_at: string
}

export interface Account {
  id: string
  company_id: string
  platform: Platform
  account_name: string
  api_key: string | null
  api_secret: string | null
  access_token: string | null
  access_token_secret: string | null
  platform_user_id: string | null
  posting_times: string[]
  created_at: string
}

export interface PromptConfig {
  id: string
  account_id: string
  system_prompt: string
  reference_data: string
  updated_at: string
  updated_by: 'ai' | 'manual'
}

export interface Post {
  id: string
  account_id: string
  content: string
  scheduled_date: string
  status: PostStatus
  source: PostSource
  error_message: string | null
  created_at: string
}

export interface PostMetrics {
  id: string
  post_id: string
  fetched_at: string
  impressions: number
  likes: number
  reposts: number
  replies: number
}
```

- [ ] **Step 4: Implement crypto module**

Create `src/lib/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(encryptedText: string): string {
  const key = getKey()
  const parts = encryptedText.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted format')
  const [ivHex, authTagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run src/test/lib/crypto.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add shared types and AES-256-GCM crypto module"
```

---

## Task 3: Supabase Schema + RLS

**Files:**
- Create: `supabase/migrations/20260412000000_initial.sql`

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
```

- [ ] **Step 2: Create Supabase project**

Go to https://supabase.com, create a new project. Copy the project URL, anon key, and service role key into `.env.local`.

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `ENCRYPTION_KEY` in `.env.local`.

Generate a cron secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste as `CRON_SECRET` in `.env.local`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260412000000_initial.sql`:

```sql
-- Extensions
create extension if not exists "uuid-ossp";

-- Companies
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- Users (linked to Supabase Auth)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  email text not null,
  role text not null default 'operator' check (role in ('admin', 'operator')),
  created_at timestamptz default now()
);

-- Accounts
create table accounts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  platform text not null check (platform in ('x', 'threads')),
  account_name text not null,
  api_key text,
  api_secret text,
  access_token text,
  access_token_secret text,
  platform_user_id text,
  posting_times jsonb not null default '["09:00","13:00","19:00"]'::jsonb,
  created_at timestamptz default now()
);

-- Prompt configs (1:1 with accounts)
create table prompt_configs (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  system_prompt text not null default '',
  reference_data text not null default '',
  updated_at timestamptz default now(),
  updated_by text not null default 'manual' check (updated_by in ('ai', 'manual'))
);

-- Posts
create table posts (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references accounts(id) on delete cascade,
  content text not null,
  scheduled_date timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'ready', 'published', 'failed')),
  source text not null default 'manual' check (source in ('ai', 'manual')),
  error_message text,
  created_at timestamptz default now()
);

-- Post metrics
create table post_metrics (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  fetched_at timestamptz default now(),
  impressions int not null default 0,
  likes int not null default 0,
  reposts int not null default 0,
  replies int not null default 0
);

-- Account metrics (follower counts)
create table account_metrics (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references accounts(id) on delete cascade,
  fetched_at timestamptz default now(),
  followers_count int not null default 0
);

-- Prompt config history
create table prompt_config_history (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references accounts(id) on delete cascade,
  system_prompt text not null,
  reference_data text not null,
  changed_at timestamptz default now(),
  changed_by text not null check (changed_by in ('ai', 'manual'))
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table companies enable row level security;
alter table users enable row level security;
alter table accounts enable row level security;
alter table prompt_configs enable row level security;
alter table posts enable row level security;
alter table post_metrics enable row level security;
alter table account_metrics enable row level security;
alter table prompt_config_history enable row level security;

-- Helper: get current user's company_id
create or replace function get_my_company_id()
returns uuid
language sql
security definer
stable
as $$
  select company_id from users where id = auth.uid()
$$;

-- Helper: check if current user is admin
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists(select 1 from users where id = auth.uid() and role = 'admin')
$$;

-- Companies
create policy "users see own company" on companies
  for select using (id = get_my_company_id());

create policy "admins update own company" on companies
  for update using (id = get_my_company_id() and is_admin());

-- Users
create policy "users see company members" on users
  for select using (company_id = get_my_company_id());

create policy "admins manage users" on users
  for all using (company_id = get_my_company_id() and is_admin());

-- Accounts
create policy "users see company accounts" on accounts
  for select using (company_id = get_my_company_id());

create policy "admins manage accounts" on accounts
  for all using (company_id = get_my_company_id() and is_admin());

-- Prompt configs
create policy "users see company prompt configs" on prompt_configs
  for select using (
    account_id in (select id from accounts where company_id = get_my_company_id())
  );

create policy "users manage company prompt configs" on prompt_configs
  for all using (
    account_id in (select id from accounts where company_id = get_my_company_id())
  );

-- Posts
create policy "users see company posts" on posts
  for select using (
    account_id in (select id from accounts where company_id = get_my_company_id())
  );

create policy "users manage company posts" on posts
  for all using (
    account_id in (select id from accounts where company_id = get_my_company_id())
  );

-- Post metrics
create policy "users see company post metrics" on post_metrics
  for select using (
    post_id in (
      select p.id from posts p
      join accounts a on a.id = p.account_id
      where a.company_id = get_my_company_id()
    )
  );

-- Account metrics
create policy "users see company account metrics" on account_metrics
  for select using (
    account_id in (select id from accounts where company_id = get_my_company_id())
  );

-- Prompt config history
create policy "users see prompt config history" on prompt_config_history
  for select using (
    account_id in (select id from accounts where company_id = get_my_company_id())
  );

create policy "users insert prompt config history" on prompt_config_history
  for insert with check (
    account_id in (select id from accounts where company_id = get_my_company_id())
  );
```

- [ ] **Step 4: Run migration in Supabase**

In the Supabase dashboard: SQL Editor → paste the migration content → Run.

Verify all tables appear in the Table Editor.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema with RLS policies"
```

---

## Task 4: Supabase Clients + Auth + Middleware

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/middleware.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Create middleware for session refresh**

Create `src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  if (!user && !isAuthRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/posts', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Create auth layout**

Create `src/app/(auth)/layout.tsx`:

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/posts')
      router.refresh()
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-lg shadow p-8">
      <h1 className="text-2xl font-bold mb-6">SNS Automation</h1>
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Create first admin user in Supabase**

In Supabase dashboard: Authentication → Users → Invite user (enter your email).

Then in SQL Editor, run:

```sql
-- After accepting the invite and setting a password, run this:
-- Replace 'your-email@example.com' with your actual email
insert into companies (name) values ('My Company') returning id;
-- Copy the returned ID, then:
insert into users (id, company_id, email, role)
select u.id, 'PASTE_COMPANY_ID_HERE', u.email, 'admin'
from auth.users u
where u.email = 'your-email@example.com';
```

- [ ] **Step 7: Test login works**

```bash
npm run dev
```

Navigate to http://localhost:3000 — should redirect to /login. Log in with your credentials — should redirect to /posts (404 for now, that's expected).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Supabase auth, middleware, and login page"
```

---

## Task 5: Dashboard Layout + Company/User Management

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/page.tsx`
- Create: `src/app/(dashboard)/companies/page.tsx`
- Create: `src/app/(dashboard)/users/page.tsx`

- [ ] **Step 1: Create dashboard layout with navigation**

Create `src/app/(dashboard)/layout.tsx`:

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-gray-900 text-white flex flex-col p-4 gap-2">
        <div className="font-bold text-lg mb-4">SNS Automation</div>
        <Link href="/posts" className="px-3 py-2 rounded hover:bg-gray-700 text-sm">
          Posts
        </Link>
        <Link href="/accounts" className="px-3 py-2 rounded hover:bg-gray-700 text-sm">
          Accounts
        </Link>
        {isAdmin && (
          <>
            <Link href="/users" className="px-3 py-2 rounded hover:bg-gray-700 text-sm">
              Users
            </Link>
            <Link href="/companies" className="px-3 py-2 rounded hover:bg-gray-700 text-sm">
              Companies
            </Link>
          </>
        )}
        <div className="mt-auto">
          <form action="/api/auth/signout" method="post">
            <button className="px-3 py-2 rounded hover:bg-gray-700 text-sm w-full text-left">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8 bg-gray-50">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create sign-out API route**

Create `src/app/api/auth/signout/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'))
}
```

- [ ] **Step 3: Create dashboard redirect**

Create `src/app/(dashboard)/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
export default function DashboardPage() {
  redirect('/posts')
}
```

- [ ] **Step 4: Create companies page (admin)**

Create `src/app/(dashboard)/companies/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CompaniesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') redirect('/posts')

  const { data: companies } = await supabase.from('companies').select('*')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Companies</h1>
      <table className="w-full bg-white rounded shadow">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-4">Name</th>
            <th className="text-left p-4">Created</th>
          </tr>
        </thead>
        <tbody>
          {companies?.map(c => (
            <tr key={c.id} className="border-t">
              <td className="p-4">{c.name}</td>
              <td className="p-4 text-gray-500">
                {new Date(c.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Create users page (admin)**

Create `src/app/(dashboard)/users/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') redirect('/posts')

  const { data: users } = await supabase.from('users').select('*').order('created_at')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <p className="text-sm text-gray-500 mb-4">
        To invite a new user: Supabase Dashboard → Authentication → Users → Invite user,
        then run the SQL to assign company and role.
      </p>
      <table className="w-full bg-white rounded shadow">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-4">Email</th>
            <th className="text-left p-4">Role</th>
            <th className="text-left p-4">Created</th>
          </tr>
        </thead>
        <tbody>
          {users?.map(u => (
            <tr key={u.id} className="border-t">
              <td className="p-4">{u.email}</td>
              <td className="p-4">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {u.role}
                </span>
              </td>
              <td className="p-4 text-gray-500">
                {new Date(u.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Verify navigation works**

```bash
npm run dev
```

Log in and verify: sidebar shows Posts/Accounts (and Users/Companies for admin), sign-out works.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add dashboard layout and company/user management pages"
```

---

## Task 6: Account Management + API Key Encryption

**Files:**
- Create: `src/app/(dashboard)/accounts/page.tsx`
- Create: `src/app/(dashboard)/accounts/[id]/page.tsx`
- Create: `src/components/accounts/AccountSettingsForm.tsx`
- Create: `src/app/api/accounts/route.ts`
- Create: `src/app/api/accounts/[id]/route.ts`

- [ ] **Step 1: Write failing test for account API**

Create `src/test/api/accounts.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

// Test that API keys are encrypted before storage
describe('account API key handling', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  it('encrypts api_key before storing', () => {
    const raw = 'super-secret-api-key'
    const stored = encrypt(raw)
    expect(stored).not.toBe(raw)
    expect(decrypt(stored)).toBe(raw)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (uses existing crypto)**

```bash
npm run test:run src/test/api/accounts.test.ts
```

Expected: PASS

- [ ] **Step 3: Create accounts list page**

Create `src/app/(dashboard)/accounts/page.tsx`:

```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at')

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Link href="/accounts/new">
          <Button>+ New Account</Button>
        </Link>
      </div>
      <div className="grid gap-4">
        {accounts?.map(account => (
          <div key={account.id} className="bg-white rounded shadow p-4 flex justify-between items-center">
            <div>
              <div className="font-medium">{account.account_name}</div>
              <div className="text-sm text-gray-500 capitalize">{account.platform}</div>
            </div>
            <Link href={`/accounts/${account.id}`}>
              <Button variant="outline" size="sm">Settings</Button>
            </Link>
          </div>
        ))}
        {!accounts?.length && (
          <p className="text-gray-500">No accounts yet. Create one to get started.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create AccountSettingsForm component**

Create `src/components/accounts/AccountSettingsForm.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Account, PromptConfig, Platform } from '@/types'

interface Props {
  account?: Account
  promptConfig?: PromptConfig
}

export function AccountSettingsForm({ account, promptConfig }: Props) {
  const router = useRouter()
  const isNew = !account

  const [platform, setPlatform] = useState<Platform>(account?.platform ?? 'x')
  const [accountName, setAccountName] = useState(account?.account_name ?? '')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [accessTokenSecret, setAccessTokenSecret] = useState('')
  const [platformUserId, setPlatformUserId] = useState(account?.platform_user_id ?? '')
  const [postingTimes, setPostingTimes] = useState<string[]>(
    account?.posting_times ?? ['09:00', '13:00', '19:00']
  )
  const [systemPrompt, setSystemPrompt] = useState(promptConfig?.system_prompt ?? '')
  const [referenceData, setReferenceData] = useState(promptConfig?.reference_data ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  function addPostingTime() {
    setPostingTimes([...postingTimes, '12:00'])
  }
  function removePostingTime(i: number) {
    setPostingTimes(postingTimes.filter((_, idx) => idx !== i))
  }
  function updatePostingTime(i: number, value: string) {
    const updated = [...postingTimes]
    updated[i] = value
    setPostingTimes(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const body = {
      platform,
      account_name: accountName,
      api_key: apiKey || undefined,
      api_secret: apiSecret || undefined,
      access_token: accessToken || undefined,
      access_token_secret: accessTokenSecret || undefined,
      platform_user_id: platformUserId || undefined,
      posting_times: postingTimes,
      system_prompt: systemPrompt,
      reference_data: referenceData,
    }

    const url = isNew ? '/api/accounts' : `/api/accounts/${account.id}`
    const method = isNew ? 'POST' : 'PUT'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save')
    } else {
      router.push('/accounts')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleTest() {
    setTestResult(null)
    const res = await fetch(`/api/accounts/${account?.id}/test`, { method: 'POST' })
    const data = await res.json()
    setTestResult(res.ok ? '✓ Connection successful' : `✗ ${data.error}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="bg-white rounded shadow p-6 space-y-4">
        <h2 className="font-semibold text-lg">Basic Info</h2>
        <div>
          <Label>Platform</Label>
          <Select value={platform} onValueChange={v => setPlatform(v as Platform)} disabled={!isNew}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="x">X (Twitter)</SelectItem>
              <SelectItem value="threads">Threads</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Account Name</Label>
          <Input value={accountName} onChange={e => setAccountName(e.target.value)} required />
        </div>
      </div>

      <div className="bg-white rounded shadow p-6 space-y-4">
        <h2 className="font-semibold text-lg">API Credentials</h2>
        <p className="text-sm text-gray-500">Leave blank to keep existing values.</p>
        {platform === 'x' && (
          <>
            <div>
              <Label>API Key (Consumer Key)</Label>
              <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <Label>API Secret (Consumer Secret)</Label>
              <Input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <Label>Access Token Secret</Label>
              <Input type="password" value={accessTokenSecret} onChange={e => setAccessTokenSecret(e.target.value)} placeholder="••••••••" />
            </div>
          </>
        )}
        {platform === 'threads' && (
          <>
            <div>
              <Label>Access Token</Label>
              <Input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <Label>Threads User ID</Label>
              <Input value={platformUserId} onChange={e => setPlatformUserId(e.target.value)} />
            </div>
          </>
        )}
        {!isNew && (
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={handleTest}>Test Connection</Button>
            {testResult && <span className="text-sm">{testResult}</span>}
          </div>
        )}
      </div>

      <div className="bg-white rounded shadow p-6 space-y-4">
        <h2 className="font-semibold text-lg">Posting Schedule</h2>
        <div className="space-y-2">
          {postingTimes.map((time, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="time"
                value={time}
                onChange={e => updatePostingTime(i, e.target.value)}
                className="w-32"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => removePostingTime(i)}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addPostingTime}>
            + Add time
          </Button>
        </div>
      </div>

      <div className="bg-white rounded shadow p-6 space-y-4">
        <h2 className="font-semibold text-lg">Prompt Configuration</h2>
        <div>
          <Label>System Prompt</Label>
          <Textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            rows={6}
            placeholder="Describe the account's personality, tone, and rules..."
          />
        </div>
        <div>
          <Label>Reference Data</Label>
          <Textarea
            value={referenceData}
            onChange={e => setReferenceData(e.target.value)}
            rows={6}
            placeholder="Paste example posts, brand guidelines, etc..."
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Account'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/accounts')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Create account settings page**

Create `src/app/(dashboard)/accounts/[id]/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountSettingsForm } from '@/components/accounts/AccountSettingsForm'

export default async function AccountPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isNew = params.id === 'new'

  let account = null
  let promptConfig = null

  if (!isNew) {
    const { data } = await supabase.from('accounts').select('*').eq('id', params.id).single()
    if (!data) redirect('/accounts')
    account = data

    const { data: pc } = await supabase
      .from('prompt_configs').select('*').eq('account_id', params.id).single()
    promptConfig = pc
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        {isNew ? 'New Account' : `Edit: ${account?.account_name}`}
      </h1>
      <AccountSettingsForm account={account} promptConfig={promptConfig} />
    </div>
  )
}
```

- [ ] **Step 6: Create accounts API routes**

Create `src/app/api/accounts/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users').select('company_id, role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const {
    platform, account_name, api_key, api_secret,
    access_token, access_token_secret, platform_user_id,
    posting_times, system_prompt, reference_data
  } = body

  const accountData: Record<string, unknown> = {
    company_id: currentUser.company_id,
    platform,
    account_name,
    posting_times,
    platform_user_id: platform_user_id || null,
  }

  if (api_key) accountData.api_key = encrypt(api_key)
  if (api_secret) accountData.api_secret = encrypt(api_secret)
  if (access_token) accountData.access_token = encrypt(access_token)
  if (access_token_secret) accountData.access_token_secret = encrypt(access_token_secret)

  const { data: account, error } = await supabase
    .from('accounts').insert(accountData).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Create prompt_config
  await supabase.from('prompt_configs').insert({
    account_id: account.id,
    system_prompt: system_prompt || '',
    reference_data: reference_data || '',
  })

  return NextResponse.json(account, { status: 201 })
}
```

Create `src/app/api/accounts/[id]/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const {
    api_key, api_secret, access_token, access_token_secret,
    platform_user_id, posting_times, account_name,
    system_prompt, reference_data
  } = body

  const accountUpdate: Record<string, unknown> = {
    account_name,
    posting_times,
    platform_user_id: platform_user_id || null,
  }

  if (api_key) accountUpdate.api_key = encrypt(api_key)
  if (api_secret) accountUpdate.api_secret = encrypt(api_secret)
  if (access_token) accountUpdate.access_token = encrypt(access_token)
  if (access_token_secret) accountUpdate.access_token_secret = encrypt(access_token_secret)

  const { error } = await supabase
    .from('accounts').update(accountUpdate).eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Update prompt_config
  await supabase.from('prompt_configs').upsert({
    account_id: params.id,
    system_prompt: system_prompt || '',
    reference_data: reference_data || '',
    updated_at: new Date().toISOString(),
    updated_by: 'manual',
  }, { onConflict: 'account_id' })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Create connection test API route**

Create `src/app/api/accounts/[id]/test/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { decrypt } from '@/lib/crypto'
import { postToThreads } from '@/lib/threads-api'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('accounts').select('*').eq('id', params.id).single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  try {
    if (account.platform === 'threads') {
      if (!account.access_token || !account.platform_user_id) {
        return NextResponse.json({ error: 'Missing access_token or platform_user_id' }, { status: 400 })
      }
      // Verify token by fetching profile
      const token = decrypt(account.access_token)
      const res = await fetch(
        `https://graph.threads.net/v1.0/${account.platform_user_id}?fields=id,username&access_token=${token}`
      )
      if (!res.ok) {
        const data = await res.json()
        return NextResponse.json({ error: data.error?.message ?? 'Connection failed' }, { status: 400 })
      }
    }

    if (account.platform === 'x') {
      if (!account.api_key || !account.api_secret || !account.access_token || !account.access_token_secret) {
        return NextResponse.json({ error: 'Missing X API credentials' }, { status: 400 })
      }
      const { TwitterApi } = await import('twitter-api-v2')
      const client = new TwitterApi({
        appKey: decrypt(account.api_key),
        appSecret: decrypt(account.api_secret),
        accessToken: decrypt(account.access_token),
        accessSecret: decrypt(account.access_token_secret),
      })
      await client.v2.me()
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
```

- [ ] **Step 8: Verify account creation works**

```bash
npm run dev
```

Log in → Accounts → New Account → fill in details → Save. Verify account appears in list.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add account management with encrypted API key storage"
```

---

## Task 7: Platform API Clients (Threads + X)

**Files:**
- Create: `src/lib/threads-api.ts`
- Create: `src/lib/x-api.ts`
- Create: `src/test/lib/threads-api.test.ts`
- Create: `src/test/lib/x-api.test.ts`

- [ ] **Step 1: Write failing test for Threads client**

Create `src/test/lib/threads-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postToThreads } from '@/lib/threads-api'

describe('postToThreads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('creates container then publishes', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container-123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'post-456' }),
      })
    vi.stubGlobal('fetch', mockFetch)

    const result = await postToThreads({
      accessToken: 'token-abc',
      userId: 'user-789',
      content: 'Hello Threads!',
    })

    expect(result).toBe('post-456')
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // First call: create container
    const [createUrl, createOptions] = mockFetch.mock.calls[0]
    expect(createUrl).toContain('user-789/threads')
    expect(createOptions.method).toBe('POST')

    // Second call: publish
    const [publishUrl] = mockFetch.mock.calls[1]
    expect(publishUrl).toContain('user-789/threads_publish')
  })

  it('throws when container creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Invalid token' } }),
    }))

    await expect(postToThreads({
      accessToken: 'bad-token',
      userId: 'user-789',
      content: 'Hello',
    })).rejects.toThrow('Threads API error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run src/test/lib/threads-api.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/threads-api'`

- [ ] **Step 3: Implement Threads client**

Create `src/lib/threads-api.ts`:

```typescript
const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsPostOptions {
  accessToken: string
  userId: string
  content: string
}

export async function postToThreads({ accessToken, userId, content }: ThreadsPostOptions): Promise<string> {
  // Step 1: Create media container
  const createUrl = new URL(`${THREADS_API_BASE}/${userId}/threads`)
  createUrl.searchParams.set('media_type', 'TEXT')
  createUrl.searchParams.set('text', content)
  createUrl.searchParams.set('access_token', accessToken)

  const createRes = await fetch(createUrl.toString(), { method: 'POST' })
  const createData = await createRes.json()

  if (!createRes.ok) {
    throw new Error(`Threads API error: ${createData.error?.message ?? 'Unknown error'}`)
  }

  const containerId = createData.id

  // Step 2: Publish the container
  const publishUrl = new URL(`${THREADS_API_BASE}/${userId}/threads_publish`)
  publishUrl.searchParams.set('creation_id', containerId)
  publishUrl.searchParams.set('access_token', accessToken)

  const publishRes = await fetch(publishUrl.toString(), { method: 'POST' })
  const publishData = await publishRes.json()

  if (!publishRes.ok) {
    throw new Error(`Threads publish error: ${publishData.error?.message ?? 'Unknown error'}`)
  }

  return publishData.id
}
```

- [ ] **Step 4: Run Threads test to verify it passes**

```bash
npm run test:run src/test/lib/threads-api.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Write failing test for X client**

Create `src/test/lib/x-api.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { postToX } from '@/lib/x-api'

describe('postToX', () => {
  it('posts a tweet and returns tweet id', async () => {
    // twitter-api-v2 will be mocked at the module level
    const mockTweetFn = vi.fn().mockResolvedValue({ data: { id: 'tweet-123', text: 'Hello X!' } })

    vi.mock('twitter-api-v2', () => ({
      TwitterApi: vi.fn().mockImplementation(() => ({
        v2: { tweet: mockTweetFn },
      })),
    }))

    const result = await postToX({
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'tokenSecret',
      content: 'Hello X!',
    })

    expect(result).toBe('tweet-123')
    expect(mockTweetFn).toHaveBeenCalledWith('Hello X!')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm run test:run src/test/lib/x-api.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/x-api'`

- [ ] **Step 7: Implement X client**

Create `src/lib/x-api.ts`:

```typescript
import { TwitterApi } from 'twitter-api-v2'

interface XPostOptions {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
  content: string
}

export async function postToX({ apiKey, apiSecret, accessToken, accessTokenSecret, content }: XPostOptions): Promise<string> {
  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  })

  const tweet = await client.v2.tweet(content)
  return tweet.data.id
}
```

- [ ] **Step 8: Run X test to verify it passes**

```bash
npm run test:run src/test/lib/x-api.test.ts
```

Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Threads and X API publishing clients"
```

---

## Task 8: Post Management UI

**Files:**
- Create: `src/app/(dashboard)/posts/page.tsx`
- Create: `src/components/posts/PostsTable.tsx`
- Create: `src/components/posts/PostStatusBadge.tsx`
- Create: `src/components/posts/CreatePostModal.tsx`
- Create: `src/app/api/posts/route.ts`
- Create: `src/app/api/posts/[id]/route.ts`

- [ ] **Step 1: Create PostStatusBadge component**

Create `src/components/posts/PostStatusBadge.tsx`:

```typescript
import type { PostStatus } from '@/types'

const statusStyles: Record<PostStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyles[status]}`}>
      {status}
    </span>
  )
}
```

- [ ] **Step 2: Create CreatePostModal component**

Create `src/components/posts/CreatePostModal.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  accountId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreatePostModal({ accountId, open, onClose, onCreated }: Props) {
  const [content, setContent] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        content,
        scheduled_date: new Date(scheduledDate).toISOString(),
        source: 'manual',
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to create post')
    } else {
      setContent('')
      setScheduledDate('')
      onCreated()
      onClose()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              required
              placeholder="Write your post..."
            />
            <p className="text-xs text-gray-500 mt-1">{content.length} characters</p>
          </div>
          <div>
            <Label>Scheduled Date & Time</Label>
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save as Draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create PostsTable component**

Create `src/components/posts/PostsTable.tsx`:

```typescript
'use client'

import { useState, useCallback } from 'react'
import { PostStatusBadge } from './PostStatusBadge'
import { CreatePostModal } from './CreatePostModal'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Post, Account, PostStatus } from '@/types'

interface Props {
  initialPosts: Post[]
  accounts: Account[]
}

const STATUSES: PostStatus[] = ['draft', 'review', 'ready', 'published', 'failed']

export function PostsTable({ initialPosts, accounts }: Props) {
  const [posts, setPosts] = useState(initialPosts)
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const filteredPosts = posts
    .filter(p => p.account_id === selectedAccountId)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

  async function refreshPosts() {
    const res = await fetch(`/api/posts?account_id=${selectedAccountId}`)
    const data = await res.json()
    setPosts(prev => {
      const others = prev.filter(p => p.account_id !== selectedAccountId)
      return [...others, ...data]
    })
  }

  async function updateStatus(postId: string, status: PostStatus) {
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status } : p))
  }

  async function saveEdit(postId: string) {
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: editContent } : p))
    setEditingId(null)
  }

  async function publishNow(postId: string) {
    setPublishingId(postId)
    await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    })
    await refreshPosts()
    setPublishingId(null)
  }

  const canEdit = (status: PostStatus) => status === 'draft' || status === 'review'

  return (
    <div>
      {/* Account tabs */}
      <div className="flex gap-2 mb-4">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedAccountId(a.id)}
            className={`px-4 py-2 rounded text-sm font-medium ${
              selectedAccountId === a.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 border hover:bg-gray-50'
            }`}
          >
            {a.account_name}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{filteredPosts.length} posts</p>
        <Button onClick={() => setShowCreateModal(true)}>+ New Post</Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 text-sm font-medium">Content</th>
              <th className="text-left p-4 text-sm font-medium">Scheduled</th>
              <th className="text-left p-4 text-sm font-medium">Status</th>
              <th className="text-left p-4 text-sm font-medium">Source</th>
              <th className="text-left p-4 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map(post => (
              <tr key={post.id} className="border-t hover:bg-gray-50">
                <td className="p-4 max-w-xs">
                  {editingId === post.id ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(post.id)}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm line-clamp-2">{post.content}</p>
                  )}
                </td>
                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                  {new Date(post.scheduled_date).toLocaleString('ja-JP')}
                </td>
                <td className="p-4">
                  <Select
                    value={post.status}
                    onValueChange={v => updateStatus(post.id, v as PostStatus)}
                  >
                    <SelectTrigger className="w-28 h-7 text-xs">
                      <SelectValue>
                        <PostStatusBadge status={post.status} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => (
                        <SelectItem key={s} value={s}>
                          <PostStatusBadge status={s} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-4">
                  <span className="text-xs text-gray-500">{post.source}</span>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {canEdit(post.status) && editingId !== post.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingId(post.id); setEditContent(post.content) }}
                      >
                        Edit
                      </Button>
                    )}
                    {post.status === 'ready' && (
                      <Button
                        size="sm"
                        onClick={() => publishNow(post.id)}
                        disabled={publishingId === post.id}
                      >
                        {publishingId === post.id ? 'Posting...' : 'Post Now'}
                      </Button>
                    )}
                    {post.status === 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(post.id, 'draft')}
                      >
                        Unready
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredPosts.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  No posts yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreatePostModal
        accountId={selectedAccountId}
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refreshPosts}
      />
    </div>
  )
}
```

- [ ] **Step 4: Create posts page**

Create `src/app/(dashboard)/posts/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PostsTable } from '@/components/posts/PostsTable'

export default async function PostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts').select('*').order('created_at')

  const { data: posts } = await supabase
    .from('posts').select('*').order('scheduled_date')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Posts</h1>
      {!accounts?.length ? (
        <p className="text-gray-500">No accounts yet. <a href="/accounts/new" className="underline">Create an account</a> to get started.</p>
      ) : (
        <PostsTable initialPosts={posts ?? []} accounts={accounts} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create posts API routes**

Create `src/app/api/posts/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')

  let query = supabase.from('posts').select('*').order('scheduled_date')
  if (accountId) query = query.eq('account_id', accountId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { account_id, content, scheduled_date, source = 'manual' } = body

  const { data, error } = await supabase.from('posts').insert({
    account_id, content, scheduled_date, source, status: 'draft',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
```

Create `src/app/api/posts/[id]/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if (body.status !== undefined) updates.status = body.status
  if (body.content !== undefined) updates.content = body.content
  if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date

  const { error } = await supabase.from('posts').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('posts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Verify posts UI works**

```bash
npm run dev
```

Navigate to /posts. Verify: account tabs, create post modal, status dropdown, edit inline, Post Now button.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add post management UI with table, status management, and manual creation"
```

---

## Task 9: Publish API + Vercel Cron

**Files:**
- Create: `src/app/api/publish/route.ts`
- Create: `src/app/api/cron/publish/route.ts`
- Create: `src/test/api/publish.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write failing test for publish logic**

Create `src/test/api/publish.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { publishPost } from '@/lib/publish'

describe('publishPost', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  it('decrypts credentials before posting to Threads', async () => {
    const { encrypt } = await import('@/lib/crypto')
    const mockPostToThreads = vi.fn().mockResolvedValue('threads-post-id')
    vi.mock('@/lib/threads-api', () => ({ postToThreads: mockPostToThreads }))

    const encryptedToken = encrypt('real-access-token')

    await publishPost({
      platform: 'threads',
      content: 'Hello world',
      access_token: encryptedToken,
      platform_user_id: 'user-123',
    })

    expect(mockPostToThreads).toHaveBeenCalledWith({
      accessToken: 'real-access-token',
      userId: 'user-123',
      content: 'Hello world',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run src/test/api/publish.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/publish'`

- [ ] **Step 3: Create publish logic module**

Create `src/lib/publish.ts`:

```typescript
import { decrypt } from '@/lib/crypto'
import { postToThreads } from '@/lib/threads-api'
import { postToX } from '@/lib/x-api'
import type { Platform } from '@/types'

interface PublishOptions {
  platform: Platform
  content: string
  access_token: string | null
  access_token_secret?: string | null
  api_key?: string | null
  api_secret?: string | null
  platform_user_id?: string | null
}

export async function publishPost(options: PublishOptions): Promise<string> {
  const { platform, content } = options

  if (platform === 'threads') {
    if (!options.access_token || !options.platform_user_id) {
      throw new Error('Threads requires access_token and platform_user_id')
    }
    return postToThreads({
      accessToken: decrypt(options.access_token),
      userId: options.platform_user_id,
      content,
    })
  }

  if (platform === 'x') {
    if (!options.api_key || !options.api_secret || !options.access_token || !options.access_token_secret) {
      throw new Error('X requires api_key, api_secret, access_token, and access_token_secret')
    }
    return postToX({
      apiKey: decrypt(options.api_key),
      apiSecret: decrypt(options.api_secret),
      accessToken: decrypt(options.access_token),
      accessTokenSecret: decrypt(options.access_token_secret),
      content,
    })
  }

  throw new Error(`Unsupported platform: ${platform}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run src/test/api/publish.test.ts
```

Expected: PASS (1 test)

- [ ] **Step 5: Create immediate publish API route**

Create `src/app/api/publish/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishPost } from '@/lib/publish'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { post_id } = await request.json()

  const { data: post } = await supabase
    .from('posts').select('*, accounts(*)').eq('id', post_id).single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const account = post.accounts as Record<string, unknown>

  try {
    await publishPost({
      platform: account.platform as 'x' | 'threads',
      content: post.content,
      access_token: account.access_token as string | null,
      access_token_secret: account.access_token_secret as string | null,
      api_key: account.api_key as string | null,
      api_secret: account.api_secret as string | null,
      platform_user_id: account.platform_user_id as string | null,
    })

    await supabase.from('posts')
      .update({ status: 'published' })
      .eq('id', post_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase.from('posts')
      .update({ status: 'failed', error_message: message })
      .eq('id', post_id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 6: Create Vercel Cron publish route**

Create `src/app/api/cron/publish/route.ts`:

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishPost } from '@/lib/publish'

export async function GET(request: Request) {
  // Verify this is called by Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  // Find all ready posts whose scheduled_date has passed
  const { data: posts } = await supabase
    .from('posts')
    .select('*, accounts(*)')
    .eq('status', 'ready')
    .lte('scheduled_date', now)

  if (!posts?.length) {
    return NextResponse.json({ published: 0 })
  }

  const results = await Promise.allSettled(
    posts.map(async post => {
      const account = post.accounts as Record<string, unknown>
      try {
        await publishPost({
          platform: account.platform as 'x' | 'threads',
          content: post.content,
          access_token: account.access_token as string | null,
          access_token_secret: account.access_token_secret as string | null,
          api_key: account.api_key as string | null,
          api_secret: account.api_secret as string | null,
          platform_user_id: account.platform_user_id as string | null,
        })

        await supabase.from('posts')
          .update({ status: 'published' })
          .eq('id', post.id)

        return { id: post.id, ok: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await supabase.from('posts')
          .update({ status: 'failed', error_message: message })
          .eq('id', post.id)
        return { id: post.id, ok: false, error: message }
      }
    })
  )

  const published = results.filter(r => r.status === 'fulfilled' && r.value.ok).length
  return NextResponse.json({ published, total: posts.length })
}
```

- [ ] **Step 7: Configure Vercel Cron**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/publish",
      "schedule": "* * * * *"
    }
  ]
}
```

Add `CRON_SECRET` to Vercel environment variables (same value as `.env.local`).

- [ ] **Step 8: Run all tests**

```bash
npm run test:run
```

Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add publish API routes and Vercel Cron for scheduled posting"
```

---

## Task 10: Deploy to Vercel

**Files:**
- No new files

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/YOUR_USERNAME/sns-automation.git
git branch -M main
git push -u origin main
```

- [ ] **Step 2: Connect to Vercel**

Go to https://vercel.com → New Project → Import from GitHub → select `sns-automation`.

- [ ] **Step 3: Set environment variables in Vercel**

In Vercel project settings → Environment Variables, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_SITE_URL` = your Vercel deployment URL (e.g. `https://sns-automation.vercel.app`)

- [ ] **Step 4: Update Supabase redirect URLs**

In Supabase dashboard: Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`

- [ ] **Step 5: Deploy**

```bash
git push origin main
```

Vercel auto-deploys. Monitor the deployment in Vercel dashboard.

- [ ] **Step 6: Smoke test production**

1. Navigate to production URL → should redirect to /login
2. Log in → should land on /posts
3. Create an account with test API credentials
4. Create a manual post, set scheduled date to 2 minutes from now, set status to Ready
5. Wait 2 minutes — verify post appears as Published on the SNS platform

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: add Vercel deployment config"
git push origin main
```

---

## Summary

Plan 1 delivers a fully working multi-tenant SNS management platform:

- Multi-tenant auth (Supabase RLS, company/user/account hierarchy)
- Manual post creation with scheduled dates
- Status workflow: draft → review → ready → published/failed
- Immediate "Post Now" button + Vercel Cron scheduled publishing
- AES-256-GCM encrypted API credentials
- X and Threads publishing

**Next: Plan 2** — AI Post Generation, Self-improvement Loop, Analytics Dashboard
