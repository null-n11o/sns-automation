import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AutoReplyForm } from './auto-reply-form'
import { AccountNameForm } from './account-name-form'
import { ThreadsTokenForm } from './threads-token-form'

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/accounts')

  const { data: account } = await supabase
    .from('accounts')
    .select('id, platform, account_name, posting_times, auto_reply_config, access_token, company_id')
    .eq('id', id)
    .single()

  if (!account || account.company_id !== profile.company_id) notFound()

  const config = (account.auto_reply_config ?? {}) as {
    enabled?: boolean
    tiers?: { window_minutes: number; threshold: number }[]
    templates?: string[]
  }

  return (
    <div className="max-w-2xl">
      <Link href="/accounts" className="text-sm text-gray-500 hover:underline">
        ← アカウント一覧
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-6">{account.account_name} の設定</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <AccountNameForm accountId={account.id} initialName={account.account_name} />
        <div className="border-t pt-4 text-sm space-y-1">
          <p>
            <span className="text-gray-500">プラットフォーム: </span>
            {account.platform === 'x' ? 'X' : 'Threads'}
          </p>
          <p>
            <span className="text-gray-500">投稿時刻: </span>
            {account.posting_times.length > 0 ? account.posting_times.join(', ') : '—'}
          </p>
        </div>
      </div>

      {account.platform === 'threads' && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-sm font-medium mb-1">Threads API</h2>
          <p className="text-xs text-gray-500 mb-4">
            Meta for Developersで生成した長期アクセストークンを設定します。
          </p>
          <ThreadsTokenForm
            accountId={account.id}
            initialHasToken={Boolean(account.access_token)}
          />
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-medium mb-4">自動リプライ設定</h2>
        {account.platform === 'threads' ? (
          <AutoReplyForm
            accountId={account.id}
            initial={{
              enabled: config.enabled ?? false,
              tiers: config.tiers ?? [],
              templates: config.templates ?? [],
            }}
          />
        ) : (
          <p className="text-sm text-gray-500">自動リプライは Threads のみ対応しています。</p>
        )}
      </div>
    </div>
  )
}
