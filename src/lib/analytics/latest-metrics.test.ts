import { describe, it, expect } from 'vitest'
import { withLatestMetrics } from './latest-metrics'

describe('withLatestMetrics', () => {
  it('各投稿で fetched_at が最新のメトリクスだけを残す', () => {
    const posts = [
      {
        id: 'p1',
        post_metrics: [
          { id: 'm1', post_id: 'p1', fetched_at: '2026-06-01T00:00:00Z', impressions: 100, likes: 1, reposts: 0, replies: 0 },
          { id: 'm2', post_id: 'p1', fetched_at: '2026-06-05T00:00:00Z', impressions: 500, likes: 9, reposts: 2, replies: 1 },
          { id: 'm3', post_id: 'p1', fetched_at: '2026-06-03T00:00:00Z', impressions: 300, likes: 4, reposts: 1, replies: 0 },
        ],
      },
    ]
    const result = withLatestMetrics(posts)
    expect(result[0].latest_metrics?.impressions).toBe(500)
  })

  it('メトリクスが無い投稿は latest_metrics を null にする', () => {
    const result = withLatestMetrics([{ id: 'p1', post_metrics: [] }])
    expect(result[0].latest_metrics).toBeNull()
  })

  it('元の post_metrics 配列を破壊的に並べ替えない', () => {
    const metrics = [
      { id: 'm1', post_id: 'p1', fetched_at: '2026-06-01T00:00:00Z', impressions: 100, likes: 1, reposts: 0, replies: 0 },
      { id: 'm2', post_id: 'p1', fetched_at: '2026-06-05T00:00:00Z', impressions: 500, likes: 9, reposts: 2, replies: 1 },
    ]
    const posts = [{ id: 'p1', post_metrics: metrics }]
    withLatestMetrics(posts)
    expect(metrics[0].fetched_at).toBe('2026-06-01T00:00:00Z')
  })

  it('id など post_metrics 以外のフィールドを保持する', () => {
    const result = withLatestMetrics([
      { id: 'p1', content: 'hello', post_metrics: [] },
    ])
    expect(result[0].id).toBe('p1')
    expect(result[0].content).toBe('hello')
  })
})
