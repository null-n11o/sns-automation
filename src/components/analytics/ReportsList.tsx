'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface AccountOption {
  id: string
  account_name: string
  platform: string
}

interface ReportListItem {
  id: string
  period_start: string
  period_end: string
  days_recent: number
  generated_at: string
  insights_generated_at: string | null
}

interface Props {
  accounts: AccountOption[]
  initialReports: ReportListItem[]
}

export function ReportsList({ accounts, initialReports }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [reports, setReports] = useState(initialReports)

  const selectAccount = async (accountId: string) => {
    setSelectedAccountId(accountId)
    const res = await fetch(`/api/analytics/reports?account_id=${accountId}`)
    setReports(res.ok ? await res.json() : [])
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => selectAccount(a.id)}
            className={`px-4 py-2 rounded text-sm font-medium ${
              selectedAccountId === a.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 border hover:bg-gray-50'
            }`}
          >
            {a.account_name}
          </button>
        ))}
      </div>

      {!reports.length ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          分析レポートがありません。account-post-analysisスキルを実行するとここに表示されます。
        </p>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">対象期間</th>
                <th className="text-left p-3 font-medium">直近N日間</th>
                <th className="text-left p-3 font-medium">生成日時</th>
                <th className="text-left p-3 font-medium">インサイト</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 whitespace-nowrap text-gray-700">
                    {new Date(r.period_start).toLocaleDateString('ja-JP')} 〜{' '}
                    {new Date(r.period_end).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-500">{r.days_recent}日間</td>
                  <td className="p-3 whitespace-nowrap text-gray-500">
                    {new Date(r.generated_at).toLocaleString('ja-JP')}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {r.insights_generated_at ? (
                      <Badge>生成済み</Badge>
                    ) : (
                      <Badge variant="secondary">未生成</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link href={`/analytics/reports/${r.id}`} className="text-blue-600 hover:underline">
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
