import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AccountForm } from './account-form'
import { DeleteAccountButton } from './delete-button'

export default async function AccountsPage() {
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

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, platform, account_name, posting_times, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true })

  const isAdmin = profile.role === 'admin'

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-6">アカウント管理</h1>

      {isAdmin && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">アカウントを追加</h2>
          <AccountForm />
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>アカウント名</TableHead>
              <TableHead>プラットフォーム</TableHead>
              <TableHead>投稿時刻</TableHead>
              <TableHead>登録日</TableHead>
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts && accounts.length > 0 ? (
              accounts.map(account => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.account_name}</TableCell>
                  <TableCell>
                    <Badge variant={account.platform === 'x' ? 'default' : 'secondary'}>
                      {account.platform === 'x' ? 'X' : 'Threads'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {account.posting_times.length > 0
                      ? account.posting_times.join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(account.created_at).toLocaleDateString('ja-JP')}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <DeleteAccountButton
                        accountId={account.id}
                        accountName={account.account_name}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 5 : 4}
                  className="text-center text-gray-400 text-sm py-8"
                >
                  アカウントがありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
