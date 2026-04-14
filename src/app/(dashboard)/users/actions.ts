'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function getAdminProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') return null
  return profile as { role: 'admin'; company_id: string }
}

export async function inviteUser(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim()
  const role = formData.get('role') as string | null
  const password = (formData.get('password') as string | null)?.trim()

  if (!email || !role || !password) return { error: '全項目を入力してください' }
  if (role !== 'admin' && role !== 'operator') return { error: '無効なロールです' }

  const profile = await getAdminProfile()
  if (!profile) return { error: '管理者権限が必要です' }

  const service = await createServiceClient()

  // Create auth user
  const { data: created, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError) return { error: authError.message }

  // Insert into users table
  const { error: insertError } = await service.from('users').insert({
    id: created.user.id,
    company_id: profile.company_id,
    email,
    role,
  })

  if (insertError) {
    // Roll back auth user on failure
    await service.auth.admin.deleteUser(created.user.id)
    return { error: insertError.message }
  }

  revalidatePath('/users')
  return { error: null }
}

export async function deleteUser(userId: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: '管理者権限が必要です' }

  const service = await createServiceClient()

  // Verify target user belongs to same company
  const { data: target } = await service
    .from('users')
    .select('company_id')
    .eq('id', userId)
    .single()

  if (!target || target.company_id !== profile.company_id) {
    return { error: '操作権限がありません' }
  }

  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  revalidatePath('/users')
  return { error: null }
}
