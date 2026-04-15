'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

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

function encryptIfPresent(value: string | null): string | null {
  if (!value || value.trim() === '') return null
  return encrypt(value.trim())
}

export async function createAccount(formData: FormData) {
  const platform = formData.get('platform') as string | null
  const accountName = (formData.get('account_name') as string | null)?.trim()
  const postingTimesRaw = (formData.get('posting_times') as string | null) ?? ''
  const apiKey = formData.get('api_key') as string | null
  const apiSecret = formData.get('api_secret') as string | null
  const accessToken = formData.get('access_token') as string | null
  const accessTokenSecret = formData.get('access_token_secret') as string | null

  if (!platform || !accountName) return { error: 'プラットフォームとアカウント名は必須です' }
  if (platform !== 'x' && platform !== 'threads') return { error: '無効なプラットフォームです' }

  const postingTimes = postingTimesRaw
    .split(',')
    .map(t => t.trim())
    .filter(t => /^\d{2}:\d{2}$/.test(t))

  const profile = await getAdminProfile()
  if (!profile) return { error: '管理者権限が必要です' }

  const service = await createServiceClient()
  const { error } = await service.from('accounts').insert({
    company_id: profile.company_id,
    platform,
    account_name: accountName,
    posting_times: postingTimes,
    api_key: encryptIfPresent(apiKey),
    api_secret: encryptIfPresent(apiSecret),
    access_token: encryptIfPresent(accessToken),
    access_token_secret: encryptIfPresent(accessTokenSecret),
  })

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: null }
}

export async function deleteAccount(accountId: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: '管理者権限が必要です' }

  const service = await createServiceClient()

  // Verify the account belongs to the same company
  const { data: account } = await service
    .from('accounts')
    .select('company_id')
    .eq('id', accountId)
    .single()

  if (!account || account.company_id !== profile.company_id) {
    return { error: '操作権限がありません' }
  }

  const { error } = await service.from('accounts').delete().eq('id', accountId)
  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: null }
}
