import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ReportDetail } from '@/components/analytics/ReportDetail'
import type { AccountAnalysisReport } from '@/types'

export default async function AnalysisReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: report } = await supabase
    .from('account_analysis_reports')
    .select('*, accounts(account_name)')
    .eq('id', id)
    .single()

  if (!report) notFound()

  const { accounts, ...reportFields } = report as AccountAnalysisReport & {
    accounts: { account_name: string }
  }

  return <ReportDetail report={reportFields} accountName={accounts.account_name} />
}
