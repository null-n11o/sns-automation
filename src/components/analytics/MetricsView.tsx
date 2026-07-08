'use client'

import { useState } from 'react'
import { MetricsTable } from './MetricsTable'
import type { PostWithLatestMetrics } from '@/lib/analytics/latest-metrics'

interface AccountOption {
  id: string
  account_name: string
  platform: string
}

interface Props {
  accounts: AccountOption[]
  initialPosts: PostWithLatestMetrics[]
}

export function MetricsView({ accounts, initialPosts }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [posts, setPosts] = useState(initialPosts)

  const selectAccount = async (accountId: string) => {
    setSelectedAccountId(accountId)
    const res = await fetch(`/api/analytics/metrics?account_id=${accountId}`)
    setPosts(res.ok ? await res.json() : [])
  }

  const totalImpressions = posts.reduce((sum, p) => sum + (p.latest_metrics?.impressions ?? 0), 0)
  const totalLikes = posts.reduce((sum, p) => sum + (p.latest_metrics?.likes ?? 0), 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-4">
        <div className="flex gap-2 flex-wrap">
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
        <a
          href={`/analytics/report?account_id=${selectedAccountId}`}
          target="_blank"
          className="text-sm text-blue-600 hover:underline whitespace-nowrap"
        >
          レポートを印刷
        </a>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded shadow p-4">
          <p className="text-xs text-gray-500 mb-1">総投稿数</p>
          <p className="text-2xl font-bold">{posts.length}</p>
        </div>
        <div className="bg-white rounded shadow p-4">
          <p className="text-xs text-gray-500 mb-1">総表示回数</p>
          <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded shadow p-4">
          <p className="text-xs text-gray-500 mb-1">総いいね数</p>
          <p className="text-2xl font-bold">{totalLikes.toLocaleString()}</p>
        </div>
      </div>

      <MetricsTable posts={posts} />
    </div>
  )
}
