import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { decrypt } from '../../../../src/lib/crypto'
import { fetchThreadsPostMetrics } from '../../../../src/lib/threads-metrics'
import { fetchXPostMetrics } from '../../../../src/lib/x-metrics'
import {
  parseArgs,
  slugify,
  aggregate,
  buildWeeklyTrend,
  generateReport,
  formatReportFilename,
  type MetricsPost,
  type FollowerSnapshot,
} from './analyze-utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../../..')

const DAY_MS = 24 * 60 * 60 * 1000
const METRICS_FETCH_INTERVAL_MS = 500

async function main() {
  const envPath = path.join(REPO_ROOT, '.env.local')
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }

  const { accountQuery, days } = parseArgs(process.argv.slice(2))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. アカウント特定
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, account_name, platform, api_key, api_secret, access_token, access_token_secret')
    .ilike('account_name', `%${accountQuery}%`)

  if (accountsError) throw new Error(`アカウント検索エラー: ${accountsError.message}`)
  if (!accounts || accounts.length === 0) {
    console.error(`アカウントが見つかりません: "${accountQuery}"`)
    process.exit(1)
  }
  if (accounts.length > 1) {
    console.error(`複数のアカウントが見つかりました: ${accounts.map(a => a.account_name).join(', ')}`)
    process.exit(1)
  }
  const account = accounts[0]

  // 2. 投稿一覧の取得（直近30日・公開済み）
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, content, scheduled_date, published_at, platform_post_id')
    .eq('account_id', account.id)
    .eq('status', 'published')
    .gte('published_at', since)

  if (postsError) throw new Error(`投稿取得エラー: ${postsError.message}`)

  const allPosts = posts ?? []
  const withPlatformId = allPosts.filter(p => p.platform_post_id)
  const noPlatformIdCount = allPosts.length - withPlatformId.length

  // 3. ライブメトリクス取得
  const metricsPosts: MetricsPost[] = []
  let metricsFailedCount = 0

  for (const post of withPlatformId) {
    try {
      const metrics =
        account.platform === 'threads'
          ? await fetchThreadsPostMetrics({
              mediaId: post.platform_post_id as string,
              accessToken: decrypt(account.access_token as string),
            })
          : await fetchXPostMetrics({
              tweetId: post.platform_post_id as string,
              apiKey: decrypt(account.api_key as string),
              apiSecret: decrypt(account.api_secret as string),
              accessToken: decrypt(account.access_token as string),
              accessTokenSecret: decrypt(account.access_token_secret as string),
            })

      metricsPosts.push({
        id: post.id,
        content: post.content,
        scheduledDate: post.scheduled_date,
        publishedAt: post.published_at as string,
        impressions: metrics.impressions,
        likes: metrics.likes,
        replies: metrics.replies,
        reposts: metrics.reposts,
      })
    } catch (err) {
      metricsFailedCount++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`メトリクス取得失敗 (post ${post.id}): ${message}`)
    }

    await new Promise(resolve => setTimeout(resolve, METRICS_FETCH_INTERVAL_MS))
  }

  // 4. フォロワー数トレンド
  const { data: accountMetrics, error: accountMetricsError } = await supabase
    .from('account_metrics')
    .select('fetched_at, followers_count')
    .eq('account_id', account.id)
    .order('fetched_at', { ascending: false })

  if (accountMetricsError) throw new Error(`フォロワー数取得エラー: ${accountMetricsError.message}`)

  const followerHistory: FollowerSnapshot[] = (accountMetrics ?? []).map(m => ({
    fetchedAt: m.fetched_at,
    followersCount: m.followers_count,
  }))

  // 5. 集計
  const now = new Date()
  const summary = aggregate(metricsPosts, days, now)
  const weeklyTrend = buildWeeklyTrend(metricsPosts, followerHistory, now)

  // 6. レポート生成・保存
  const report = generateReport({
    accountName: account.account_name,
    summary,
    weeklyTrend,
    daysRecent: days,
    metricsFailedCount,
    noPlatformIdCount,
    generatedAt: now,
  })

  const reportsDir = path.join(__dirname, '..', 'reports', slugify(account.account_name))
  fs.mkdirSync(reportsDir, { recursive: true })
  const filePath = path.join(reportsDir, formatReportFilename(now))
  fs.writeFileSync(filePath, report, 'utf-8')

  console.log(`✅ レポートを保存しました: ${filePath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
