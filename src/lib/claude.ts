import Anthropic from '@anthropic-ai/sdk'
import type { Platform } from '@/types'

const client = new Anthropic()

export async function generatePosts({
  systemPrompt,
  referenceData,
  platform,
  weekDates,
}: {
  systemPrompt: string
  referenceData: string
  platform: Platform
  weekDates: string[]
}): Promise<string[]> {
  const platformLabel = platform === 'threads' ? 'Threads' : 'X (Twitter)'
  const charLimit = platform === 'threads' ? 500 : 280

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: `${systemPrompt}\n\n参考データ:\n${referenceData}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${platformLabel}用の投稿を${weekDates.length}件生成してください。\n投稿予定日: ${weekDates.join(', ')}\n文字数制限: ${charLimit}文字以内\n\n各投稿を「---」のみの行で区切り、投稿本文のみを出力してください。番号や日付のプレフィックスは不要です。`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text.split(/\n---\n/).map(s => s.trim()).filter(Boolean).slice(0, weekDates.length)
}
