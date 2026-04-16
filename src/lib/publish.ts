import { decrypt } from '@/lib/crypto'
import { postToThreads } from '@/lib/threads-api'
import { postToX } from '@/lib/x-api'
import type { Platform } from '@/types'

interface PublishOptions {
  platform: Platform
  content: string
  access_token?: string | null
  access_token_secret?: string | null
  api_key?: string | null
  api_secret?: string | null
  platform_user_id?: string | null
}

export async function publishPost(options: PublishOptions): Promise<string> {
  const { platform, content } = options

  if (platform === 'threads') {
    if (!options.access_token || !options.platform_user_id) {
      throw new Error('Threads requires access_token and platform_user_id')
    }
    return postToThreads({
      accessToken: decrypt(options.access_token),
      userId: options.platform_user_id,
      content,
    })
  }

  if (platform === 'x') {
    if (!options.api_key || !options.api_secret || !options.access_token || !options.access_token_secret) {
      throw new Error('X requires api_key, api_secret, access_token, and access_token_secret')
    }
    return postToX({
      apiKey: decrypt(options.api_key),
      apiSecret: decrypt(options.api_secret),
      accessToken: decrypt(options.access_token),
      accessTokenSecret: decrypt(options.access_token_secret),
      content,
    })
  }

  throw new Error(`Unsupported platform: ${platform}`)
}
