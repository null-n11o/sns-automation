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
  const platformUserId = (formData.get('platform_user_id') as string | null)?.trim() || null

  if (!platform || !accountName) return { error: 'プラットフォームとアカウント名は必須です' }
  if (platform !== 'x' && platform !== 'threads') return { error: '無効なプラットフォームです' }
  if (platform === 'threads' && !platformUserId) return { error: 'ThreadsはUser IDが必須です' }

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
    platform_user_id: platformUserId,
  })

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  return { error: null }
}

export async function updateAccountName(
  accountId: string,
  accountName: string,
): Promise<{ error: string | null }> {
  const name = accountName.trim()
  if (!name) return { error: 'アカウント名は必須です' }

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

  const { error } = await service
    .from('accounts')
    .update({ account_name: name })
    .eq('id', accountId)

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  revalidatePath(`/accounts/${accountId}`)
  revalidatePath('/posts')
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

interface AutoReplyTierInput {
  hours: number
  threshold: number
}

interface AutoReplyConfigInput {
  enabled: boolean
  tiers: AutoReplyTierInput[]
  templates: string[]
}

export async function updateAutoReplyConfig(
  accountId: string,
  input: AutoReplyConfigInput,
): Promise<{ error: string | null }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: '管理者権限が必要です' }

  const service = await createServiceClient()
  const { data: account } = await service
    .from('accounts')
    .select('company_id, platform, auto_reply_config')
    .eq('id', accountId)
    .single()

  if (!account || account.company_id !== profile.company_id) {
    return { error: '操作権限がありません' }
  }

  const tiers = input.tiers
    .filter(
      (t) =>
        Number.isFinite(t.hours) &&
        t.hours > 0 &&
        Number.isFinite(t.threshold) &&
        t.threshold > 0,
    )
    .map((t) => ({
      window_minutes: Math.round(t.hours * 60),
      threshold: Math.round(t.threshold),
    }))

  const templates = input.templates.map((t) => t.trim()).filter((t) => t.length > 0)

  if (input.enabled) {
    if (tiers.length < 1 || tiers.length > 4) {
      return { error: '条件は1〜4個で設定してください' }
    }
    if (templates.length < 1) {
      return { error: 'リプ文面を1つ以上入力してください' }
    }
  }

  const existing = (account.auto_reply_config ?? {}) as {
    tiers?: { window_minutes: number; threshold: number }[]
    templates?: string[]
  }

  const config = {
    enabled: input.enabled,
    tiers: tiers.length ? tiers : (existing.tiers ?? []),
    templates: templates.length ? templates : (existing.templates ?? []),
  }

  const { error } = await service
    .from('accounts')
    .update({ auto_reply_config: config })
    .eq('id', accountId)

  if (error) return { error: error.message }

  revalidatePath('/accounts')
  revalidatePath(`/accounts/${accountId}`)
  return { error: null }
}
