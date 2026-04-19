import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(supabaseUrl, supabaseKey)

const server = new Server(
  { name: 'sns-automation-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_accounts',
      description: '利用可能なSNSアカウントの一覧を返す',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'create_post',
      description: '投稿を下書きとして保存する',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'アカウントID' },
          content: { type: 'string', description: '投稿本文' },
          scheduled_date: { type: 'string', description: '投稿予定日 (YYYY-MM-DD)' },
        },
        required: ['account_id', 'content', 'scheduled_date'],
      },
    },
    {
      name: 'list_posts',
      description: 'アカウントの投稿一覧を返す',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'アカウントID' },
          status: {
            type: 'string',
            enum: ['draft', 'review', 'ready', 'published', 'failed'],
            description: 'フィルタするステータス（省略時は全件）',
          },
        },
        required: ['account_id'],
      },
    },
    {
      name: 'update_post',
      description: '投稿の内容・日時・ステータスを更新する',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '投稿ID' },
          content: { type: 'string', description: '新しい本文（省略可）' },
          scheduled_date: { type: 'string', description: '新しい投稿予定日 YYYY-MM-DD（省略可）' },
          status: {
            type: 'string',
            enum: ['draft', 'review', 'ready'],
            description: '新しいステータス（省略可）',
          },
        },
        required: ['id'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'list_accounts') {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, account_name, platform')
      .order('created_at')

    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  if (name === 'create_post') {
    const { account_id, content, scheduled_date } = args as {
      account_id: string; content: string; scheduled_date: string
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({ account_id, content, scheduled_date, status: 'draft', source: 'ai' })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  if (name === 'list_posts') {
    const { account_id, status } = args as { account_id: string; status?: string }
    let query = supabase
      .from('posts')
      .select('id, content, scheduled_date, status, source, created_at')
      .eq('account_id', account_id)
      .order('scheduled_date')

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  if (name === 'update_post') {
    const { id, ...updates } = args as {
      id: string; content?: string; scheduled_date?: string; status?: string
    }

    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  throw new Error(`Unknown tool: ${name}`)
})

const transport = new StdioServerTransport()
await server.connect(transport)
