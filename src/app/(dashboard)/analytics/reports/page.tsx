import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsList } from '@/components/analytics/ReportsList'

export default async function AnalysisReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const firstAccountId = accounts?.[0]?.id

  const { data: reports } = firstAccountId
    ? await supabase
        .from('account_analysis_reports')
        .select('id, period_start, period_end, days_recent, generated_at, insights_generated_at')
        .eq('account_id', firstAccountId)
        .order('generated_at', { ascending: false })
    : { data: [] }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">分析レポート</h1>
      {!accounts?.length ? (
        <p className="text-sm text-gray-500">アカウントがありません。</p>
      ) : (
        <ReportsList accounts={accounts} initialReports={reports ?? []} />
      )}
    </div>
  )
}
