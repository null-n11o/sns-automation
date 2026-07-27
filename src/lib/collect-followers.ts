import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/crypto'
import { fetchThreadsFollowersCount } from '@/lib/threads-followers'

type ThreadsAccount = {
  id: string
  access_token: string
  platform_user_id: string
}

// Captures Threads follower counts, recording only values that were retrieved successfully.
export async function collectThreadsFollowerSnapshots(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, access_token, platform_user_id')
    .eq('platform', 'threads')
    .not('access_token', 'is', null)
    .not('platform_user_id', 'is', null)

  if (!accounts?.length) return 0

  const results = await Promise.allSettled(
    (accounts as ThreadsAccount[]).map(async account => {
      const followers = await fetchThreadsFollowersCount({
        userId: account.platform_user_id,
        accessToken: decrypt(account.access_token),
      })

      if (followers === null) return false

      const { error } = await supabase
        .from('account_metrics')
        .insert([{ account_id: account.id, followers_count: followers }])

      if (error) {
        console.error(`account_metrics insert failed for ${account.id}:`, error.message)
        return false
      }

      return true
    }),
  )

  return results.filter(result => result.status === 'fulfilled' && result.value).length
}
