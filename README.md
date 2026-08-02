# VibeSharing MCP Server

**The missing link between your AI coding assistant and your team.**

Build prototypes with Claude Code, Cursor, or any AI tool — then instantly share them with your team for feedback. No context switching. No copy-pasting URLs. Just ship and collaborate.

## Quick Start

### 1. Get Your Token

Sign up at [vibesharing.app](https://vibesharing.app), then go to [Account Settings](https://vibesharing.app/dashboard/account) to:
- **Copy your deploy token** — starts with `vs_`
- **Connect your GitHub account** (optional) — enables Push to Deploy

### 2. Connect Your Editor

**Cursor / Windsurf / Claude Desktop** (recommended — always up to date):

```json
{
  "mcpServers": {
    "vibesharing": {
      "url": "https://vibesharing.app/api/mcp",
      "headers": {
        "Authorization": "Bearer vs_YOUR_TOKEN"
      }
    }
  }
}
```

Add to `.cursor/mcp.json` (Cursor) or `~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop).

**Claude Code:**

```bash
claude mcp add vibesharing -s user \
  -e VIBESHARING_TOKEN=vs_YOUR_TOKEN \
  -- npx -y @vibesharingapp/mcp-server@latest
```

Then restart your editor. That's it.

### 3. Start Sharing

```
You: "Share this page on VibeSharing"
You: "Deploy this to the Product Redesign collection"
You: "What feedback came in on the dashboard?"
```

## What You Can Do

### Share a static HTML page instantly
```
"Share this HTML file on VibeSharing"
```
One command. No Vercel, no GitHub, no React wrapper. Your HTML page goes live with a feedback widget built in. CSS, SVGs, and images are auto-bundled into a self-contained file.

### Deploy full projects
```
"Deploy this to VibeSharing in the Hero Use Cases collection as erg-v3-teams"
```
Claude confirms the collection, names the deployment, and handles everything — GitHub repo, Vercel deploy, team registration — in one conversation.

### Check feedback before you start working
```
"What feedback did I get on the checkout flow?"
```
Open feedback is surfaced automatically at the start of each session. You can also triage, respond, and close feedback directly from your editor.

### Keep context alive across sessions
```
"Sync my CLAUDE.md to VibeSharing"
```
Your project context persists on VibeSharing, so any team member (or AI session) can pick up where you left off. CLAUDE.md and AGENTS.md auto-sync on deploy.

### Troubleshoot issues
```
"Run a VibeSharing health check"
```
The `diagnose` tool checks your token, GitHub connection, deploy locks, and recent errors — and auto-fixes what it can. If it can't fix something, `send_support_request` sends a detailed report to the admin.

## Available Tools (21)

| Tool | Description |
|------|-------------|
| **Deploy & Share** | |
| `share_html` | Share static HTML instantly — no Vercel, no GitHub. Auto-bundles CSS/SVGs/images. |
| `deploy_files` | Deploy multi-file projects to GitHub + Vercel with named deployments |
| `deploy_prototype` | Deploy a single code file directly |
| `import_repo` | Import a GitHub repo into VibeSharing |
| `register_prototype` | Register an already-deployed prototype by URL |
| **Organize** | |
| `resolve_target` | Fuzzy-match collections and projects — confirms where to deploy |
| `create_collection` | Create a new collection |
| `list_prototypes` | List/search all prototypes in your org |
| `list_collections` | List/search all collections |
| **Feedback** | |
| `get_feedback` | Get feedback and comments for a prototype |
| `triage_feedback` | Update status, priority, or assignee on feedback |
| `generate_feedback_topics` | Create guided feedback questions for reviewers |
| `close_feedback_loop` | Resolve feedback with a note back to the stakeholder |
| **Context** | |
| `sync_context` | Push CLAUDE.md, AGENTS.md, or project notes |
| `upload_source` | Upload source code to an existing prototype |
| `add_context_link` | Attach reference links (Figma, PRDs, docs) |
| `list_context_links` | List reference links on a collection or project |
| `remove_context_link` | Remove a reference link |
| **Diagnostics** | |
| `diagnose` | Health check — token, GitHub, deploy locks, recent errors |
| `send_support_request` | Send a support request to the admin with context |
| `verify_token` | Check that your deploy token is valid |

## Remote vs Local

**Remote** (recommended): Connect to `vibesharing.app/api/mcp`. Always up to date, no installs, no cache issues. Works everywhere.

**Local** (advanced): Run via `npx`. Supports reading files from disk with `file_path` parameter. Requires Node.js 18+. May need `npx clear-npx-cache` after updates.

## Environment Variables (local only)

| Variable | Required | Description |
|----------|----------|-------------|
| `VIBESHARING_TOKEN` | Yes | Your deploy token from VibeSharing |
| `VIBESHARING_URL` | No | Custom API URL (defaults to https://vibesharing.app) |

## Learn More

- [VibeSharing](https://vibesharing.app) — Sign up free
- [Setup Guide](https://vibesharing.app/get-started/claude-code-setup) — Step-by-step for all editors
- [Troubleshooting](https://vibesharing.app/DEPLOY-TROUBLESHOOTING.md) — Common issues and fixes
- [GitHub](https://github.com/erova/vibesharing-mcp) — Source code

---

**Stop building in isolation. Start shipping with your team.**
