import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PostsTable } from './PostsTable'
import type { Post } from '@/types'

// Mock subcomponents/dialog to avoid Radix UI environment issues in happy-dom if any
vi.mock('./CreatePostModal', () => ({
  CreatePostModal: () => <div data-testid="create-post-modal" />
}))

describe('PostsTable Pagination', () => {
  const mockAccounts = [
    { id: 'acc-1', account_name: 'Account One', platform: 'x' },
    { id: 'acc-2', account_name: 'Account Two', platform: 'threads' }
  ]

  const createMockPosts = (accountId: string, count: number): Post[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `post-${accountId}-${i}`,
      account_id: accountId,
      content: `Post ${i + 1} content for ${accountId}`,
      image_url: null,
      scheduled_date: new Date(Date.now() + i * 60000).toISOString(),
      status: 'draft',
      source: 'manual',
      error_message: null,
      published_at: null,
      platform_post_id: null,
      created_at: new Date().toISOString()
    }))
  }

  const expectRangeText = (expectedText: string) => {
    const found = screen.queryAllByText((_content, element) => {
      return element?.tagName.toLowerCase() === 'p' && element?.textContent?.replace(/\s+/g, ' ').trim() === expectedText
    })
    expect(found).toHaveLength(1)
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    ))
  })

  it('50件以下の時はページネーションコントロールを表示しない', () => {
    const posts = createMockPosts('acc-1', 45)
    render(<PostsTable initialPosts={posts} accounts={mockAccounts} />)

    // 表示されている投稿数を確認 (45件すべて表示されている)
    const postElements = screen.getAllByText(/content for acc-1/)
    expect(postElements).toHaveLength(45)

    // ページネーションコントロールのテキストが存在しないことを確認
    const found = screen.queryByText((_content, element) => {
      return element?.tagName.toLowerCase() === 'p' && (element?.textContent?.includes('件中') ?? false)
    })
    expect(found).not.toBeInTheDocument()
  })

  it('50件より多い時はページネーションコントロールを表示し、正しく切り替わる', () => {
    // 65件の投稿を作成
    const posts = createMockPosts('acc-1', 65)
    render(<PostsTable initialPosts={posts} accounts={mockAccounts} />)

    // 1ページ目の表示範囲確認
    expectRangeText('全 65 件中 1 〜 50 件を表示')
    
    // 1ページ目の投稿数を確認 (50件)
    expect(screen.getAllByText(/content for acc-1/)).toHaveLength(50)

    // 「次へ」ボタンをクリックして2ページ目に移動
    const nextButton = screen.getByText('次へ')
    fireEvent.click(nextButton)

    // 2ページ目の表示範囲確認
    expectRangeText('全 65 件中 51 〜 65 件を表示')
    
    // 2ページ目の投稿数を確認 (15件)
    expect(screen.getAllByText(/content for acc-1/)).toHaveLength(15)

    // 「前へ」ボタンをクリックして1ページ目に戻る
    const prevButton = screen.getByText('前へ')
    fireEvent.click(prevButton)
    expectRangeText('全 65 件中 1 〜 50 件を表示')
  })

  it('アカウントを切り替えた時に現在のページが1にリセットされる', () => {
    const postsAcc1 = createMockPosts('acc-1', 60)
    const postsAcc2 = createMockPosts('acc-2', 5)
    const allPosts = [...postsAcc1, ...postsAcc2]

    render(<PostsTable initialPosts={allPosts} accounts={mockAccounts} />)

    // 最初は Account One が選択されており、1ページ目が表示されている
    expectRangeText('全 60 件中 1 〜 50 件を表示')

    // 2ページ目に移動
    const nextButton = screen.getByText('次へ')
    fireEvent.click(nextButton)
    expectRangeText('全 60 件中 51 〜 60 件を表示')

    // Account Two に切り替える
    const acc2Tab = screen.getByText('Account Two')
    fireEvent.click(acc2Tab)

    // ページネーションコントロールは非表示になり、Account Two の5件が表示される
    const foundRange = screen.queryByText((_content, element) => {
      return element?.tagName.toLowerCase() === 'p' && (element?.textContent?.includes('件中') ?? false)
    })
    expect(foundRange).not.toBeInTheDocument()
    expect(screen.getAllByText(/content for acc-2/)).toHaveLength(5)

    // 再度 Account One に戻る
    const acc1Tab = screen.getByText('Account One')
    fireEvent.click(acc1Tab)

    // ページネーションが1ページ目にリセットされていることを確認
    expectRangeText('全 60 件中 1 〜 50 件を表示')
  })
})

describe('PostsTable sorting and filters', () => {
  const mockAccounts = [
    { id: 'acc-1', account_name: 'Account One', platform: 'x' },
  ]

  const createPost = (overrides: Partial<Post> & Pick<Post, 'id' | 'content' | 'scheduled_date'>): Post => ({
    account_id: 'acc-1',
    image_url: null,
    status: 'draft',
    source: 'manual',
    error_message: null,
    published_at: null,
    platform_post_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    ))
  })

  it('初期表示は予約日時の最新順で投稿を表示する', () => {
    render(<PostsTable
      initialPosts={[
        createPost({ id: 'old', content: '古い投稿', scheduled_date: '2026-07-01T10:00:00.000Z' }),
        createPost({ id: 'new', content: '新しい投稿', scheduled_date: '2026-07-03T10:00:00.000Z' }),
        createPost({ id: 'middle', content: '真ん中の投稿', scheduled_date: '2026-07-02T10:00:00.000Z' }),
      ]}
      accounts={mockAccounts}
    />)

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('新しい投稿'),
      expect.stringContaining('真ん中の投稿'),
      expect.stringContaining('古い投稿'),
    ])
  })

  it('ステータス、ソース、本文キーワードで投稿を絞り込める', () => {
    render(<PostsTable
      initialPosts={[
        createPost({ id: 'match', content: 'AIで作った承認待ち投稿', scheduled_date: '2026-07-03T10:00:00.000Z', status: 'review', source: 'ai' }),
        createPost({ id: 'status-miss', content: 'AIで作った下書き投稿', scheduled_date: '2026-07-02T10:00:00.000Z', status: 'draft', source: 'ai' }),
        createPost({ id: 'source-miss', content: '手動の承認待ち投稿', scheduled_date: '2026-07-01T10:00:00.000Z', status: 'review', source: 'manual' }),
      ]}
      accounts={mockAccounts}
    />)

    fireEvent.change(screen.getByLabelText('ステータス'), { target: { value: 'review' } })
    fireEvent.change(screen.getByLabelText('ソース'), { target: { value: 'ai' } })
    fireEvent.change(screen.getByLabelText('本文検索'), { target: { value: '承認待ち' } })

    expect(screen.getByText('AIで作った承認待ち投稿')).toBeInTheDocument()
    expect(screen.queryByText('AIで作った下書き投稿')).not.toBeInTheDocument()
    expect(screen.queryByText('手動の承認待ち投稿')).not.toBeInTheDocument()
    expect(screen.getByText('1 件')).toBeInTheDocument()
  })

  it('フィルタ変更時にページを1ページ目へ戻す', () => {
    const posts = Array.from({ length: 60 }, (_, i) => createPost({
      id: `post-${i}`,
      content: `投稿 ${i + 1}`,
      scheduled_date: new Date(Date.UTC(2026, 6, 1, 0, i)).toISOString(),
      status: i < 55 ? 'draft' : 'review',
    }))

    render(<PostsTable initialPosts={posts} accounts={mockAccounts} />)

    fireEvent.click(screen.getByText('次へ'))
    expect(screen.getByText('投稿 10')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('ステータス'), { target: { value: 'review' } })

    expect(screen.queryByText((_content, element) => {
      return element?.tagName.toLowerCase() === 'p' && (element?.textContent?.includes('件中') ?? false)
    })).not.toBeInTheDocument()
    expect(screen.getAllByText(/投稿 5[6-9]|投稿 60/)).toHaveLength(5)
  })
})
