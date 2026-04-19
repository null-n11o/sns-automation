import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const client = new Anthropic()

interface ImprovedConfig {
  system_prompt: string
  reference_data: string
}

// 投稿数が少なく改善できない場合はnullを返す
export async function analyzeAndImprove(
  accountId: string,
  supabase: SupabaseClient
): Promise<ImprovedConfig | null> {
  // 過去30日のpublished投稿とメトリクスを取得
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: posts } = await supabase
    .from('posts')
    .select('id, content, post_metrics(impressions, likes, reposts, replies)')
    .eq('account_id', accountId)
    .eq('status', 'published')
    .gte('published_at', thirtyDaysAgo.toISOString())

  // メトリクスがある投稿が3件未満の場合はスキップ
  const postsWithMetrics = (posts ?? []).filter(
    (p: { post_metrics: unknown[] }) => p.post_metrics?.length > 0
  )
  if (postsWithMetrics.length < 3) return null

  // 分析用テキスト作成
  const postsText = postsWithMetrics
    .map((p: { content: string; post_metrics: Array<{ impressions: number; likes: number; reposts: number; replies: number }> }) => {
      const m = p.post_metrics[p.post_metrics.length - 1]
      return `投稿: ${p.content}\nインプレッション: ${m.impressions} / いいね: ${m.likes} / リポスト: ${m.reposts} / リプライ: ${m.replies}`
    })
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: 'あなたはSNSコンテンツ戦略アナリストです。投稿のパフォーマンスデータを分析し、今後の投稿改善のためのシステムプロンプトと参考データを生成してください。',
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `以下の投稿データを分析して、今後の投稿品質を高めるための改善案を提案してください。\n\n${postsText}\n\n以下のフォーマットで回答してください:\n---SYSTEM_PROMPT---\n（改善されたシステムプロンプト）\n---REFERENCE_DATA---\n（参考データ・成功した投稿のパターン）`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const systemMatch = text.match(/---SYSTEM_PROMPT---\n([\s\S]*?)---REFERENCE_DATA---/)
  const referenceMatch = text.match(/---REFERENCE_DATA---\n([\s\S]*)$/)

  if (!systemMatch || !referenceMatch) return null

  const improved: ImprovedConfig = {
    system_prompt: systemMatch[1].trim(),
    reference_data: referenceMatch[1].trim(),
  }

  // prompt_configs を upsert（account_idが同じなら更新）
  await supabase.from('prompt_configs').upsert({
    account_id: accountId,
    system_prompt: improved.system_prompt,
    reference_data: improved.reference_data,
    updated_at: new Date().toISOString(),
    updated_by: 'ai',
  }, { onConflict: 'account_id' })

  // 履歴を保存
  await supabase.from('prompt_config_history').insert({
    account_id: accountId,
    system_prompt: improved.system_prompt,
    reference_data: improved.reference_data,
    changed_by: 'ai',
  })

  return improved
}
