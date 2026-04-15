'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function updateCompanyName(companyId: string, name: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  const { data: profile } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: '管理者権限が必要です' }
  }
  if (profile.company_id !== companyId) {
    return { error: '操作権限がありません' }
  }

  const service = await createServiceClient()
  const { error } = await service
    .from('companies')
    .update({ name: name.trim() })
    .eq('id', companyId)

  if (error) return { error: error.message }

  revalidatePath('/companies')
  return { error: null }
}
