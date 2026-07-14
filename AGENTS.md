<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Rules

## Git Workflow
- タスク開始時は必ず新しいブランチを作成すること。
- ブランチ名は `feat/task-name`, `fix/task-name`, `docs/task-name` のようにすること。
- タスク完了後は、原則として `git commit`, `git push`, Pull Request 作成まで行うこと。
- 既存の未コミット変更がある場合は、作業前に内容を確認し、ユーザーの変更を巻き戻さないこと。

## Development Commands
- 開発サーバー: `npm run dev`
- 本番ビルド: `npm run build`
- Lint: `npm run lint`
- Unit/integration tests: `npm run test:run`
- E2E tests: `npm run test:e2e`

## Codex Setup
- このリポジトリは Codex の trusted project として扱うこと。
- MCP を使う場合は `scripts/codex-mcp-nexauto.mjs` を起動コマンドにすること。
- MCP の秘密値は `.env.local` から読む。`SUPABASE_SERVICE_ROLE_KEY` などの秘密値を `AGENTS.md`, README, Codex config, コミット対象ファイルへ直接書かないこと。

## Superpowers Artifacts
- 既存の設計・計画は `docs/superpowers/` を参照すること。
- 進行中タスクのブリーフやレポートは `.superpowers/sdd/` を参照すること。
- Superpowers 由来の計画を実装する場合は、該当する spec/plan/brief を先に読んでから変更すること。
