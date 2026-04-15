import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CompanyForm } from './company-form'

export default async function CompaniesPage() {
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

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, created_at')
    .eq('id', profile.company_id)
    .single()

  if (!company) {
    return <div className="text-gray-500 text-sm">企業情報が見つかりません。</div>
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold mb-6">企業設定</h1>
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">企業ID</p>
          <p className="text-sm font-mono text-gray-700">{company.id}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">登録日</p>
          <p className="text-sm text-gray-700">
            {new Date(company.created_at).toLocaleDateString('ja-JP')}
          </p>
        </div>
        <CompanyForm companyId={company.id} currentName={company.name} />
      </div>
    </div>
  )
}
