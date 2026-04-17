import { TwitterApi } from 'twitter-api-v2'

interface XPostOptions {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
  content: string
}

export async function postToX({ apiKey, apiSecret, accessToken, accessTokenSecret, content }: XPostOptions): Promise<string> {
  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  })

  const tweet = await client.v2.tweet(content)
  return tweet.data.id
}
