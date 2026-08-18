# Changelog

## 0.16.1 — 2026-08-18

### `import_repo` stopped writing GitHub as the "live" URL

When `import_repo` registered a new prototype, it wrote the GitHub source URL into the field the viewer treats as the live deploy — meant to be overwritten once hosting actually succeeded. If the deploy step failed before that correction ran, the record was left pointing at `github.com` permanently: the viewer hung on "Loading the prototype..." forever, since GitHub blocks being framed.

**What changed:**
- The placeholder write is gone. A newly imported prototype's URL now stays empty until a real deploy succeeds, so a failed import surfaces as "not found" instead of a silently broken, permanently stuck viewer.

## 0.16.0 — 2026-08-10

### A fixed critique prompt set, for when there's no one around to ask

`generate_feedback_topics` and `create_campaign` both write their own questions — from a deploy summary, from a brief. That's the right default when you know who you're asking and what you want from them. It's the wrong default for a design crit: early, rough work that just needs a peer's reaction, not a bespoke question set inferred from what got built.

**What changed:**
- **`generate_feedback_topics`** accepts `focus: "critique"` — applies four fixed structured-critique prompts (how directionally correct does this feel, do you agree with the thinking, where would you push this further, what's the first thing that feels unresolved) as feedback topics with no AI generation call. Topics get a new `critique` theme, with its own badge color in the feedback panel.
- **`create_campaign`** accepts `preset: "critique"` — seeds a research study's campaign-level questions with the same four prompts when `questions` is omitted, so the wording matches whether the ask is an async deploy comment thread or a full study.
- Both are opt-in. Omit `focus`/`preset` and nothing about existing behavior changes.

## 0.15.0 — 2026-08-03

### Feedback screenshots you can actually see

Every pinned comment is captured with a screenshot of what the reviewer was looking at. `get_feedback` returned it as a URL, which meant leaving the editor mid-review to open a link — so in practice nobody looked.

**What changed:**
- **Screenshots arrive as images.** Reviewing one person's feedback now attaches each screenshot as an image block the assistant can see, alongside the comment it belongs to. "This feels cluttered" stops being a sentence and becomes something you can act on.
- **Labelled per item.** Each image is preceded by which item it belongs to and an excerpt of the comment, so several in a row are never ambiguous.
- **Bounded.** At most 6 screenshots and 3MB per review, and anything left out is named rather than silently dropped — attaching 6 of 14 shouldn't read as "there were 6".
- **Only on the per-person queue.** The roll-up (`get_feedback` with no `author`) stays text; it's a "whose feedback do you want to read" summary and could span dozens of items.
- **A screenshot host returning 404 no longer reads as success.** The status is checked explicitly and failures are logged, with the link still listed so nothing is lost.

Works on both the local server and the remote endpoint at `vibesharing.app/api/mcp`.

## 0.14.1 — 2026-08-01

### What's New note for the review loop

- Added the v0.14 "Review feedback person by person" note to the in-editor What's New, which 0.14.0 shipped without.
- **Fixed version comparison.** `getWhatsNew` compared versions as strings, so `"0.6.0" > "0.13.0"` was true and anyone upgrading from 0.13.x was replayed the 0.4.0–0.6.0 notes as if they were new. Now compared numerically part by part, and notes render newest first.

## 0.14.0 — 2026-08-01

### Review feedback person by person

`get_feedback` now supports reviewing feedback as a conversation rather than a wall of text.

**What changed:**
- **Roll-up by author** — Called without `author`, `get_feedback` groups everything by who left it ("9 items from 4 people — 6 open"), so "show me the feedback" gets a scannable answer instead of a flat list.
- **New `author` parameter** — Called with `author`, it returns just that person's items as an ordered queue ("1 of 4", "2 of 4"). Accepts a first name, full name, or email, matched against the people who actually left feedback; ambiguous names ask rather than guess.
- **Full context per item** — Each item now includes the page path, pin position, screenshot URL, AI triage theme/priority/summary, the study question or guided topic it answers, star ratings and selected options, engineering fields, and the text of any replies. Previously only the comment, status, priority and a reply *count* were returned — the rest was dropped, which is exactly the context needed to draft a change.
- **Review instructions** — The author queue ends with a protocol telling the assistant to present one item at a time and let the owner choose to build, skip, or discuss each one before anything is written back.

**How it works:**
- Approving a build calls `triage_feedback(status: "in_progress")` so the stakeholder can see their feedback is being worked on; `close_feedback_loop` still resolves and emails them after the deploy.
- Skipping writes nothing — the item stays open so it can be revisited.
- Location is resolved from `page_path` when present, falling back to the older inline `📍 /path` marker so pre-`page_path` comments still report where they point.

## 0.11.6 — 2026-03-30

### Multi-provider hosting support

VibeSharing is no longer Vercel-only. Organizations can now choose their hosting provider for prototype deployments.

**What changed:**
- **Netlify provider** — Orgs can deploy prototypes to Netlify instead of Vercel. Especially useful for Vite/Atlas/MUI prototypes that hit Vercel's framework auto-detection bug.
- **Provider abstraction** — New `HostingProvider` interface with pluggable Vercel and Netlify implementations. AWS Amplify and Fargate are defined in the type system for future use.
- **Infrastructure settings** — Org admins can switch providers and configure tokens in Dashboard > Settings > Infrastructure.
- **Provider-agnostic MCP tools** — Tool descriptions and user-facing messages no longer assume Vercel. Deploy names, validation errors, and suggestions work for any provider.

**How it works:**
- Platform (vibesharing.app) stays on Vercel — only prototype hosting is multi-provider
- Default is still Vercel — no change for existing orgs unless they opt in
- Org's `deploy_provider` setting determines where new prototypes are created
- Both `deploy_files`/`deploy_prototype` (MCP) and `import_repo` (GitHub import) routes use the provider abstraction
- Each project records which provider it was deployed to, so status checks and re-imports work correctly

**Tested with:**
- Connected Compliance Atlas v7 (Vite + React + MUI v7 + Atlas design system)
- Built and deployed to Netlify in <10 seconds with zero config changes
- Atlas `.tgz` dependency resolves from Netlify's build environment
- No framework mismatch bug (the #1 pain point with Vercel for Vite projects)

## 0.11.5 — 2026-03-27

Previous release. See git history for details.
