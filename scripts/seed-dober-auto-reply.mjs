import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(resolve(__dirname, '..') + '/')
const { createClient } = require('@supabase/supabase-js')

const cfg = JSON.parse(readFileSync(resolve(__dirname, '../.mcp.json'), 'utf8'))
const env = cfg.mcpServers['sns-automation'].env
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const AUTO_REPLY_CONFIG = {
  enabled: true,
  threshold: 500,
  window_minutes: 60,
  templates: [
    '公式LINE登録者に以下無料で配布しておりますのでぜひ。「無料特典を受け取る」とメッセージお願いいたします。\nnote記事『人生をイージーモードに変える「規律」の教科書：一流の男たちが実践するメンタルと習慣の作り方』\nhttps://lin.ee/NnXNfzd',
  ],
}

const { data, error } = await supabase
  .from('accounts')
  .update({ auto_reply_config: AUTO_REPLY_CONFIG })
  .eq('account_name', 'Dober/Threads')
  .select('id, account_name, auto_reply_config')

if (error) {
  console.error('update failed:', error.message)
  process.exit(1)
}
console.log('updated:', JSON.stringify(data, null, 2))
