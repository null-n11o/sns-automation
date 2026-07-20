import { decrypt } from '@/lib/crypto'
import { postToThreads, type PublishMeta } from '@/lib/threads-api'
import { postToX } from '@/lib/x-api'
import type { Platform } from '@/types'

interface PublishOptions {
  platform: Platform
  content: string
  image_url?: string | null
  access_token?: string | null
  access_token_secret?: string | null
  api_key?: string | null
  api_secret?: string | null
  platform_user_id?: string | null
}

const EMPTY_META: PublishMeta = { containerId: null, create: null, status: null, publish: null, failedStep: null }

export async function publishPost(
  options: PublishOptions,
): Promise<{ platformPostId: string; meta: PublishMeta }> {
  const { platform, content, image_url } = options

  if (platform === 'threads') {
    if (!options.access_token || !options.platform_user_id) {
      throw new Error('Threads requires access_token and platform_user_id')
    }
    return postToThreads({
      accessToken: decrypt(options.access_token),
      userId: options.platform_user_id,
      content,
      imageUrl: image_url,
    })
  }

  if (platform === 'x') {
    if (image_url) {
      throw new Error('Image posting is currently supported only for Threads')
    }
    if (!options.api_key || !options.api_secret || !options.access_token || !options.access_token_secret) {
      throw new Error('X requires api_key, api_secret, access_token, and access_token_secret')
    }
    const platformPostId = await postToX({
      apiKey: decrypt(options.api_key),
      apiSecret: decrypt(options.api_secret),
      accessToken: decrypt(options.access_token),
      accessTokenSecret: decrypt(options.access_token_secret),
      content,
    })
    return { platformPostId, meta: { ...EMPTY_META } }
  }

  throw new Error(`Unsupported platform: ${platform}`)
}
