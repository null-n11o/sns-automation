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
import { InviteUserForm } from './invite-form'
import { DeleteButton } from './delete-button'

export default async function UsersPage() {
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

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="text-gray-500 text-sm">
        この画面は管理者のみ閲覧できます。
      </div>
    )
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, email, role, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true })

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">ユーザー管理</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-sm font-medium mb-4">ユーザーを追加</h2>
        <InviteUserForm />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>メールアドレス</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead>登録日</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-sm">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                    {u.role === 'admin' ? '管理者' : 'オペレーター'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell className="text-right">
                  <DeleteButton
                    userId={u.id}
                    email={u.email}
                    isSelf={u.id === user.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
