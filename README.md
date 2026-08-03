# VibeSharing MCP Server

**The missing link between your AI coding assistant and your team.**

> **Note for anyone reading this on GitHub:** [erova/vibesharing-mcp](https://github.com/erova/vibesharing-mcp)
> is a read-only mirror, published automatically on each release. Pull requests against it will be
> overwritten by the next sync. To report a bug or request a change, please
> [open an issue](https://github.com/erova/vibesharing-mcp/issues) or write to
> [hello@vibesharing.app](mailto:hello@vibesharing.app).

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
"Deploy this to VibeSharing in the Hero Use Cases collection as checkout-v3"
```
Claude confirms the collection, names the deployment, and handles everything — GitHub repo, deploy, team registration — in one conversation. Your first three prototypes are hosted on us; connect your own Vercel or Netlify account and the limit disappears.

### Match your design system from the first prompt
```
"Build a settings page using our design system"
```
`quick_prototype` picks the right template from your org, hands the AI its CSS variables and written design instructions, and deploys — so the prototype is on-brand as it's generated, instead of built generic and retrofitted. Browse what's available with `list_templates`.

### Go through feedback one person at a time
```
"What feedback did I get on the checkout flow?"
"Walk me through Jordan's comments"
```
On the local server, open feedback across your recent prototypes is summarized on the first VibeSharing tool call of a session — you find out something is waiting without asking. (Not yet on the remote endpoint.)

Asked without a name, `get_feedback` groups everything by author — "9 items from 4 people, 6 open" — instead of returning a wall of text. Asked with a name, it walks that person's comments one at a time, each carrying the page it was left on, the pinned position, the question it answered, the replies underneath, and **the screenshot itself as an image** — so you see what they saw rather than opening a link. You decide per comment whether to build it, skip it, or discuss — and `close_feedback_loop` tells the person what you did.

### Keep every version, and branch safely
```
"Show me the version history"
"Fork this so I can try a dark variant"
"Roll back to v3"
```
Every deploy is a numbered version with its own immutable URL. `fork_prototype` copies one to a separate URL so you can explore without touching the original, and `rollback_deploy` restores any earlier version — for git-based and static prototypes alike.

### Put it in front of customers
```
"Set up a study comparing these three variants"
```
`create_campaign` bundles several prototypes behind one gated portal with your own questions — star ratings, multiple choice, free text — and supports blind randomized A/B/C ordering so a name like "v2" can't skew a preference test. It lands as a draft; opening it and inviting the cohort stays a deliberate step in the dashboard.

### Catch build failures before deploying
```
"Check this will build before we ship it"
```
`validate_project` looks for the things that actually break deploys — a missing framework dependency, no build script, conflicting configs — and returns fixes rather than a stack trace after the fact.

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

## Available Tools (31)

| Tool | Description |
|------|-------------|
| **Deploy & Share** | |
| `quick_prototype` | Idea to live URL in one step — picks a design system template, generates on-brand code, deploys |
| `share_html` | Share static HTML instantly — no hosting account, no GitHub. Auto-bundles CSS/SVGs/images. |
| `deploy_files` | Deploy multi-file projects to GitHub + your hosting provider with named deployments |
| `deploy_prototype` | Deploy a single code file directly |
| `import_repo` | Import a GitHub repo into VibeSharing |
| `register_prototype` | Register an already-deployed prototype by URL |
| `validate_project` | Check a project will build before deploying — missing frameworks, build scripts, conflicting configs |
| **Design systems** | |
| `list_templates` | List your org's design system templates |
| `get_template` | Get a template's CSS variables, starter page, and AI design instructions — call before writing code |
| **Organize** | |
| `resolve_target` | Fuzzy-match collections and projects — confirms where to deploy |
| `create_collection` | Create a new collection |
| `list_prototypes` | List/search all prototypes in your org |
| `list_collections` | List/search all collections |
| `update_prototype` | Rename a prototype or update its description and URL, in place |
| `delete_prototype` | Delete a prototype and its history — irreversible, creator or org admin only |
| **Versions & variants** | |
| `list_versions` | Version history — version numbers, file counts, commit info, what can be rolled back |
| `fork_prototype` | Copy a prototype to its own URL to explore a variant; the original is untouched |
| `rollback_deploy` | Restore a previous version, for git-based and static prototypes |
| **Research** | |
| `create_campaign` | Set up a customer study — several prototypes, your questions, optional blind A/B/C ordering |
| **Feedback** | |
| `get_feedback` | Feedback grouped by author, or one person's comments as a queue with full context |
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
