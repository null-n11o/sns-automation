import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PostsTable } from '@/components/posts/PostsTable'

export default async function PostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_name, platform')
    .order('created_at')

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .order('scheduled_date')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">投稿管理</h1>
      {!accounts?.length ? (
        <p className="text-gray-500 text-sm">
          アカウントがありません。先に<Link href="/accounts" className="underline">アカウントを登録</Link>してください。
        </p>
      ) : (
        <PostsTable
          initialPosts={posts ?? []}
          accounts={accounts}
          isAdmin={profile?.role === 'admin'}
        />
      )}
    </div>
  )
}
