import { publishPost } from '@/lib/publish'
import { PublishError, type PublishMeta } from '@/lib/threads-api'
import type { Platform } from '@/types'

const SECRET_KEY_PATTERN = /access_token|api_key|api_secret|token/i

export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSecrets)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '***' : maskSecrets(val)
    }
    return out
  }
  return value
}

export interface PublishLogInsert {
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
}

interface BuildLogInput {
  post: { id: string; account_id: string }
  account: { platform: Platform }
  trigger: 'cron' | 'manual'
  result: 'success' | 'failed'
  platformPostId: string | null
  meta: PublishMeta
  errorMessage: string | null
  totalMs: number
}

export function buildPublishLogEntry(input: BuildLogInput): PublishLogInsert {
  const { post, account, trigger, result, platformPostId, meta, errorMessage, totalMs } = input
  return {
    post_id: post.id,
    account_id: post.account_id,
    platform: account.platform,
    trigger,
    result,
    failed_step: meta.failedStep,
    total_ms: totalMs,
    create_http_status: meta.create?.httpStatus ?? null,
    container_id: meta.containerId,
    create_ms: meta.create?.ms ?? null,
    create_response: meta.create ? maskSecrets(meta.create.response) : null,
    publish_http_status: meta.publish?.httpStatus ?? null,
    platform_post_id: platformPostId,
    publish_ms: meta.publish?.ms ?? null,
    publish_response: meta.publish ? maskSecrets(meta.publish.response) : null,
    error_message: errorMessage,
  }
}

const EMPTY_META: PublishMeta = { containerId: null, create: null, publish: null, failedStep: null }

type SupabaseLike = { from: (table: string) => { insert: (row: PublishLogInsert) => PromiseLike<{ error: unknown }> } }

interface PublishAndLogArgs {
  post: { id: string; account_id: string; content: string; image_url: string | null }
  account: {
    platform: Platform
    access_token: string | null
    access_token_secret: string | null
    api_key: string | null
    api_secret: string | null
    platform_user_id: string | null
  }
  trigger: 'cron' | 'manual'
}

export async function publishAndLog(
  supabase: SupabaseLike,
  { post, account, trigger }: PublishAndLogArgs,
): Promise<{ platformPostId: string | null; error: string | null }> {
  const start = Date.now()
  let result: 'success' | 'failed' = 'success'
  let platformPostId: string | null = null
  let meta: PublishMeta = EMPTY_META
  let errorMessage: string | null = null

  try {
    const r = await publishPost({
      platform: account.platform,
      content: post.content,
      image_url: post.image_url,
      access_token: account.access_token,
      access_token_secret: account.access_token_secret,
      api_key: account.api_key,
      api_secret: account.api_secret,
      platform_user_id: account.platform_user_id,
    })
    platformPostId = r.platformPostId
    meta = r.meta
  } catch (err) {
    result = 'failed'
    errorMessage = err instanceof Error ? err.message : 'Unknown error'
    if (err instanceof PublishError) meta = err.meta
  }

  const entry = buildPublishLogEntry({
    post, account, trigger, result, platformPostId, meta, errorMessage, totalMs: Date.now() - start,
  })
  try {
    await supabase.from('publish_logs').insert(entry)
  } catch {
    // ログ書き込み失敗はpublish結果に影響させない
  }

  return { platformPostId, error: errorMessage }
}
