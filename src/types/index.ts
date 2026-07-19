export type UserRole = 'admin' | 'operator'
export type Platform = 'x' | 'threads'
export type PostStatus = 'draft' | 'review' | 'ready' | 'published' | 'failed'
export type PostSource = 'ai' | 'manual'

export interface Company {
  id: string
  name: string
  created_at: string
}

export interface User {
  id: string
  company_id: string
  email: string
  role: UserRole
  created_at: string
}

export interface Account {
  id: string
  company_id: string
  platform: Platform
  account_name: string
  api_key: string | null
  api_secret: string | null
  access_token: string | null
  access_token_secret: string | null
  platform_user_id: string | null
  posting_times: string[]
  created_at: string
}

export interface PromptConfig {
  id: string
  account_id: string
  system_prompt: string
  reference_data: string
  updated_at: string
  updated_by: 'ai' | 'manual'
}

export interface Post {
  id: string
  account_id: string
  content: string
  image_url: string | null
  scheduled_date: string
  status: PostStatus
  source: PostSource
  error_message: string | null
  published_at: string | null
  platform_post_id: string | null
  created_at: string
}

export interface PromptConfigHistory {
  id: string
  account_id: string
  system_prompt: string
  reference_data: string
  changed_at: string
  changed_by: 'ai' | 'manual'
}

export interface AccountMetrics {
  id: string
  account_id: string
  fetched_at: string
  followers_count: number
}

export interface PostMetrics {
  id: string
  post_id: string
  fetched_at: string
  impressions: number
  likes: number
  reposts: number
  replies: number
}

export interface ScoredPost {
  id: string
  content: string
  scheduledDate: string
  publishedAt: string
  impressions: number
  likes: number
  replies: number
  reposts: number
  engagementRate: number
}

export interface WeeklyTrendRow {
  weekLabel: string
  postsCount: number
  impressions: number
  likes: number
  avgEngagementRate: number
  followersCount: number | null
}

export interface AnalysisSummary {
  totalPosts: number
  totalImpressions: number
  totalLikes: number
  totalReplies: number
  totalReposts: number
  avgImpressionsAll: number
  avgEngagementRateAll: number
  recentPostsCount: number
  recentImpressions: number
  recentLikes: number
  avgImpressionsRecent: number
  topByImpressions: ScoredPost[]
  topByEngagement: ScoredPost[]
  oldestPostDate: string
  latestPostDate: string
}

export interface AnalysisReportData {
  summary: AnalysisSummary
  weeklyTrend: WeeklyTrendRow[]
  daysRecent: number
  metricsFailedCount: number
  noPlatformIdCount: number
}

export interface AnalysisInsights {
  notable_posts: string
  engagement_review: string
  next_actions: string
}

export interface AccountAnalysisReport {
  id: string
  account_id: string
  period_start: string
  period_end: string
  days_recent: number
  report_data: AnalysisReportData
  insights: AnalysisInsights | null
  generated_at: string
  insights_generated_at: string | null
}

export interface StrategyExampleMetrics {
  impressions: number
  likes: number
  follows?: number
  replies?: number
  reposts?: number
}

export interface StrategyExample {
  format: string // A〜G
  title: string
  content: string
  metrics: StrategyExampleMetrics
  score: number
  rationale: string
}

export interface AccountContentStrategy {
  id: string
  account_id: string
  version: number
  examples: StrategyExample[]
  source_report_id: string | null
  is_active: boolean
  created_at: string
  activated_at: string | null
}

export interface PublishLog {
  id: string
  post_id: string
  account_id: string
  platform: Platform
  trigger: 'cron' | 'manual'
  result: 'success' | 'failed'
  failed_step: 'create' | 'publish' | null
  total_ms: number
  create_http_status: number | null
  container_id: string | null
  create_ms: number | null
  create_response: unknown | null
  publish_http_status: number | null
  platform_post_id: string | null
  publish_ms: number | null
  publish_response: unknown | null
  error_message: string | null
  created_at: string
}
