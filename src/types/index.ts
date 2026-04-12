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
  scheduled_date: string
  status: PostStatus
  source: PostSource
  error_message: string | null
  created_at: string
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
