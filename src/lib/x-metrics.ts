import { TwitterApi } from 'twitter-api-v2'

interface XPostMetricsOptions {
  tweetId: string
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
}

export interface XMetrics {
  impressions: number
  likes: number
  reposts: number
  replies: number
}

export async function fetchXPostMetrics({
  tweetId,
  apiKey,
  apiSecret,
  accessToken,
  accessTokenSecret,
}: XPostMetricsOptions): Promise<XMetrics> {
  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  })

  try {
    const tweet = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['public_metrics'],
    })
    const metrics = tweet.data.public_metrics
    return {
      impressions: 0,
      likes: metrics?.like_count ?? 0,
      reposts: metrics?.retweet_count ?? 0,
      replies: metrics?.reply_count ?? 0,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`X API error: ${message}`)
  }
}
