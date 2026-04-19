# SNS Automation MCP Server

Claude Code または Claude Desktop からSNS投稿を操作するMCPサーバーです。

## セットアップ

### 環境変数

以下の環境変数が必要です:

- `SUPABASE_URL`: Supabase プロジェクトURL
- `SUPABASE_SERVICE_ROLE_KEY`: サービスロールキー（Supabase ダッシュボード → Settings → API）

### Claude Code への設定

`~/.claude/claude_desktop_config.json`（またはClaude Desktopの設定）に追加:

```json
{
  "mcpServers": {
    "sns-automation": {
      "command": "node",
      "args": ["/path/to/sns-automation/packages/mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://fdmhkjiqsrzktfmbqlxg.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

## 利用可能なツール

| ツール | 説明 |
|--------|------|
| `list_accounts` | アカウント一覧を取得 |
| `create_post` | 下書き投稿を作成 |
| `list_posts` | 投稿一覧を取得（statusフィルタ可） |
| `update_post` | 投稿を更新 |
