import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MetricsView } from './MetricsView'
import type { PostWithLatestMetrics } from '@/lib/analytics/latest-metrics'

const accounts = [
  { id: 'a1', account_name: 'Dober', platform: 'threads' },
  { id: 'a2', account_name: 'Kentaro Nakano', platform: 'threads' },
]

function post(id: string, impressions: number, likes: number): PostWithLatestMetrics {
  return {
    id,
    account_id: 'a1',
    content: `post ${id}`,
    scheduled_date: '2026-06-01',
    status: 'published',
    source: 'ai',
    error_message: null,
    published_at: '2026-06-01T00:00:00Z',
    platform_post_id: null,
    created_at: '2026-06-01T00:00:00Z',
    latest_metrics: {
      id: `m-${id}`,
      post_id: id,
      fetched_at: '2026-06-01T01:00:00Z',
      impressions,
      likes,
      reposts: 0,
      replies: 0,
    },
  }
}

describe('MetricsView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('初期表示は initialPosts からカードを算出する', () => {
    render(<MetricsView accounts={accounts} initialPosts={[post('p1', 100, 5), post('p2', 400, 15)]} />)
    // 総投稿数 2 / 総表示 500 / 総いいね 20
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('500')).toBeTruthy()
    expect(screen.getByText('20')).toBeTruthy()
  })

  it('印刷リンクは選択中アカウントの account_id を含む', () => {
    render(<MetricsView accounts={accounts} initialPosts={[]} />)
    const link = screen.getByText('レポートを印刷').closest('a')
    expect(link?.getAttribute('href')).toBe('/analytics/report?account_id=a1')
  })

  it('別アカウントのタブを押すと API を叩き posts を差し替える', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [post('p9', 999, 1)],
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MetricsView accounts={accounts} initialPosts={[post('p1', 100, 5)]} />)
    fireEvent.click(screen.getByText('Kentaro Nakano'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/analytics/metrics?account_id=a2')
    })
    // 差し替え後: 総表示回数カードが 999 に更新される
    await waitFor(() => {
      expect(screen.getByText('総表示回数').parentElement?.textContent).toContain('999')
    })
    // 印刷リンクも a2 に更新
    expect(screen.getByText('レポートを印刷').closest('a')?.getAttribute('href'))
      .toBe('/analytics/report?account_id=a2')
  })
})
