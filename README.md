# VibeSharing MCP Server

**The missing link between your AI coding assistant and your team.**

Build prototypes with Claude Code, Cursor, or any AI tool—then instantly share them with your team for feedback. No context switching. No copy-pasting URLs. Just ship and collaborate.

## The Problem

You're building fast with AI. Prototypes are flying. But then:

- You deploy to Vercel and... forget to tell anyone
- Your teammate asks "where's that dashboard thing you made?"
- Feedback lives in Slack threads that disappear
- Next AI session? All that context is gone

**Your AI helps you build. But it can't help you collaborate.**

Until now.

## The Solution

VibeSharing's MCP server connects Claude Code directly to your team's prototype hub. Every prototype you build becomes instantly shareable, trackable, and open for feedback.

```
You: "Post this prototype to VibeSharing"

Claude: I found these collections in your org:
        1. All Hero Use Cases
        2. Compliance Hub
        3. Internal Tools

        Which collection should this go in? And do you want a custom URL
        like erg-v3-teams.vercel.app?
```

No guessing. No duplicates. Just a quick confirmation and your prototype is live.

## What You Can Do

### Ship prototypes without leaving your terminal
```
"Deploy this to VibeSharing in the Hero Use Cases collection as erg-v3-teams"
```
Claude confirms the collection, names the deployment, and handles everything—GitHub repo, Vercel deploy, team registration—in one conversation.

### Check what your team thinks
```
"What feedback did I get on the checkout flow prototype?"
```
See comments, suggestions, and resolved issues without opening a browser.

### Keep context alive across sessions
```
"Sync my CLAUDE.md (or AGENTS.md) to VibeSharing"
```
Your project context persists on VibeSharing, so any team member (or AI session) can pick up where you left off.

### See all your work in one place
```
"List my prototypes"
"Search collections for hero"
```
Every prototype you've registered, with links and recent activity. Fuzzy search included.

## Quick Start

### 1. Get Your Token & Connect GitHub

Sign up at [vibesharing.app](https://vibesharing.app), then go to [Account Settings](https://vibesharing.app/dashboard/account) to:
- **Connect your GitHub account** — required for Push to Deploy (gives you automatic push access to prototype repos)
- **Copy your deploy token** — needed for the MCP server config below

### 2. Configure Claude Code

```bash
claude mcp add vibesharing -s user \
  -e VIBESHARING_TOKEN=vs_PASTE_YOUR_TOKEN \
  -- npx -y @vibesharingapp/mcp-server@latest
```

> **Important:** Replace `vs_PASTE_YOUR_TOKEN` with your actual token. Use `-s user` so it works in all projects. Then restart Claude Code.

Or add to your Claude Code settings manually:

```json
{
  "mcpServers": {
    "vibesharing": {
      "command": "npx",
      "args": ["-y", "@vibesharingapp/mcp-server@latest"],
      "env": {
        "VIBESHARING_TOKEN": "vs_your_token_here"
      }
    }
  }
}
```

Using `@latest` ensures you always get new features and fixes automatically.

### 3. Start Building

That's it. Ask Claude to register prototypes, check feedback, or sync context. It just works.

## Why This Matters

### For Solo Builders
Stop losing track of what you've built. Every prototype is catalogued, shareable, and ready for feedback when you need it.

### For Teams
Finally, visibility into what everyone's shipping. No more "hey, can you send me that link again?" Feedback is structured, threaded, and actionable.

### For Design Leaders
See the full picture of your team's prototyping velocity. Guide feedback with custom topics. Keep stakeholders in the loop without endless meetings.

## Available Tools

| Tool | Description |
|------|-------------|
| `resolve_target` | **Start here.** Fuzzy-matches collection/project names and confirms where to deploy before proceeding. |
| `import_repo` | Import a GitHub repo into VibeSharing with a named Vercel deployment |
| `deploy_files` | Deploy multi-file projects to VibeSharing with named deployments |
| `deploy_prototype` | Deploy a single code file directly |
| `register_prototype` | Register an already-deployed prototype with name, description, and URL |
| `list_prototypes` | List/search all prototypes in your organization |
| `list_collections` | List/search all collections |
| `get_feedback` | Get feedback and comments for any prototype |
| `sync_context` | Push CLAUDE.md, AGENTS.md, or project notes to VibeSharing |
| `create_collection` | Create a new collection |
| `upload_source` | Upload source code to an existing prototype |
| `add_context_link` | Attach reference links (Figma, PRDs, docs) to collections or projects |
| `list_context_links` | List reference links on a collection or project |
| `remove_context_link` | Remove a reference link |
| `verify_token` | Check that your deploy token is valid |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VIBESHARING_TOKEN` | Yes | Your deploy token from VibeSharing |
| `VIBESHARING_URL` | No | Custom API URL (defaults to https://vibesharing.app) |

## Examples

### Deploy with a named URL
```
You: "Deploy this to VibeSharing as erg-v3-teams in the Hero Use Cases collection"

Claude: Deployed!

        Live URL: https://erg-v3-teams.vercel.app
        VibeSharing: https://vibesharing.app/dashboard/projects/xyz789

        Your team can now view the prototype and leave feedback.
```

### Fuzzy search for collections
```
You: "Put this in the hero collection"

Claude: I found "All Hero Use Cases" — is that the right collection?
```

### Get feedback before your next session
```
You: "Before I continue on the dashboard, what feedback came in?"

Claude: 3 new comments on Dashboard Redesign:
        - Sarah: "Love the new nav, but can we make the search more prominent?"
        - Mike: "The loading states feel snappy now"
        - Alex: "Can we add keyboard shortcuts?" [Resolved]
```

### Keep your AI context in sync
```
You: "Sync my CLAUDE.md to the Dashboard project on VibeSharing"

Claude: Context synced! Your team can now see your project notes at:
        https://vibesharing.app/dashboard/projects/abc123
```

## Built for the AI-Native Workflow

VibeSharing isn't just another tool to check. It's infrastructure for teams building with AI:

- **Smart deploy targeting** — fuzzy-matches collections and projects so you don't need exact IDs
- **Named deployments** — deterministic URLs like `erg-v3-teams.vercel.app` instead of random hashes
- **Context file sync** (CLAUDE.md, AGENTS.md) keeps context alive across sessions and team members
- **Guided feedback topics** help stakeholders give useful input
- **Email notifications** when prototypes update or get feedback
- **Works with any deploy target** — Vercel, Netlify, Replit, Lovable, v0, or paste any URL

## Learn More

- [VibeSharing](https://vibesharing.app) — Sign up free
- [Documentation](https://vibesharing.app/get-started) — Full setup guide
- [GitHub](https://github.com/erova/vibesharing) — Source code

---

**Stop building in isolation. Start shipping with your team.**

```bash
claude mcp add vibesharing -s user \
  -e VIBESHARING_TOKEN=vs_PASTE_YOUR_TOKEN \
  -- npx -y @vibesharingapp/mcp-server@latest
```

> **Important:** Replace `vs_PASTE_YOUR_TOKEN` with your actual token. Use `-s user` so it works in all projects. Then restart Claude Code.
