#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

const PKG = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

// Fixed set of structured-critique prompts — used when focus="critique" instead of
// requiring the caller to supply topics. Aimed at a fast, opinionated design review
// rather than open-ended stakeholder feedback.
const CRITIQUE_TOPICS: Array<{ title: string; description: string; theme: string }> = [
  {
    title: "How directionally correct does this feel?",
    description: "Not pixel-perfect — is this pointed the right way?",
    theme: "critique",
  },
  {
    title: "Do you agree with the thinking behind this?",
    description: "React to the reasoning, not just the execution.",
    theme: "critique",
  },
  {
    title: "Where would you push this further?",
    description: "What's the next move if we had more time?",
    theme: "critique",
  },
  {
    title: "What's the first thing that feels unresolved?",
    description: "Call out anything that still feels rough or undecided.",
    theme: "critique",
  },
];

// Same structured-critique prompts as CRITIQUE_TOPICS, in the campaign question
// shape (comment-only, no rating/choice) — used when create_campaign is called
// with preset="critique" instead of an explicit `questions` array.
const CRITIQUE_STUDY_QUESTIONS: Array<{ prompt: string; comment: boolean }> = CRITIQUE_TOPICS.map((t) => ({
  prompt: t.title,
  comment: true,
}));

// VibeSharing API client
class VibesharingClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private async request(path: string, options: RequestInit & { skipTracking?: boolean } = {}) {
    const { skipTracking, ...fetchOptions } = options;
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(skipTracking ? {} : { "X-Vibesharing-Client": "mcp" }),
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    return response.json();
  }

  async registerPrototype(params: {
    name: string;
    description?: string;
    external_url?: string;
    parent_project_id?: string;
    collection_id?: string;
  }) {
    return this.request("/api/prototypes", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async listCollections() {
    return this.request("/api/collections");
  }

  async createCollection(params: { name: string; description?: string }) {
    return this.request("/api/collections", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async createCampaign(params: {
    name: string;
    goal?: string;
    feedback_mode?: "open" | "guided";
    feedback_layout?: "new_window" | "side_rail";
    mode?: "password" | "allowlist";
    password?: string;
    expires_in_days?: number;
    variant_group?: string;
    randomize_order?: boolean;
    questions?: unknown[];
    prototypes?: Array<{ prototype_id: string; about?: string; questions?: unknown[] }>;
  }) {
    return this.request("/api/mcp/campaigns", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async deployFiles(prototypeId: string, files: Array<{ path: string; content: string }>, commitMessage?: string, deployName?: string, template?: string, summary?: string, versionLabel?: string | null) {
    return this.request(`/api/prototypes/${prototypeId}/deploy-code`, {
      method: "POST",
      body: JSON.stringify({ files, commitMessage, deployName, template, summary, versionLabel }),
    });
  }

  async listPrototypes() {
    return this.request("/api/prototypes");
  }

  async listTemplates() {
    return this.request("/api/org/templates");
  }

  async getTemplate(idOrSlug: string) {
    return this.request(`/api/org/templates/${idOrSlug}`);
  }

  async getPrototype(id: string) {
    return this.request(`/api/prototypes/${id}`);
  }

  async deletePrototype(id: string) {
    return this.request(`/api/prototypes/${id}`, { method: "DELETE" });
  }

  async getFeedback(projectId: string, filters?: { status?: string; priority?: string; assigned_to?: string }) {
    const params = new URLSearchParams({ projectId });
    if (filters?.status) params.set("status", filters.status);
    if (filters?.priority) params.set("priority", filters.priority);
    if (filters?.assigned_to) params.set("assignedTo", filters.assigned_to);
    return this.request(`/api/feedback?${params.toString()}`);
  }

  async triageFeedback(feedbackIds: string[], updates: { status?: string; priority?: string | null; assigned_to?: string | null; resolution_note?: string }) {
    if (feedbackIds.length === 1) {
      return this.request("/api/feedback", {
        method: "PATCH",
        body: JSON.stringify({
          feedbackId: feedbackIds[0],
          status: updates.status,
          priority: updates.priority,
          assignedTo: updates.assigned_to,
          resolutionNote: updates.resolution_note,
        }),
      });
    }
    return this.request("/api/feedback/bulk", {
      method: "PATCH",
      body: JSON.stringify({
        feedbackIds,
        status: updates.status,
        priority: updates.priority,
        assignedTo: updates.assigned_to,
        resolutionNote: updates.resolution_note,
      }),
    });
  }

  async syncContext(projectId: string, content: string) {
    return this.request("/api/context", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        content,
        version: "auto-sync",
        updatedByName: "MCP Deploy",
      }),
    });
  }

  async listFeedbackTopics(projectId: string) {
    return this.request(`/api/feedback-topics?projectId=${projectId}`);
  }

  async verifyToken() {
    const url = `${this.baseUrl}/api/prototypes`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      return { valid: false, error: error.error || `API error: ${response.status}` };
    }

    const data = await response.json();
    return { valid: true, prototypeCount: (data.prototypes || []).length };
  }

  async uploadSource(prototypeId: string, sourceCode: string, filename?: string, storageOption?: string) {
    return this.request(`/api/prototypes/${prototypeId}/source`, {
      method: "POST",
      body: JSON.stringify({
        source_code: sourceCode,
        filename: filename || "page.tsx",
        storage_option: storageOption || "permanent",
      }),
    });
  }

  async deployStatic(params: {
    html: string;
    prototypeName?: string;
    prototypeId?: string;
    collectionId?: string;
  }) {
    return this.request("/api/deploy/static", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async deployPrototype(params: {
    code: string;
    prototypeName: string;
    prototypeId?: string;
  }) {
    return this.request("/api/deploy/code", {
      method: "POST",
      body: JSON.stringify({
        code: params.code,
        prototypeName: params.prototypeName,
        prototypeId: params.prototypeId,
        storageOption: "auto-delete", // Store source for 7 days for handoff
      }),
    });
  }

  async importRepo(prototypeId: string, repoUrl: string, deployName?: string, branch?: string, entryPoint?: string, versionLabel?: string | null) {
    return this.request("/api/git/import-repo", {
      method: "POST",
      body: JSON.stringify({ prototypeId, repoUrl, deployName, branch, entry_point: entryPoint, versionLabel }),
    });
  }

  async addContextLink(params: {
    folderId?: string;
    projectId?: string;
    title: string;
    url?: string;
    note?: string;
  }) {
    return this.request("/api/context-links", {
      method: "POST",
      body: JSON.stringify({
        folder_id: params.folderId || null,
        project_id: params.projectId || null,
        title: params.title,
        url: params.url || null,
        note: params.note || null,
      }),
    });
  }

  async listContextLinks(params: { folderId?: string; projectId?: string }) {
    const param = params.folderId
      ? `folderId=${params.folderId}`
      : `projectId=${params.projectId}`;
    return this.request(`/api/context-links?${param}`);
  }

  async removeContextLink(linkId: string) {
    return this.request(`/api/context-links/${linkId}`, {
      method: "DELETE",
    });
  }

  async diagnose() {
    return this.request("/api/diagnose");
  }

  async sendSupportRequest(params: {
    subject: string;
    description: string;
    context?: string;
  }) {
    return this.request("/api/support", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async trackEvent(event: string, properties?: Record<string, unknown>) {
    try {
      await this.request("/api/track", {
        method: "POST",
        body: JSON.stringify({ event, properties }),
        skipTracking: true,
      });
    } catch {
      // Tracking is fire-and-forget — never block the calling tool
    }
  }

  async generateFeedbackTopics(projectId: string, topics: Array<{ title: string; description?: string; theme?: string }>) {
    return this.request("/api/feedback-topics", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        topics,
        source: "auto",
      }),
    });
  }

  async notifyFeedbackResolved(projectId: string, feedbackIds: string[], deployUrl?: string) {
    return this.request("/api/feedback/notify-resolved", {
      method: "POST",
      body: JSON.stringify({ projectId, feedbackIds, deployUrl }),
    });
  }

  async forkPrototype(prototypeId: string, params?: { name?: string; deploy_name?: string; collection_id?: string }) {
    return this.request(`/api/prototypes/${prototypeId}/fork`, {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }

  async listVersions(prototypeId: string, limit = 10) {
    return this.request(`/api/prototypes/${prototypeId}/versions?limit=${limit}`);
  }

  async rollback(prototypeId: string, versionNumber: number) {
    return this.request(`/api/prototypes/${prototypeId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ version_number: versionNumber }),
    });
  }

  async updatePrototype(prototypeId: string, updates: { name?: string; description?: string; external_url?: string }) {
    return this.request(`/api/prototypes/${prototypeId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async updateFeedbackBrief(projectId: string, brief: string, focus?: string, scopeNote?: string) {
    const updates: Record<string, unknown> = { feedback_brief: brief };
    if (focus) updates.feedback_focus = focus;
    if (scopeNote !== undefined) updates.feedback_scope_note = scopeNote;
    return this.request(`/api/prototypes/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }
}

// ---- Fuzzy matching utilities ----

interface FuzzyMatch<T> {
  item: T;
  score: number; // 0–1, higher is better
}

/**
 * Simple fuzzy text matching. Scores based on:
 * - Exact match → 1.0
 * - Case-insensitive exact → 0.95
 * - Query is a substring → 0.7–0.9 (bonus for matching at word boundaries)
 * - Token overlap (words in common) → 0.3–0.7
 * - Otherwise → 0
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (q === t) return 1.0;
  if (t === q) return 0.95;

  // Substring match
  if (t.includes(q)) {
    // Bonus if it matches at a word boundary
    const wordBoundary = t.startsWith(q) || t.includes(` ${q}`);
    return wordBoundary ? 0.9 : 0.75;
  }
  if (q.includes(t)) return 0.7;

  // Token overlap
  const qTokens = q.split(/[\s\-_]+/).filter(Boolean);
  const tTokens = t.split(/[\s\-_]+/).filter(Boolean);
  if (qTokens.length === 0 || tTokens.length === 0) return 0;

  let matches = 0;
  for (const qt of qTokens) {
    if (tTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
      matches++;
    }
  }

  const overlap = matches / Math.max(qTokens.length, tTokens.length);
  return overlap * 0.7;
}

function fuzzyMatch<T>(
  query: string,
  items: T[],
  getName: (item: T) => string,
  threshold = 0.3
): FuzzyMatch<T>[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, getName(item)) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Feedback review formatting
//
// KEEP IN SYNC with the same block in lib/mcp-handlers.ts. This package builds
// standalone (tsc, MCP SDK only) so it cannot import from the app.
//
// The shape of these strings is the feature: get_feedback is what an assistant
// sees, so anything omitted here is context the assistant cannot use when it
// drafts a change. Pin coordinates, page path, screenshot, the question being
// answered, and reply text are all load-bearing for that.
// ---------------------------------------------------------------------------

interface FeedbackItem {
  id: string;
  user_name?: string | null;
  guest_email?: string | null;
  content: string;
  created_at: string;
  status?: string | null;
  priority?: string | null;
  assignee_name?: string | null;
  resolved_at?: string | null;
  page_path?: string | null;
  x_percent?: number | null;
  y_percent?: number | null;
  screenshot_url?: string | null;
  ai_theme?: string | null;
  ai_priority?: string | null;
  ai_summary?: string | null;
  ai_actionable?: boolean | null;
  feedback_type?: string | null;
  effort_estimate?: string | null;
  dependencies?: string | null;
  blockers?: string | null;
  recommended_approach?: string | null;
  question?: string | null;
  rating?: number | null;
  selected_options?: string[] | null;
  topic?: { title?: string | null; theme?: string | null } | null;
  replies?: Array<{ user_name?: string | null; content: string }>;
}

const OPEN_FEEDBACK_STATUSES = ["open", "in_progress"];

function feedbackStatus(f: FeedbackItem): string {
  return f.status || (f.resolved_at ? "resolved" : "open");
}

function isOpenFeedback(f: FeedbackItem): boolean {
  return OPEN_FEEDBACK_STATUSES.includes(feedbackStatus(f));
}

/**
 * Who left this. Guests have no user_id and may not have given a name, so fall
 * back to the email they were gated on before giving up and calling them
 * anonymous.
 */
function feedbackAuthor(f: FeedbackItem): string {
  const name = f.user_name?.trim();
  if (name && name.toLowerCase() !== "anonymous") return name;
  if (f.guest_email) return f.guest_email;
  return name || "Anonymous";
}

/** Insertion-ordered so authors appear most-recent-comment-first. */
function groupFeedbackByAuthor(feedback: FeedbackItem[]): Map<string, FeedbackItem[]> {
  const groups = new Map<string, FeedbackItem[]>();
  for (const f of feedback) {
    const author = feedbackAuthor(f);
    const existing = groups.get(author);
    if (existing) existing.push(f);
    else groups.set(author, [f]);
  }
  return groups;
}

/**
 * Resolve a user-typed name ("Chris", "chris@acme.com") to one of the authors
 * who actually left feedback. Exact-ish matches win; otherwise fall back to
 * fuzzy so first names work.
 */
function resolveFeedbackAuthor(
  query: string,
  groups: Map<string, FeedbackItem[]>
): { author: string } | { ambiguous: string[] } | null {
  const authors = [...groups.keys()];
  const q = query.trim().toLowerCase();

  const exact = authors.filter((a) => a.toLowerCase() === q);
  if (exact.length === 1) return { author: exact[0] };

  const prefix = authors.filter((a) => a.toLowerCase().startsWith(q));
  if (prefix.length === 1) return { author: prefix[0] };
  if (prefix.length > 1) return { ambiguous: prefix };

  const fuzzy = fuzzyMatch(query, authors, (a) => a, 0.45);
  if (fuzzy.length === 0) return null;
  if (fuzzy.length > 1 && fuzzy[1].score === fuzzy[0].score) {
    return { ambiguous: fuzzy.map((m) => m.item) };
  }
  return { author: fuzzy[0].item };
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * POST /api/feedback appends "\n\n📍 /path — Page Title" to the comment body —
 * a workaround from before prototype_feedback.page_path existed. Rows written
 * since then carry both, so pull the marker out and let it stand in for
 * page_path on the older rows that have nothing else.
 */
function splitRouteMarker(f: FeedbackItem): { content: string; path: string | null; title: string | null } {
  const match = f.content.match(/\n+📍 ([^\n—]+?)(?: — ([^\n]+))?\s*$/);
  if (!match) return { content: f.content.trim(), path: f.page_path || null, title: null };
  return {
    content: f.content.slice(0, match.index).trim(),
    path: f.page_path || match[1].trim() || null,
    title: match[2]?.trim() || null,
  };
}

/** "design / high" — whichever of the AI triage labels are present. */
function triageLabel(f: FeedbackItem): string {
  const parts = [f.ai_theme, f.priority || f.ai_priority].filter(Boolean);
  return parts.length ? parts.join(" / ") : "untriaged";
}

/**
 * The full brief for one item — everything an assistant needs to draft a
 * change without going back to the dashboard.
 */
function formatFeedbackBrief(f: FeedbackItem, position: number, total: number): string {
  const header = `─────────────────────────────── ${position} of ${total} ──`;
  const { content, path, title } = splitRouteMarker(f);
  const lines: string[] = [
    header,
    `[${feedbackStatus(f)}] ${triageLabel(f)}${f.ai_actionable === false ? " · not actionable" : ""}`,
    `"${content}"`,
  ];

  if (f.rating != null) lines.push(`  Rating: ${f.rating}/5`);
  if (f.selected_options?.length) lines.push(`  Chose: ${f.selected_options.join(", ")}`);

  // What prompted the comment: a study question is stored on the row, a guided
  // topic is joined in.
  const answering = f.question || f.topic?.title;
  if (answering) lines.push(`  Answering: "${answering}"`);

  const where: string[] = [];
  if (path) where.push(title ? `${path} (${title})` : path);
  if (f.x_percent != null && f.y_percent != null) {
    where.push(`pinned at ${Math.round(f.x_percent)}% across, ${Math.round(f.y_percent)}% down`);
  }
  if (where.length) lines.push(`  Where: ${where.join(" · ")}`);
  if (f.screenshot_url) lines.push(`  Screenshot: ${f.screenshot_url}`);
  if (f.ai_summary) lines.push(`  AI summary: ${f.ai_summary}`);

  if (f.feedback_type === "engineering") {
    const eng = [
      f.effort_estimate && `effort ${f.effort_estimate.toUpperCase()}`,
      f.dependencies && `depends on ${f.dependencies}`,
      f.blockers && `blocked by ${f.blockers}`,
      f.recommended_approach && `suggested approach: ${f.recommended_approach}`,
    ].filter(Boolean);
    if (eng.length) lines.push(`  Engineering: ${eng.join(" · ")}`);
  }

  if (f.assignee_name) lines.push(`  Assigned to: ${f.assignee_name}`);

  if (f.replies?.length) {
    lines.push(`  Replies (${f.replies.length}):`);
    for (const r of f.replies) {
      lines.push(`    - ${r.user_name || "Someone"}: "${truncate(r.content, 160)}"`);
    }
  }

  lines.push(`  feedback_id: ${f.id}`);
  return lines.join("\n");
}

/** Per-person roll-up — the answer to "show me all the feedback". */
function formatFeedbackRollup(feedback: FeedbackItem[]): string {
  const groups = groupFeedbackByAuthor(feedback);
  const openCount = feedback.filter(isOpenFeedback).length;
  const people = groups.size;

  const lines: string[] = [
    `${feedback.length} item${feedback.length === 1 ? "" : "s"} from ${people} ` +
      `${people === 1 ? "person" : "people"} — ${openCount} open, ${feedback.length - openCount} closed.`,
    "",
  ];

  for (const [author, items] of groups) {
    const open = items.filter(isOpenFeedback).length;
    lines.push(`${author} — ${items.length} item${items.length === 1 ? "" : "s"} (${open} open)`);
    for (const f of items) {
      const { content, path } = splitRouteMarker(f);
      const page = path ? ` · ${path}` : "";
      lines.push(`  · [${feedbackStatus(f)}] ${triageLabel(f)}${page} — "${truncate(content, 100)}"`);
      lines.push(`    ${f.id}`);
    }
    lines.push("");
  }

  const first = [...groups.keys()][0];
  lines.push(
    "To review one person's feedback item by item, call get_feedback again with " +
      `author — e.g. author: "${first}".`
  );
  return lines.join("\n");
}

/**
 * The instructions that make the review a conversation instead of a wall of
 * text. Appended to every author queue.
 */
const FEEDBACK_REVIEW_PROTOCOL = `
── How to run this review ──
Work through the items above IN ORDER, one at a time. Do not summarize them all
up front and do not act on any item before the user picks it.

For each item:
1. Show the user this item only — the comment, who left it, and where in the
   prototype it points (page path, pin position, screenshot).
2. Ask whether they want to build it, skip it, or talk it through.
3. BUILD — read the code the feedback actually points at, then draft a concrete
   implementation prompt: the specific change, the files involved, and what
   should visibly differ afterward. Show that prompt and wait for approval.
   Once approved, call triage_feedback(feedback_ids: [id], status: "in_progress")
   so the person who left it can see it is being worked on, then make the change.
4. SKIP — leave it untouched and move on. Do not change its status; a skipped
   item stays open so it can be revisited.
5. TALK IT THROUGH — discuss it, then come back to build or skip. Nothing is
   written to VibeSharing during this step.
Then move to the next item.

When every item is decided and the changes are deployed, call
close_feedback_loop with a note per item you built. That marks them resolved and
emails each stakeholder what changed.`.trim();

// ---------------------------------------------------------------------------
// Feedback screenshots as real images
//
// KEEP IN SYNC with the same block in the other copy of this formatter.
//
// A pinned comment is captured with a screenshot of exactly what the reviewer
// was looking at. Returning that as a URL made it useless in practice: reading
// feedback in an editor meant leaving the editor to open a link, which nobody
// does mid-review. Sent as an image block the assistant can actually see it,
// which is the difference between "this feels cluttered" being a sentence and
// being something you can act on.
//
// Only attached to the single-author queue, never the roll-up. The roll-up is a
// "whose feedback do you want to read" summary and could span dozens of items.
// ---------------------------------------------------------------------------

/** Screenshots attached to one queue. Past this, the rest are left as links. */
const SCREENSHOT_MAX_COUNT = 6;

/** Total decoded image budget. Well under typical context limits. */
const SCREENSHOT_MAX_BYTES = 3 * 1024 * 1024;

const SCREENSHOT_FETCH_TIMEOUT_MS = 5000;

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/**
 * Fetch the screenshots for a queue and return them as labelled image blocks.
 *
 * Each image is preceded by a text label naming the item it belongs to —
 * without that, several images in a row are unattributable and the assistant
 * cannot tell which comment it is looking at.
 *
 * Never throws. A screenshot is an enhancement to the review, so a broken
 * fetch degrades to the URL already present in the item's text rather than
 * failing the whole call. Failures are logged, not swallowed: a screenshot
 * host quietly 404ing for everyone is exactly the kind of thing that otherwise
 * goes unnoticed for months.
 */
async function buildScreenshotBlocks(
  items: FeedbackItem[]
): Promise<ContentBlock[]> {
  const withShots = items
    .map((f, i) => ({ f, position: i + 1 }))
    .filter((e) => !!e.f.screenshot_url);

  if (withShots.length === 0) return [];

  const blocks: ContentBlock[] = [];
  const selected = withShots.slice(0, SCREENSHOT_MAX_COUNT);
  let bytesUsed = 0;
  let attached = 0;
  let failed = 0;

  for (const { f, position } of selected) {
    if (bytesUsed >= SCREENSHOT_MAX_BYTES) break;

    let res: Response;
    try {
      res = await fetch(f.screenshot_url as string, {
        signal: AbortSignal.timeout(SCREENSHOT_FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      failed++;
      console.error(
        `[get_feedback] Screenshot fetch failed for feedback ${f.id}: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    // An `await fetch` in a try/catch does NOT throw on 4xx/5xx — the status
    // has to be checked explicitly or a 500 reads as success.
    if (!res.ok) {
      failed++;
      console.error(
        `[get_feedback] Screenshot for feedback ${f.id} returned HTTP ${res.status}.`
      );
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (bytesUsed + buf.byteLength > SCREENSHOT_MAX_BYTES) break;
    bytesUsed += buf.byteLength;
    attached++;

    const excerpt = (f.content || "").replace(/\s+/g, " ").trim().slice(0, 60);
    blocks.push({
      type: "text",
      text: `Screenshot for item ${position} of ${items.length}${excerpt ? ` — "${excerpt}${excerpt.length === 60 ? "…" : ""}"` : ""}:`,
    });
    blocks.push({
      type: "image",
      data: buf.toString("base64"),
      mimeType: res.headers.get("content-type") || "image/png",
    });
  }

  // Say what was left out. Silently attaching 6 of 14 reads as "there were 6".
  const notes: string[] = [];
  const remaining = withShots.length - attached - failed;
  if (remaining > 0) {
    notes.push(
      `${remaining} more item${remaining === 1 ? " has a screenshot" : "s have screenshots"} that ` +
        `${remaining === 1 ? "was" : "were"} not attached (limit ${SCREENSHOT_MAX_COUNT} per review). ` +
        `Open the Screenshot links above to see ${remaining === 1 ? "it" : "them"}.`
    );
  }
  if (failed > 0) {
    notes.push(
      `${failed} screenshot${failed === 1 ? "" : "s"} could not be loaded; ` +
        `the link${failed === 1 ? " is" : "s are"} still listed above.`
    );
  }
  if (notes.length) blocks.push({ type: "text", text: notes.join(" ") });

  return blocks;
}

function formatAuthorQueue(author: string, items: FeedbackItem[]): string {
  const open = items.filter(isOpenFeedback).length;
  const briefs = items.map((f, i) => formatFeedbackBrief(f, i + 1, items.length));
  return [
    `${author} left ${items.length} item${items.length === 1 ? "" : "s"} (${open} open).`,
    "",
    briefs.join("\n\n"),
    "",
    FEEDBACK_REVIEW_PROTOCOL,
  ].join("\n");
}

// ---- Version tracking & What's New ----

const CURRENT_VERSION = PKG.version as string;

const WHATS_NEW: Record<string, string> = {
  // Keyed 0.14.1 rather than 0.14.0 so people already on 0.14.0 still see it —
  // getWhatsNew only shows notes strictly newer than the version last run.
  "0.14.1": [
    "VibeSharing MCP v0.14 — Review feedback person by person:",
    "",
    "• get_feedback now rolls up by author — \"9 items from 4 people, 6 open\" —",
    "  instead of returning one flat list.",
    "• Pass author to walk one person's feedback one item at a time. Each item",
    "  carries the page it points at, the pin position, the screenshot, the",
    "  question it answers, and any replies.",
    "• Decide each one as you go: build it, skip it, or talk it through. Approving",
    "  marks the item in_progress so the person who left it can see it's being",
    "  worked on; skipping leaves it open.",
  ].join("\n"),
  "0.10.0": [
    "VibeSharing MCP v0.10.0 — Version Control & Forking:",
    "",
    "• fork_prototype — Create a copy of any prototype with its own URL. The original",
    "  stays untouched. Use this to experiment with variants safely.",
    "• list_versions — Browse deploy history with version numbers, file manifests,",
    "  commit info, and rollback availability.",
    "• rollback_deploy — Restore a previous version. For git deploys, re-pushes the",
    "  old files. For static deploys, restores the snapshot.",
    "• Every deploy now auto-tracks version numbers (v1, v2, v3...) with file hashes.",
  ].join("\n"),
  "0.6.0": [
    "🆕 VibeSharing MCP v0.6.0 — What's New:",
    "",
    "• Auto-generated feedback questions — After deploying, use generate_feedback_topics",
    "  to create 3-5 targeted questions that guide stakeholders toward useful feedback.",
    "  Questions are categorized by theme: vision alignment, feasibility, design fidelity,",
    "  or interaction design. Previous auto-generated questions are replaced on each deploy.",
    "• Feedback briefs — Include a brief parameter to set context stakeholders see in the",
    "  Context tab. Also auto-extracted from ## Feedback Brief in CLAUDE.md at deploy time.",
  ].join("\n"),
  "0.5.0": [
    "🆕 VibeSharing MCP v0.5.0 — What's New:",
    "",
    "• Feedback triage — get_feedback now supports status, priority, and assignee",
    "  filters. Use triage_feedback to update status (open/in_progress/resolved/",
    "  wont_fix/deferred), set priority, and assign feedback to team members.",
    "• New tool: triage_feedback — Bulk update feedback items without leaving your editor.",
  ].join("\n"),
  "0.4.0": [
    "• resolve_target tool — Fuzzy-matches collection/project names.",
    "• Named deployments — Set friendly deploy URLs with deploy_name.",
    "• Fuzzy search on list_collections and list_prototypes.",
    "• Guardrails on deploy tools.",
  ].join("\n"),
};

/**
 * Compare two semver-ish strings numerically. A plain string compare gets this
 * wrong the moment a part reaches double digits — "0.6.0" > "0.13.0" is true
 * lexically, which would replay years-old notes to anyone upgrading.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function getWhatsNew(): string | null {
  try {
    const configDir = join(homedir(), ".vibesharing");
    const versionFile = join(configDir, "mcp-version");

    let lastVersion: string | null = null;
    try {
      lastVersion = readFileSync(versionFile, "utf-8").trim();
    } catch {
      // First run or file missing
    }

    // Update stored version
    try {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(versionFile, CURRENT_VERSION);
    } catch {
      // Non-fatal
    }

    if (lastVersion === CURRENT_VERSION) return null;

    // Collect all changelogs newer than lastVersion, newest first
    const notes = Object.entries(WHATS_NEW)
      .filter(([ver]) => !lastVersion || compareVersions(ver, lastVersion) > 0)
      .sort(([a], [b]) => compareVersions(b, a))
      .map(([, note]) => note);

    return notes.length > 0 ? notes.join("\n\n") : null;
  } catch {
    return null;
  }
}

// Check once at startup, prepend to first tool call
let pendingWhatsNew: string | null = getWhatsNew();

// Get configuration from environment
const VIBESHARING_URL = process.env.VIBESHARING_URL || "https://vibesharing.app";
const VIBESHARING_TOKEN = process.env.VIBESHARING_TOKEN;

// Post-deploy feedback prompt — instructs the AI client to ask the user about feedback focus
function buildFeedbackPrompt(prototypeId: string, hasManualTopics: boolean): string {
  if (hasManualTopics) {
    return "";
  }
  return `IMPORTANT — ask the user this before moving on:

What should reviewers focus on? (design / usability / feasibility / everything / skip)

If they answer, call generate_feedback_topics with project_id "${prototypeId}" and 3-5 questions matching their focus. If they say "skip", move on.`;
}

if (!VIBESHARING_TOKEN) {
  console.error("Error: VIBESHARING_TOKEN environment variable is required");
  console.error("Get your deploy token from VibeSharing → Account Settings");
  console.error("");
  console.error("Quick setup:");
  console.error("  claude mcp add vibesharing -s user -e VIBESHARING_TOKEN=vs_YOUR_TOKEN -- npx -y @vibesharingapp/mcp-server@latest");
  process.exit(1);
}

if (VIBESHARING_TOKEN === "vs_your_token_here" || VIBESHARING_TOKEN.length < 10) {
  console.error("Error: VIBESHARING_TOKEN is still the placeholder value");
  console.error("Replace it with your actual deploy token from VibeSharing → Account Settings");
  console.error("");
  console.error("Fix:");
  console.error("  claude mcp remove vibesharing");
  console.error("  claude mcp add vibesharing -s user -e VIBESHARING_TOKEN=vs_YOUR_TOKEN -- npx -y @vibesharingapp/mcp-server@latest");
  process.exit(1);
}

// Check for updates (non-blocking — runs in background)
let updateNotice: string | null = null;
(async () => {
  try {
    const res = await fetch("https://registry.npmjs.org/@vibesharingapp/mcp-server/latest", {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const latest = data.version;
      if (latest && latest !== CURRENT_VERSION) {
        updateNotice = `⚠ VibeSharing MCP server update available: ${CURRENT_VERSION} → ${latest}\n  Run: claude mcp remove vibesharing && claude mcp add vibesharing -s user -e VIBESHARING_TOKEN=$VIBESHARING_TOKEN -- npx -y @vibesharingapp/mcp-server@latest\n  Then restart Claude Code.`;
        console.error(`[vibesharing] Update available: ${CURRENT_VERSION} → ${latest}`);
      }
    }
  } catch {
    // Silently ignore — don't block startup for a version check
  }
})();

const client = new VibesharingClient(VIBESHARING_URL, VIBESHARING_TOKEN);

// Check for unread feedback (non-blocking — runs in background, untracked)
let pendingFeedbackCheck: Promise<string | null> = (async () => {
  try {
    const result = await (client as any).request("/api/prototypes", { skipTracking: true });
    const prototypes = (result.prototypes || []).slice(0, 10) as Array<{
      id: string;
      name: string;
    }>;

    if (prototypes.length === 0) return null;

    const feedbackByPrototype: Array<{
      name: string;
      items: Array<{ user_name: string; content: string; priority?: string | null }>;
    }> = [];

    await Promise.all(
      prototypes.map(async (proto) => {
        try {
          const fbResult = await (client as any).request(`/api/feedback?projectId=${proto.id}&status=open`, { skipTracking: true });
          const feedback = (fbResult.feedback || []) as Array<{
            user_name: string;
            content: string;
            priority?: string | null;
          }>;
          if (feedback.length > 0) {
            feedbackByPrototype.push({ name: proto.name, items: feedback });
          }
        } catch {
          // Skip prototypes we can't access
        }
      })
    );

    if (feedbackByPrototype.length === 0) return null;

    let summary = "📬 Unread feedback since your last session:\n";
    for (const proto of feedbackByPrototype) {
      const count = proto.items.length;
      summary += `\n"${proto.name}" — ${count} new item${count !== 1 ? "s" : ""}\n`;
      for (const item of proto.items.slice(0, 5)) {
        const priorityTag = item.priority ? ` (${item.priority} priority)` : "";
        const truncated =
          item.content.length > 80 ? item.content.slice(0, 77) + "..." : item.content;
        summary += `  - ${item.user_name}: "${truncated}"${priorityTag}\n`;
      }
      if (proto.items.length > 5) {
        summary += `  ... and ${proto.items.length - 5} more\n`;
      }
    }
    summary += "\nUse get_feedback to see full details, or triage_feedback to respond.";

    return summary;
  } catch {
    // Silently ignore — don't block startup for a feedback check
    return null;
  }
})();

// Welcome message for new users (non-blocking — runs in background)
let pendingWelcome: Promise<string | null> = (async () => {
  try {
    const [tokenResult, templateResult] = await Promise.all([
      client.verifyToken(),
      client.listTemplates(),
    ]);

    if (!tokenResult.valid) return null;

    const protoCount = tokenResult.prototypeCount || 0;
    const templates = ((templateResult as any).templates || []).filter(
      (t: { is_active: boolean }) => t.is_active
    );

    // New user: no prototypes yet
    if (protoCount === 0) {
      let welcome = `👋 Welcome to VibeSharing! This is your first session.\n\n`;
      welcome += `VibeSharing lets you share prototypes with your team and collect feedback. Here's how it works:\n\n`;
      welcome += `1. Build something — a dashboard, a form, a landing page, anything\n`;
      welcome += `2. When the user says "share this", "publish this", "push this", or anything like that — deploy it to VibeSharing\n`;
      welcome += `3. They'll get a live URL they can send to their team for feedback\n`;

      if (templates.length > 0) {
        const tplNames = templates.map((t: { name: string }) => t.name).join(", ");
        welcome += `\nYour org has design system templates: **${tplNames}**. Ask the user if they'd like to start with one — it'll set up the right colors, fonts, and layout patterns automatically.`;
      }

      return welcome;
    }

    // Returning user with templates they might not know about
    // Only nudge if they have few prototypes (still learning the tool)
    if (protoCount <= 3 && templates.length > 0) {
      const tplNames = templates.map((t: { name: string }) => t.name).join(", ");
      return `💡 Reminder: your org has design system templates (${tplNames}). If the user is starting a new prototype, ask if they'd like to use one — it sets up the right brand colors and layout patterns automatically.`;
    }

    return null;
  } catch {
    return null;
  }
})();

// Create MCP server
const server = new Server(
  {
    name: "vibesharing",
    version: CURRENT_VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
    instructions: `VibeSharing MCP Server v${CURRENT_VERSION} — helps users share prototypes with their team and collect feedback.\n\nWhen the user says "share this", "publish this", "push this to VibeSharing", or anything suggesting they want others to see their work — deploy it. If their org has design system templates and they're starting something new, ask which template they'd like to use so the prototype matches their brand from the start.`,
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "register_prototype",
        description:
          "Register a prototype on VibeSharing. Creates a standalone prototype by default. To add it as a version under an existing project, provide parent_project_id. IMPORTANT: Before calling this, use resolve_target to confirm the collection and project name with the user. Do not auto-generate names without user confirmation. Returns the VibeSharing URL where the team can view and leave feedback.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the prototype (e.g., 'Dashboard Redesign v2')",
            },
            description: {
              type: "string",
              description: "Brief description of what this prototype demonstrates",
            },
            external_url: {
              type: "string",
              description: "URL where the prototype is deployed (e.g., https://my-app.vercel.app or https://my-app.netlify.app)",
            },
            parent_project_id: {
              type: "string",
              description: "Optional: ID of parent project if this is a version/iteration",
            },
            collection_id: {
              type: "string",
              description: "Optional: ID of collection (folder) to place this prototype in. Use list_collections to find the right ID.",
            },
            source_code: {
              type: "string",
              description: "Optional: Source code to upload to VibeSharing. Colleagues can download this from the prototype page.",
            },
            source_filename: {
              type: "string",
              description: "Optional: Filename for uploaded source (default: 'page.tsx')",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "list_prototypes",
        description:
          "List all prototypes in your VibeSharing organization. Shows name, URL, and recent activity. Optionally filter by search query (fuzzy matched).",
        inputSchema: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Optional: fuzzy search query to filter prototypes by name (e.g., 'erg' or 'dashboard')",
            },
          },
        },
      },
      {
        name: "list_collections",
        description:
          "List all collections (folders) in your VibeSharing organization. Use this to find the collection_id when registering prototypes. Optionally filter by search query (fuzzy matched).",
        inputSchema: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Optional: fuzzy search query to filter collections by name (e.g., 'hero' or 'compliance')",
            },
          },
        },
      },
      {
        name: "get_feedback",
        description:
          "Get feedback and comments for a prototype. Called without `author`, it returns a roll-up of who left feedback and what they said — use this for 'show me the feedback'. Called with `author`, it returns that person's items as an ordered queue with full context (page path, pin position, screenshot, the question being answered, replies) plus instructions for reviewing them one at a time so the owner can decide to build, skip, or discuss each one. Can also filter by status, priority, or assignee.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "The VibeSharing project/prototype ID",
            },
            author: {
              type: "string",
              description:
                "Review one person's feedback item by item. Accepts a first name, full name, or email — matched against the people who actually left feedback.",
            },
            status: {
              type: "string",
              description: "Filter by status: open, in_progress, resolved, wont_fix, deferred. Comma-separated for multiple.",
            },
            priority: {
              type: "string",
              description: "Filter by priority: critical, high, medium, low",
            },
            assigned_to: {
              type: "string",
              description: "Filter by assignee user ID, or 'unassigned' for unassigned feedback",
            },
          },
          required: ["project_id"],
        },
      },
      {
        name: "triage_feedback",
        description:
          "Update status, priority, or assignee on one or more feedback items. Use this to triage feedback from within your editor.",
        inputSchema: {
          type: "object",
          properties: {
            feedback_ids: {
              type: "array",
              items: { type: "string" },
              description: "One or more feedback IDs to update",
            },
            status: {
              type: "string",
              enum: ["open", "in_progress", "resolved", "wont_fix", "deferred"],
              description: "New status for the feedback items",
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description: "New priority for the feedback items. Omit to leave unchanged.",
            },
            assigned_to: {
              type: "string",
              description: "User ID to assign to. Use empty string to unassign.",
            },
            resolution_note: {
              type: "string",
              description: "Brief explanation of how the feedback was addressed (shown to the stakeholder). Only meaningful when status is resolved/wont_fix/deferred.",
            },
          },
          required: ["feedback_ids"],
        },
      },
      {
        name: "close_feedback_loop",
        description:
          "CALL THIS AFTER DEPLOYING when there is open feedback. Matches what you just built to open feedback items, resolves them with explanations, and notifies the original stakeholders with a personalized digest. The stakeholder sees exactly what happened to their feedback.\n\nFlow:\n1. Pull open feedback via get_feedback\n2. Look at what you built and match changes to feedback items\n3. Call this tool with the resolutions\n4. Stakeholders get email: 'Your feedback was addressed' with per-item explanations",
        inputSchema: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "The VibeSharing prototype ID",
            },
            resolutions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  feedback_id: {
                    type: "string",
                    description: "The feedback item ID being resolved",
                  },
                  status: {
                    type: "string",
                    enum: ["resolved", "wont_fix", "deferred", "in_progress"],
                    description: "What happened: resolved (fixed), wont_fix (intentional), deferred (later), in_progress (started but not done)",
                  },
                  note: {
                    type: "string",
                    description: "Brief explanation of what changed or why it was deferred. This is shown directly to the stakeholder. Be specific: 'Nav restructured to separate admin and user flows' not 'Fixed the navigation'.",
                  },
                },
                required: ["feedback_id", "status", "note"],
              },
              description: "Array of feedback items to resolve with explanations",
            },
            deploy_url: {
              type: "string",
              description: "Optional: URL of the new deploy (included in notification so stakeholders can see the update)",
            },
          },
          required: ["project_id", "resolutions"],
        },
      },
      {
        name: "sync_context",
        description:
          "Sync your CLAUDE.md, AGENTS.md, or project context to VibeSharing. This helps maintain context across AI sessions and team members.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "The VibeSharing project/prototype ID to sync context to",
            },
            content: {
              type: "string",
              description: "The context content (typically contents of CLAUDE.md or AGENTS.md)",
            },
          },
          required: ["project_id", "content"],
        },
      },
      {
        name: "verify_token",
        description:
          "Verify that your VibeSharing deploy token is valid. Use this to check connectivity and authentication before other operations.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "upload_source",
        description:
          "Upload source code for an existing prototype on VibeSharing. Colleagues can then download the source from the prototype page. Use this when you want to share code without deploying it.",
        inputSchema: {
          type: "object",
          properties: {
            prototype_id: {
              type: "string",
              description: "The VibeSharing prototype ID to upload source code to",
            },
            source_code: {
              type: "string",
              description: "The source code to upload",
            },
            filename: {
              type: "string",
              description: "Optional: Filename for the source (default: 'page.tsx')",
            },
            storage_option: {
              type: "string",
              description: "Optional: 'permanent' (default), 'auto-delete' (7 days), or 'delete-on-download'",
            },
          },
          required: ["prototype_id", "source_code"],
        },
      },
      {
        name: "deploy_prototype",
        description:
          "Deploy code directly to VibeSharing. Deploys to Vercel with a Git repo and registers it as a prototype in one step. Supports single-file (code) or multi-file (files/file_paths) deploys. For multi-page prototypes, use files or file_paths instead of code. IMPORTANT: Always ask the user WHERE this should go BEFORE deploying — which collection and project. Use resolve_target to confirm. Pass collection_id and parent_project_id so the prototype lands in the right place from the start.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Single-file shorthand: the React/Next.js page code (deployed as app/page.tsx). Use 'files' or 'file_paths' instead for multi-file prototypes.",
            },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string", description: "File path relative to project root (e.g., 'app/page.tsx', 'app/globals.css')" },
                  content: { type: "string", description: "File content" },
                },
                required: ["path", "content"],
              },
              description: "Multi-file deploy: array of files with paths and content. Overrides 'code' if both provided.",
            },
            file_paths: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Absolute path to the file on disk" },
                  deploy_path: { type: "string", description: "File path in the deployed project (e.g., 'app/page.tsx'). Defaults to the filename." },
                },
                required: ["path"],
              },
              description: "Multi-file deploy from disk: reads files and deploys them. Use instead of 'files' for large files that may exceed MCP parameter size limits.",
            },
            name: {
              type: "string",
              description: "Name for the prototype (e.g., 'Checkout Flow v2')",
            },
            prototype_id: {
              type: "string",
              description: "Optional: existing prototype ID to update (creates new if not provided)",
            },
            collection_id: {
              type: "string",
              description: "Optional: Collection ID to place the prototype in. Skips the confirmation prompt if provided.",
            },
            parent_project_id: {
              type: "string",
              description: "Optional: Parent project ID if this is a version/iteration of an existing project.",
            },
            deploy_name: {
              type: "string",
              description: "Optional: Friendly name for the deploy URL (e.g., 'checkout-v2')",
            },
            commit_message: {
              type: "string",
              description: "Optional: Git commit message (default: 'Deploy via MCP')",
            },
            summary: {
              type: "string",
              description: "IMPORTANT: 1-2 sentence summary of what was built or changed, written for stakeholders (not developers). This appears in email notifications to the team. Example: 'Added meeting scheduling with template picker and drag-to-reorder agenda items.' Always provide this.",
            },
            version_label: {
              type: "string",
              description: "Optional but encouraged on re-deploys: short title for this version (≤60 chars) like 'dark theme', 'calendar variant', 'tightened spacing'. Renders as the version row's headline in the Versions panel — distinct from `summary` (what changed) and `commit_message` (git provenance). Ask the user when they describe a meaningful change between versions.",
            },
            template: {
              type: "string",
              description: "Optional: Design system template to apply. Available templates depend on your org.",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "share_html",
        description:
          "Share a static HTML page on VibeSharing — the simplest way to share. No Vercel, no GitHub, no React wrapper. Just uploads the HTML and gives you a shareable link with the feedback widget built in. Use this for standalone HTML files, one-page prototypes, or any static content that doesn't need a build step. For large HTML files, use file_path instead of html to avoid MCP parameter size limits.",
        inputSchema: {
          type: "object",
          properties: {
            html: {
              type: "string",
              description: "The full HTML content to share. Either html or file_path is required.",
            },
            file_path: {
              type: "string",
              description: "Absolute path to an HTML file on disk. Use this instead of html for large files that may exceed MCP parameter size limits (~100KB). Either html or file_path is required.",
            },
            name: {
              type: "string",
              description: "Name for the prototype (e.g., 'Sunrise Glow Chatbox')",
            },
            prototype_id: {
              type: "string",
              description: "Optional: existing prototype ID to update",
            },
            collection_id: {
              type: "string",
              description: "Optional: collection to place it in",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "create_collection",
        description:
          "Create a new collection in your VibeSharing organization. Collections group related projects and prototypes. Use this before deploying a prototype if you need a new collection to put it in.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name for the collection (e.g., 'Hero Use Cases', 'Compliance Hub')",
            },
            description: {
              type: "string",
              description: "Optional: Brief description of this collection",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "create_campaign",
        description:
          "Create a research campaign (customer/user study) in VibeSharing. A campaign bundles several prototypes behind one gated portal and asks reviewers structured questions. Great for A/B/C preference tests across variants. Creates the campaign as a DRAFT — review and open/send it from the dashboard (opening applies access gating and invites the cohort). Each question can collect a 1–5 star rating, a multiple choice, and/or a free comment. Ask the user which prototypes and what to ask before calling — or pass preset: 'critique' to skip that and use a fixed structured-critique question set instead.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Campaign name (e.g., 'Risk Maestro — visual direction test')" },
            goal: { type: "string", description: "The research goal / participant brief shown at the start of the portal." },
            preset: {
              type: "string",
              enum: ["critique"],
              description: "Optional. 'critique' applies a fixed structured-critique question set (directional fit, reasoning, push-further, what's unresolved) as the campaign-level questions when `questions` is omitted. Same prompts as generate_feedback_topics' focus='critique'. Best for early/rough work reviewed by peers rather than a formal preference test — pairs naturally with feedback_mode='guided' (the default) and a single prototype.",
            },
            feedback_mode: {
              type: "string",
              enum: ["guided", "open"],
              description: "'guided' (default) walks reviewers through your questions per prototype; 'open' just collects free comments.",
            },
            variant_group: {
              type: "string",
              description: "Optional label to group the prototypes as variants of one thing (e.g., 'risk-maestro'), so they read as A/B/C.",
            },
            randomize_order: {
              type: "boolean",
              description: "Randomize the prototype order per participant and show them blind as 'Option A/B/C' (labels stay tied to each prototype). Best for unbiased preference tests. Researchers still see which letter is which in the dashboard.",
            },
            feedback_layout: {
              type: "string",
              enum: ["new_window", "side_rail"],
              description: "Where participants answer. 'new_window' (default) opens the prototype in its own window with questions in the launching tab; 'side_rail' embeds the prototype on the left with questions in a rail beside it. side_rail auto-falls back to new_window on narrow screens or when an external site blocks embedding.",
            },
            expires_in_days: { type: "number", description: "Optional: auto-expire the campaign after N days once opened." },
            questions: {
              type: "array",
              description: "Optional campaign-level questions asked once after all prototypes (e.g., an overall preference question). Not required when preset is 'critique'.",
              items: {
                type: "object",
                properties: {
                  prompt: { type: "string", description: "The question text." },
                  rating: { type: "boolean", description: "Include a 1–5 star rating." },
                  comment: { type: "boolean", description: "Include a free-text comment box." },
                  choice: { type: "boolean", description: "Include a multiple-choice question (provide options)." },
                  options: { type: "array", items: { type: "string" }, description: "Choices for a multiple-choice question." },
                  multi: { type: "boolean", description: "Allow selecting multiple options." },
                },
                required: ["prompt"],
              },
            },
            prototypes: {
              type: "array",
              description: "The prototypes to include, in order. Each gets its own intro and questions.",
              items: {
                type: "object",
                properties: {
                  prototype_id: { type: "string", description: "The VibeSharing prototype ID to include." },
                  about: { type: "string", description: "Optional short intro shown above this prototype in the portal." },
                  questions: {
                    type: "array",
                    description: "Questions asked for this prototype (rating / choice / comment, same shape as campaign questions).",
                    items: {
                      type: "object",
                      properties: {
                        prompt: { type: "string" },
                        rating: { type: "boolean" },
                        comment: { type: "boolean" },
                        choice: { type: "boolean" },
                        options: { type: "array", items: { type: "string" } },
                        multi: { type: "boolean" },
                      },
                      required: ["prompt"],
                    },
                  },
                },
                required: ["prototype_id"],
              },
            },
          },
          required: ["name"],
        },
      },
      {
        name: "deploy_files",
        description:
          "Deploy a multi-file Next.js project to VibeSharing. Pushes files to GitHub, deploys to Vercel. Requires an existing prototype ID. For large files, use file_paths instead of files to read from disk and avoid MCP parameter size limits (~100KB). IMPORTANT: If the code is already in a GitHub repo, use import_repo instead — it's faster, supports branches, and has no payload size limits. Only use deploy_files for code you generated or small projects. Before calling this, use resolve_target to confirm the target prototype with the user.",
        inputSchema: {
          type: "object",
          properties: {
            prototype_id: {
              type: "string",
              description: "The VibeSharing prototype ID to deploy to",
            },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "File path relative to project root (e.g., 'app/page.tsx')",
                  },
                  content: {
                    type: "string",
                    description: "File content",
                  },
                },
                required: ["path", "content"],
              },
              description: "Array of files to deploy with inline content",
            },
            file_paths: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "Absolute path to the file on the local filesystem",
                  },
                  deploy_path: {
                    type: "string",
                    description: "File path in the deployed project (e.g., 'app/page.tsx'). Defaults to the filename.",
                  },
                },
                required: ["path"],
              },
              description: "Array of local file paths to read and deploy. Use this instead of files for large files that may exceed MCP parameter size limits.",
            },
            commit_message: {
              type: "string",
              description: "Optional: Git commit message (default: 'Deploy via MCP')",
            },
            summary: {
              type: "string",
              description: "IMPORTANT: 1-2 sentence summary of what was built or changed, written for stakeholders (not developers). This appears in email notifications to the team. Example: 'Redesigned the risk dashboard with sortable columns and export to PDF.' Always provide this.",
            },
            version_label: {
              type: "string",
              description: "Optional but encouraged on re-deploys: short title for this version (≤60 chars) like 'dark theme', 'calendar variant'. Renders as the version row's headline in the Versions panel.",
            },
            deploy_name: {
              type: "string",
              description: "Optional: Friendly name for the deploy URL (e.g., 'erg-v3-teams'). On redeploy, renames the hosting project if different from current name.",
            },
            template: {
              type: "string",
              description: "Optional: Design system template to apply. Available templates: 'atlas-light' (clean institutional), 'atlas-dark' (dark variant), 'atlas-lens' (product-focused dark). Templates inject themed CSS and a starter page. Diligent org only.",
            },
          },
          required: ["prototype_id"],
        },
      },
      {
        name: "import_repo",
        description:
          "Import an existing GitHub repo into VibeSharing. PREFER THIS over deploy_files when code is already in a GitHub repo — it fetches files server-side (no payload size limits) and supports branch selection via the branch parameter. Pulls code into a VibeSharing-hosted repo and deploys to Vercel. IMPORTANT: Before calling this, use resolve_target to confirm the collection, project name, and deploy name with the user.",
        inputSchema: {
          type: "object",
          properties: {
            repo_url: {
              type: "string",
              description: "GitHub repo URL (e.g., 'https://github.com/my-org/my-repo')",
            },
            name: {
              type: "string",
              description: "Optional: Name for the prototype. Defaults to the repo name if not provided.",
            },
            prototype_id: {
              type: "string",
              description: "Optional: Existing VibeSharing prototype ID. If not provided, a new prototype is created.",
            },
            collection_id: {
              type: "string",
              description: "Optional: Collection (folder) ID to place the prototype in. Use list_collections to find IDs.",
            },
            parent_project_id: {
              type: "string",
              description: "Optional: Parent project ID if this is a version/iteration of an existing project.",
            },
            description: {
              type: "string",
              description: "Optional: Description of the prototype.",
            },
            deploy_name: {
              type: "string",
              description: "Optional: Friendly name for the deploy URL (e.g., 'erg-v3-teams'). Lowercase, hyphens allowed, max 100 chars. Auto-derived from 'name' if omitted.",
            },
            branch: {
              type: "string",
              description: "Optional: Git branch to import from (e.g., 'subsidiary-governance-workflows'). Defaults to the repo's default branch (usually 'main').",
            },
            entry_point: {
              type: "string",
              description: "Optional: HTML file to use as the landing page (e.g., 'my-page.html'). Creates a redirect from index.html. Use for static HTML sites with no index.html.",
            },
            version_label: {
              type: "string",
              description: "Optional but encouraged on re-imports: short title for this version (≤60 chars) like 'fixed nav spacing', 'added dark mode'. Renders as the version row's headline in the Versions panel.",
            },
          },
          required: ["repo_url"],
        },
      },
      {
        name: "resolve_target",
        description:
          "CALL THIS BEFORE deploying or registering a prototype when the user hasn't provided exact IDs. Fuzzy-matches collection and project names, suggests where to put the prototype, and checks deploy_name availability. Returns structured options so you can confirm with the user before proceeding.",
        inputSchema: {
          type: "object",
          properties: {
            collection_name: {
              type: "string",
              description: "Approximate collection name to search for (e.g., 'hero use cases'). Fuzzy matched.",
            },
            project_name: {
              type: "string",
              description: "Approximate project/prototype name to search for (e.g., 'ERG v3'). Fuzzy matched.",
            },
            deploy_name: {
              type: "string",
              description: "Desired Vercel deploy name to check availability for (e.g., 'erg-v3-teams').",
            },
          },
        },
      },
      {
        name: "list_templates",
        description:
          "List design system templates available in your org. Call this when the user asks about design systems, branding, templates, or wants their prototype to match their org's look and feel. Templates provide themed CSS variables, starter pages, and AI design instructions.",
        inputSchema: {
          type: "object",
          properties: {
            active_only: {
              type: "boolean",
              description: "Only show active templates (default: true)",
            },
          },
        },
      },
      {
        name: "get_template",
        description:
          "Get the full details of a design system template — CSS variables, starter page, and design instructions. Use this BEFORE writing any code to ensure your prototype matches the org's design system from the start.",
        inputSchema: {
          type: "object",
          properties: {
            template: {
              type: "string",
              description:
                "Template slug or ID (e.g., 'atlas-light'). Use list_templates to see available options.",
            },
          },
          required: ["template"],
        },
      },
      {
        name: "quick_prototype",
        description:
          "Create and deploy a themed prototype in one step. Picks a design system template, registers a new prototype, and deploys generated code — all from a single description. The fastest way to go from idea to live URL.",
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description:
                "What the prototype should show or do (e.g., 'a dashboard for monitoring deploy status with a table of recent deploys and status badges')",
            },
            template: {
              type: "string",
              description:
                "Template slug to use. If omitted, lists available templates and picks the best match.",
            },
            name: {
              type: "string",
              description: "Name for the prototype. Auto-generated from description if omitted.",
            },
            collection_id: {
              type: "string",
              description: "Optional: Collection to place the prototype in",
            },
            parent_project_id: {
              type: "string",
              description: "Optional: Parent project ID",
            },
          },
          required: ["description"],
        },
      },
      {
        name: "add_context_link",
        description:
          "Attach a reference link or note to a collection or project/prototype. Use this to add links to Figma designs, PRDs, Confluence docs, or free-text notes that provide context for reviewers.",
        inputSchema: {
          type: "object",
          properties: {
            folder_id: {
              type: "string",
              description: "Collection (folder) ID to attach the link to. Provide either folder_id or project_id.",
            },
            project_id: {
              type: "string",
              description: "Project or prototype ID to attach the link to. Provide either folder_id or project_id.",
            },
            title: {
              type: "string",
              description: "Title for the reference (e.g., 'Design Spec', 'PRD', 'User Flow Diagram')",
            },
            url: {
              type: "string",
              description: "Optional: URL to the reference material (Figma, Confluence, Google Docs, etc.). Omit for free-text notes.",
            },
            note: {
              type: "string",
              description: "Optional: Description or notes about this reference",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "list_context_links",
        description:
          "List all reference links and notes attached to a collection or project/prototype.",
        inputSchema: {
          type: "object",
          properties: {
            folder_id: {
              type: "string",
              description: "Collection (folder) ID. Provide either folder_id or project_id.",
            },
            project_id: {
              type: "string",
              description: "Project or prototype ID. Provide either folder_id or project_id.",
            },
          },
        },
      },
      {
        name: "remove_context_link",
        description:
          "Remove a reference link or note by its ID.",
        inputSchema: {
          type: "object",
          properties: {
            link_id: {
              type: "string",
              description: "The ID of the context link to remove",
            },
          },
          required: ["link_id"],
        },
      },
      {
        name: "generate_feedback_topics",
        description:
          "Auto-generate feedback questions for a prototype based on what was built. IMPORTANT: Before generating questions, ask the user: 'What type of feedback is most important for this deploy?' and present these options:\n\n  1. Awareness only — just sharing progress, no feedback needed\n  2. Design direction — brand, visual, layout feedback\n  3. Technical feasibility — is this buildable, are these features doable\n  4. Vision alignment — does this match where we're going\n  5. Interaction design — usability, flow, UX patterns\n  6. Structured critique — fixed design-crit prompts (directional fit, reasoning, push-further), good for early/rough work reviewed by peers\n  7. Full review — all feedback welcome (default)\n\nUse their answer as the 'focus' parameter. If 'awareness', skip topic generation and just set the brief. If 'critique', omit `topics` — a fixed structured-critique set is applied automatically. Otherwise generate 3-5 questions, weighting toward the chosen focus theme.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "The VibeSharing prototype ID",
            },
            focus: {
              type: "string",
              enum: ["awareness", "design", "feasibility", "vision", "interaction", "critique", "full"],
              description: "The type of feedback the designer wants. 'awareness' = no questions, just FYI. 'critique' = fixed structured-critique prompts, no `topics` needed. Others emphasize that theme. 'full' = all themes equally. Default: 'full'.",
            },
            brief: {
              type: "string",
              description: "A short (2-4 sentence) feedback brief explaining what this prototype is and what's ready for review. Stored on the prototype and shown to stakeholders in the Context tab.",
            },
            topics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "The feedback question (e.g., 'Does this navigation flow match how your team actually works?')",
                  },
                  description: {
                    type: "string",
                    description: "Optional: Additional context for the question",
                  },
                  theme: {
                    type: "string",
                    enum: ["vision", "feasibility", "design", "interaction", "critique"],
                    description: "Question theme: 'vision' (alignment with goals), 'feasibility' (technical possibility), 'design' (brand/visual fidelity), 'interaction' (usability/UX patterns), 'critique' (structured design crit)",
                  },
                },
                required: ["title"],
              },
              description: "Array of feedback questions to create. Generate 3-5 based on what you built. Weight toward the focus theme (e.g., if focus is 'feasibility', 2-3 questions should be feasibility-themed). Not required when focus is 'awareness' or 'critique'.",
            },
            scope_note: {
              type: "string",
              description: "Optional: What stakeholders should NOT focus on, or scope boundaries (e.g., 'Visual polish is not ready yet — focus on the interaction flow'). Shown as a disclaimer on the share page.",
            },
          },
          required: ["project_id"],
        },
      },
      {
        name: "diagnose",
        description:
          "Run a comprehensive health check on the user's VibeSharing setup. Checks token validity, GitHub connection, stuck deploy locks (auto-clears them), recent deploy errors, and prototype status. Use this to troubleshoot issues.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "validate_project",
        description:
          "Validate that the current project will build successfully before deploying. Checks for common issues: missing framework dependencies (next, vite, nuxt, astro, gatsby), missing build scripts, conflicting configs. Use this before deploy_files or deploy_prototype to catch build failures early. Returns warnings and errors with fix suggestions.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: {
              type: "string",
              description: "Absolute path to the project directory to validate. Defaults to the current working directory.",
            },
          },
        },
      },
      {
        name: "send_support_request",
        description:
          "Send a support request to the VibeSharing admin. Use this when the user has an issue you can't resolve, needs a configuration change, or wants to report a bug.",
        inputSchema: {
          type: "object",
          properties: {
            subject: {
              type: "string",
              description: "Short subject line for the support request",
            },
            description: {
              type: "string",
              description: "Detailed description of the issue or request",
            },
            context: {
              type: "string",
              description: "Optional: Session context, error messages, or relevant logs to help debug the issue",
            },
          },
          required: ["subject", "description"],
        },
      },
      {
        name: "list_versions",
        description:
          "List version history for a prototype. Shows all deploys with version numbers, file counts, commit info, and whether rollback is available. Use this to review what changed between deploys or to find a version to rollback to.",
        inputSchema: {
          type: "object",
          properties: {
            prototype_id: {
              type: "string",
              description: "The VibeSharing prototype ID",
            },
            limit: {
              type: "number",
              description: "Max versions to return (default: 10, max: 50)",
            },
          },
          required: ["prototype_id"],
        },
      },
      {
        name: "rollback_deploy",
        description:
          "Rollback a prototype to a previous version. For git deploys, re-pushes the old files to GitHub. For static deploys, restores the HTML snapshot. IMPORTANT: Always call list_versions first and confirm the target version with the user before rolling back.",
        inputSchema: {
          type: "object",
          properties: {
            prototype_id: {
              type: "string",
              description: "The VibeSharing prototype ID",
            },
            version_number: {
              type: "number",
              description: "The version number to rollback to (from list_versions)",
            },
          },
          required: ["prototype_id", "version_number"],
        },
      },
      {
        name: "fork_prototype",
        description:
          "Fork a prototype: creates a new copy with its own deploy URL, linked back to the original. The original is preserved untouched. Use this when the user wants to explore a variant, experiment with changes, or branch from an existing prototype without risking the original. IMPORTANT: Confirm the fork name and target collection with the user before proceeding.",
        inputSchema: {
          type: "object",
          properties: {
            prototype_id: {
              type: "string",
              description: "The source prototype ID to fork from",
            },
            name: {
              type: "string",
              description: "Name for the fork (default: '{original name} (fork)')",
            },
            deploy_name: {
              type: "string",
              description: "Optional: Friendly name for the deploy URL (e.g., 'login-v2-dark')",
            },
            collection_id: {
              type: "string",
              description: "Optional: Collection to place the fork in. Defaults to the same collection as the original.",
            },
          },
          required: ["prototype_id"],
        },
      },
      {
        name: "delete_prototype",
        description:
          "Delete a prototype from VibeSharing. Removes the prototype, its deployments, version history, and feedback. This is irreversible. IMPORTANT: Always confirm with the user before deleting. Only the prototype creator or an org admin can delete.",
        inputSchema: {
          type: "object",
          properties: {
            prototype_id: {
              type: "string",
              description: "The prototype ID to delete",
            },
          },
          required: ["prototype_id"],
        },
      },
      {
        name: "update_prototype",
        description:
          "Update a prototype's metadata (name, description, external URL). Use this to rename prototypes, update descriptions, or fix URLs. Does NOT create a new entry — modifies the existing one in place.",
        inputSchema: {
          type: "object",
          properties: {
            prototype_id: {
              type: "string",
              description: "The prototype ID to update",
            },
            name: {
              type: "string",
              description: "New name for the prototype",
            },
            description: {
              type: "string",
              description: "New description",
            },
            external_url: {
              type: "string",
              description: "New external URL",
            },
          },
          required: ["prototype_id"],
        },
      },
    ],
  };
});

// Handle tool calls
type LocalToolResult = {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
};

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Explicit annotation: get_feedback contributes image blocks, so the inferred
  // union would otherwise lose `isError` and drop `data`/`mimeType`.
  const toolResult: LocalToolResult = await (async (): Promise<LocalToolResult> => {
  try {
    switch (name) {
      case "register_prototype": {
        const params = args as {
          name: string;
          description?: string;
          external_url?: string;
          parent_project_id?: string;
          collection_id?: string;
          source_code?: string;
          source_filename?: string;
        };

        // Guardrail: if no collection specified, bounce back with options
        if (!params.collection_id) {
          const [guardCollResult, guardProtoResult] = await Promise.all([
            client.listCollections(),
            client.listPrototypes(),
          ]);
          const guardCollections = guardCollResult.collections || [];
          const guardPrototypes = guardProtoResult.prototypes || [];

          const similarProjects = fuzzyMatch(params.name, guardPrototypes, (p: { name: string }) => p.name).slice(0, 5);

          const sections: string[] = [
            `HOLD ON — confirm with the user before registering "${params.name}":\n`,
          ];

          if (similarProjects.length > 0) {
            sections.push(
              `Similar existing projects:\n` +
              similarProjects.map((m) => {
                const p = m.item as { id: string; name: string };
                return `  - "${p.name}" (ID: ${p.id})`;
              }).join("\n") +
              `\n\nAsk the user: Is this an update to one of these, or a new project?`
            );
          }

          if (guardCollections.length > 0) {
            sections.push(
              `\nNo collection specified. Available collections:\n` +
              guardCollections.map((c: { id: string; name: string }) =>
                `  - ${c.name} (ID: ${c.id})`
              ).join("\n") +
              `\n\nAsk the user: Which collection should "${params.name}" go in?`
            );
          }

          return {
            content: [
              {
                type: "text",
                text: sections.join("\n"),
              },
            ],
          };
        }

        const { source_code, source_filename, ...registerParams } = params;
        const result = await client.registerPrototype(registerParams);
        const protoId = result.prototype?.id;

        // Upload source code if provided
        let sourceInfo = "";
        if (source_code && protoId) {
          try {
            const sourceResult = await client.uploadSource(protoId, source_code, source_filename);
            sourceInfo = `\nSource code uploaded (${sourceResult.source?.size || source_code.length} chars). Colleagues can download it from the prototype page.`;
          } catch (err) {
            sourceInfo = `\nWarning: Source upload failed: ${err instanceof Error ? err.message : "Unknown error"}`;
          }
        }

        const hierarchyNote = !params.parent_project_id
          ? "\n\nNote: This created a standalone prototype. To organize it under a project, use the 'Move to project' option on the VibeSharing dashboard."
          : "";

        // Template nudge for new prototypes
        let registerTemplateNudge = "";
        try {
          const tplResult = await client.listTemplates();
          const activeTpls = ((tplResult as any).templates || []).filter((t: { is_active: boolean }) => t.is_active);
          if (activeTpls.length > 0) {
            const tplNames = activeTpls.map((t: { name: string; slug: string }) => `${t.name} (\`${t.slug}\`)`).join(", ");
            registerTemplateNudge = `\n\n💡 **Design system templates available:** ${tplNames}. Ask the user which template they'd like to use, then call \`get_template\` with the slug to set up the project with that design system.`;
          }
        } catch { /* non-blocking */ }

        return {
          content: [
            {
              type: "text",
              text: `Prototype registered successfully!\n\nName: ${result.prototype?.name || params.name}\nVibeSharing URL: ${VIBESHARING_URL}/dashboard/projects/${protoId}\n${params.external_url ? `Live URL: ${params.external_url}` : ""}${sourceInfo}\n\nYour team can now view and leave feedback on this prototype.${hierarchyNote}${registerTemplateNudge}`,
            },
          ],
        };
      }

      case "list_prototypes": {
        const { search: protoSearch } = (args || {}) as { search?: string };
        const result = await client.listPrototypes();
        let prototypes = result.prototypes || [];

        if (protoSearch) {
          const matches = fuzzyMatch(
            protoSearch,
            prototypes,
            (p: { name: string }) => p.name
          );
          prototypes = matches.map((m) => m.item);
        }

        if (prototypes.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: protoSearch
                  ? `No prototypes matching "${protoSearch}". Use list_prototypes without search to see all.`
                  : "No prototypes found. Use register_prototype to add your first one!",
              },
            ],
          };
        }

        const list = prototypes
          .map(
            (p: { id: string; name: string; external_url?: string; updated_at: string }) =>
              `- ${p.name}\n  ID: ${p.id}\n  ${p.external_url ? `URL: ${p.external_url}\n  ` : ""}Updated: ${new Date(p.updated_at).toLocaleDateString()}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${prototypes.length} prototype(s)${protoSearch ? ` matching "${protoSearch}"` : ""}:\n\n${list}`,
            },
          ],
        };
      }

      case "list_collections": {
        const { search: collSearch } = (args || {}) as { search?: string };
        const result = await client.listCollections();
        let collections = result.collections || [];

        if (collSearch) {
          const matches = fuzzyMatch(
            collSearch,
            collections,
            (c: { name: string }) => c.name
          );
          collections = matches.map((m) => m.item);
        }

        if (collections.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: collSearch
                  ? `No collections matching "${collSearch}". Use list_collections without search to see all.`
                  : "No collections found. Create one in the VibeSharing dashboard first.",
              },
            ],
          };
        }

        const list = collections
          .map(
            (c: { id: string; name: string; description?: string }) =>
              `- ${c.name}\n  ID: ${c.id}${c.description ? `\n  ${c.description}` : ""}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${collections.length} collection(s)${collSearch ? ` matching "${collSearch}"` : ""}:\n\n${list}`,
            },
          ],
        };
      }

      case "get_feedback": {
        const { project_id, author, status: statusFilter, priority: priorityFilter, assigned_to: assignedToFilter } = args as {
          project_id: string;
          author?: string;
          status?: string;
          priority?: string;
          assigned_to?: string;
        };
        const result = await client.getFeedback(project_id, {
          status: statusFilter,
          priority: priorityFilter,
          assigned_to: assignedToFilter,
        });
        const feedback: FeedbackItem[] = result.feedback || [];

        if (feedback.length === 0) {
          const filterNote = statusFilter || priorityFilter || assignedToFilter
            ? " matching your filters"
            : "";
          return {
            content: [
              {
                type: "text",
                text: `No feedback${filterNote} for this prototype. Share it with your team to get their thoughts!`,
              },
            ],
          };
        }

        const groups = groupFeedbackByAuthor(feedback);

        // No author — roll up by person so the owner can pick whose feedback to
        // walk through.
        if (!author) {
          return {
            content: [{ type: "text", text: formatFeedbackRollup(feedback) }],
          };
        }

        const match = resolveFeedbackAuthor(author, groups);
        if (!match) {
          return {
            content: [
              {
                type: "text",
                text:
                  `No feedback from anyone matching "${author}". ` +
                  `People who left feedback: ${[...groups.keys()].join(", ")}.`,
              },
            ],
          };
        }
        if ("ambiguous" in match) {
          return {
            content: [
              {
                type: "text",
                text: `"${author}" matches more than one person: ${match.ambiguous.join(", ")}. Ask which one.`,
              },
            ],
          };
        }

        const queueItems = groups.get(match.author)!;
        return {
          content: [
            {
              type: "text",
              text: formatAuthorQueue(match.author, queueItems),
            },
            ...(await buildScreenshotBlocks(queueItems)),
          ],
        };
      }

      case "triage_feedback": {
        const { feedback_ids, status: newStatus, priority: newPriority, assigned_to: newAssignee, resolution_note } = args as {
          feedback_ids: string[];
          status?: string;
          priority?: string;
          assigned_to?: string;
          resolution_note?: string;
        };

        if (!feedback_ids || feedback_ids.length === 0) {
          return {
            content: [{ type: "text", text: "Error: feedback_ids array is required" }],
          };
        }

        const updates: { status?: string; priority?: string | null; assigned_to?: string | null; resolution_note?: string } = {};
        if (newStatus) updates.status = newStatus;
        if (newPriority !== undefined) updates.priority = newPriority;
        if (newAssignee !== undefined) updates.assigned_to = newAssignee || null;
        if (resolution_note) updates.resolution_note = resolution_note;

        const result = await client.triageFeedback(feedback_ids, updates);

        const changes = [];
        if (newStatus) changes.push(`status → ${newStatus}`);
        if (newPriority) changes.push(`priority → ${newPriority}`);
        if (newAssignee !== undefined) changes.push(newAssignee ? `assigned → ${newAssignee}` : "unassigned");
        if (resolution_note) changes.push(`note: "${resolution_note}"`);

        return {
          content: [
            {
              type: "text",
              text: `Updated ${feedback_ids.length} feedback item(s): ${changes.join(", ")}`,
            },
          ],
        };
      }

      case "close_feedback_loop": {
        const { project_id, resolutions, deploy_url } = args as {
          project_id: string;
          resolutions: Array<{ feedback_id: string; status: string; note: string }>;
          deploy_url?: string;
        };

        if (!resolutions || resolutions.length === 0) {
          return {
            content: [{ type: "text", text: "Error: At least one resolution is required." }],
          };
        }

        // Step 1: Resolve each feedback item with its note
        const resolvedIds: string[] = [];
        const errors: string[] = [];

        for (const res of resolutions) {
          try {
            await client.triageFeedback(
              [res.feedback_id],
              {
                status: res.status,
                resolution_note: res.note,
              }
            );
            resolvedIds.push(res.feedback_id);
          } catch (err) {
            errors.push(`Failed to update ${res.feedback_id}: ${err}`);
          }
        }

        // Step 2: Notify stakeholders
        let notifyResult = { notified: 0, emailed: 0, stakeholders: 0 };
        if (resolvedIds.length > 0) {
          try {
            notifyResult = await client.notifyFeedbackResolved(
              project_id,
              resolvedIds,
              deploy_url
            );
          } catch (err) {
            errors.push(`Notification failed: ${err}`);
          }
        }

        const statusLabels: Record<string, string> = {
          resolved: "Resolved",
          wont_fix: "Won't fix",
          deferred: "Deferred",
          in_progress: "In progress",
        };

        const lines = [
          `✅ Feedback loop closed — ${resolvedIds.length} item${resolvedIds.length === 1 ? "" : "s"} updated:`,
          "",
          ...resolutions.map((r, i) => {
            const label = statusLabels[r.status] || r.status;
            const success = resolvedIds.includes(r.feedback_id) ? "✓" : "✗";
            return `  ${success} [${label}] ${r.note}`;
          }),
        ];

        if (notifyResult.stakeholders > 0) {
          lines.push(
            "",
            `📬 ${notifyResult.stakeholders} stakeholder${notifyResult.stakeholders === 1 ? "" : "s"} notified (${notifyResult.emailed} email${notifyResult.emailed === 1 ? "" : "s"} sent)`,
            "Each stakeholder received a personalized digest showing what happened to their specific feedback."
          );
        }

        if (errors.length > 0) {
          lines.push("", `⚠️ ${errors.length} error(s):`, ...errors.map(e => `  - ${e}`));
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }

      case "sync_context": {
        const { project_id, content } = args as {
          project_id: string;
          content: string;
        };
        await client.syncContext(project_id, content);
        return {
          content: [
            {
              type: "text",
              text: `Context synced successfully to VibeSharing!\n\nProject ID: ${project_id}\nContent length: ${content.length} characters\n\nThis context will be available to team members viewing the prototype.`,
            },
          ],
        };
      }

      case "verify_token": {
        const result = await client.verifyToken();
        if (result.valid) {
          return {
            content: [
              {
                type: "text",
                text: `Token is valid! Connected to ${VIBESHARING_URL}\n\nMCP server version: ${CURRENT_VERSION}\nYour organization has ${result.prototypeCount} prototype(s).`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Token is invalid: ${result.error}\n\nGet a new deploy token from VibeSharing → Dashboard → Account Settings.\nThen update your MCP config:\n  claude mcp remove vibesharing\n  claude mcp add vibesharing -e VIBESHARING_TOKEN=vs_YOUR_NEW_TOKEN -- node /path/to/mcp-server/dist/index.js`,
              },
            ],
            isError: true,
          };
        }
      }

      case "upload_source": {
        const { prototype_id, source_code, filename, storage_option } = args as {
          prototype_id: string;
          source_code: string;
          filename?: string;
          storage_option?: string;
        };

        const result = await client.uploadSource(prototype_id, source_code, filename, storage_option);

        return {
          content: [
            {
              type: "text",
              text: `Source code uploaded successfully!\n\nPrototype ID: ${prototype_id}\nFilename: ${result.source?.filename || filename || "page.tsx"}\nSize: ${result.source?.size || source_code.length} characters\nStorage: ${result.source?.storage_option || storage_option || "permanent"}\n\nColleagues can download this from: ${VIBESHARING_URL}/dashboard/projects/${prototype_id}`,
            },
          ],
        };
      }

      case "share_html": {
        const {
          html: shareHtmlParam,
          file_path: shareFilePath,
          name: shareName,
          prototype_id: shareProtoId,
          collection_id: shareCollId,
        } = args as {
          html?: string;
          file_path?: string;
          name: string;
          prototype_id?: string;
          collection_id?: string;
        };

        // Resolve HTML content from either inline or file path
        let shareHtml = shareHtmlParam;
        let bundledAssets = 0;
        if (!shareHtml && shareFilePath) {
          try {
            shareHtml = readFileSync(shareFilePath, "utf-8");
          } catch (err) {
            return {
              content: [{ type: "text", text: `Error reading file: ${err instanceof Error ? err.message : "Unknown error"}` }],
              isError: true,
            };
          }

          // Auto-bundle: inline relative CSS, SVG, and images so the HTML is self-contained
          const htmlDir = shareFilePath.substring(0, shareFilePath.lastIndexOf("/")) || ".";

          // Inline CSS <link> tags
          shareHtml = shareHtml.replace(
            /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
            (_match: string, href: string) => {
              if (href.startsWith("http://") || href.startsWith("https://")) return _match;
              try {
                const cssPath = join(htmlDir, href);
                const css = readFileSync(cssPath, "utf-8");
                bundledAssets++;
                return `<style>/* ${href} */\n${css}</style>`;
              } catch {
                return _match; // Keep original if file not found
              }
            }
          );

          // Inline SVG <img> tags as inline SVG elements
          shareHtml = shareHtml.replace(
            /<img\s+[^>]*src=["']([^"']+\.svg)["'][^>]*\/?>/gi,
            (_match: string, src: string) => {
              if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) return _match;
              try {
                const svgPath = join(htmlDir, src);
                const svg = readFileSync(svgPath, "utf-8");
                // Extract class/style/alt from original img tag
                const classMatch = _match.match(/class=["']([^"']*)["']/);
                const styleMatch = _match.match(/style=["']([^"']*)["']/);
                let inlineSvg = svg.trim();
                if (classMatch) inlineSvg = inlineSvg.replace("<svg", `<svg class="${classMatch[1]}"`);
                if (styleMatch) inlineSvg = inlineSvg.replace("<svg", `<svg style="${styleMatch[1]}"`);
                bundledAssets++;
                return inlineSvg;
              } catch {
                return _match;
              }
            }
          );

          // Inline PNG/JPG/GIF/WEBP as base64 data URIs
          shareHtml = shareHtml.replace(
            /<img\s+[^>]*src=["']([^"']+\.(png|jpg|jpeg|gif|webp))["'][^>]*\/?>/gi,
            (_match: string, src: string, ext: string) => {
              if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) return _match;
              try {
                const imgPath = join(htmlDir, src);
                const imgData = readFileSync(imgPath);
                const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
                const mime = mimeTypes[ext.toLowerCase()] || "image/png";
                const dataUri = `data:${mime};base64,${imgData.toString("base64")}`;
                bundledAssets++;
                return _match.replace(src, dataUri);
              } catch {
                return _match;
              }
            }
          );
        }

        if (!shareHtml || !shareName) {
          return {
            content: [{ type: "text", text: "Error: Either html or file_path is required, along with name." }],
            isError: true,
          };
        }

        // Check bundled size before sending
        const bundledSizeKB = Math.round(Buffer.byteLength(shareHtml, "utf-8") / 1024);
        if (bundledSizeKB > 4000) {
          return {
            content: [{ type: "text", text: `Error: The bundled HTML is ${bundledSizeKB}KB, which exceeds the 4MB upload limit. This usually means large images were inlined as base64.\n\nTo fix this:\n- Optimize images before sharing (compress PNGs/JPGs)\n- Host large images externally and use absolute URLs\n- Remove unused assets from the HTML` }],
            isError: true,
          };
        }
        if (bundledSizeKB > 2000) {
          console.error(`[vibesharing] Warning: bundled HTML is ${bundledSizeKB}KB — approaching 4MB limit`);
        }

        const shareResult = await client.deployStatic({
          html: shareHtml,
          prototypeName: shareName,
          prototypeId: shareProtoId,
          collectionId: shareCollId,
        });

        // Auto-register a visible prototype version under the project so it
        // shows up in the dashboard hierarchy (not just "No prototypes yet")
        let childId: string | null = null;
        if (shareResult.prototypeId && !shareProtoId) {
          try {
            const childResult = await client.registerPrototype({
              name: shareName,
              external_url: shareResult.viewUrl,
              parent_project_id: shareResult.prototypeId,
              collection_id: shareCollId,
            });
            childId = childResult.prototype?.id || null;
          } catch (err) {
            console.error("Auto-register child prototype failed (non-blocking):", err);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Shared!\n\nView URL: ${shareResult.viewUrl}\nPrototype ID: ${childId || shareResult.prototypeId}\n\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${shareResult.prototypeId}\n\nThis is a lightweight static share — no hosting project, no GitHub repo, no build step. The feedback widget is included automatically.${bundledAssets > 0 ? `\n\n${bundledAssets} asset(s) auto-bundled (CSS, SVGs, images inlined into the HTML).` : ""}\n\n${shareResult.shareSummary ? `Share this with your team:\n${shareResult.shareSummary}` : ""}`,
            },
          ],
        };
      }

      case "deploy_prototype": {
        const {
          code,
          files: protoInlineFiles,
          file_paths: protoFilePaths,
          name,
          prototype_id,
          collection_id: protoCollectionId,
          parent_project_id: protoParentId,
          deploy_name: protoDeployName,
          commit_message: protoCommitMsg,
          summary: protoSummary,
          version_label: protoVersionLabel,
          template: deployTemplate,
        } = args as {
          code?: string;
          files?: Array<{ path: string; content: string }>;
          file_paths?: Array<{ path: string; deploy_path?: string }>;
          name: string;
          prototype_id?: string;
          collection_id?: string;
          parent_project_id?: string;
          deploy_name?: string;
          commit_message?: string;
          summary?: string;
          version_label?: string;
          template?: string;
        };

        // Build file list from code, files, or file_paths
        const deployFiles: Array<{ path: string; content: string }> = [];

        if (protoInlineFiles && protoInlineFiles.length > 0) {
          deployFiles.push(...protoInlineFiles);
        }

        if (protoFilePaths && protoFilePaths.length > 0) {
          for (const fp of protoFilePaths) {
            try {
              const content = readFileSync(fp.path, "utf-8");
              deployFiles.push({ path: fp.deploy_path || basename(fp.path), content });
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error reading file "${fp.path}": ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        }

        if (deployFiles.length === 0 && code) {
          deployFiles.push({ path: "app/page.tsx", content: code });
        }

        if (deployFiles.length === 0) {
          return {
            content: [{ type: "text", text: "Error: Provide code, files, or file_paths to deploy." }],
            isError: true,
          };
        }

        // Guardrail: if no existing prototype AND no collection specified, bounce back
        // Skip if the caller already knows where to put it (collection_id or parent_project_id)
        if (!prototype_id && !protoCollectionId && !protoParentId) {
          const [guardCollResult, guardProtoResult] = await Promise.all([
            client.listCollections(),
            client.listPrototypes(),
          ]);
          const guardCollections = guardCollResult.collections || [];
          const guardPrototypes = guardProtoResult.prototypes || [];

          const similarProjects = fuzzyMatch(name, guardPrototypes, (p: { name: string }) => p.name).slice(0, 5);

          const sections: string[] = [
            `HOLD ON — confirm with the user before deploying "${name}":\n`,
          ];

          if (similarProjects.length > 0) {
            sections.push(
              `Similar existing projects:\n` +
              similarProjects.map((m) => {
                const p = m.item as { id: string; name: string; external_url?: string };
                return `  - "${p.name}" (ID: ${p.id})${p.external_url ? ` → ${p.external_url}` : ""}`;
              }).join("\n") +
              `\n\nAsk the user: Is this an UPDATE to one of these, or a NEW project?`
            );
          }

          if (guardCollections.length > 0) {
            sections.push(
              `\nAvailable collections:\n` +
              guardCollections.map((c: { id: string; name: string }) =>
                `  - ${c.name} (ID: ${c.id})`
              ).join("\n") +
              `\n\nAsk the user: Which collection should this go in?`
            );
          }

          const suggestedSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          sections.push(
            `\nSuggested deploy name: "${suggestedSlug}"\n` +
            `Ask the user: Do you want to use this name or choose a different one?`
          );

          return {
            content: [
              {
                type: "text",
                text: sections.join("\n"),
              },
            ],
          };
        }

        // If no prototype_id, first register a new prototype
        let prototypeId = prototype_id;
        if (!prototypeId) {
          const registered = await client.registerPrototype({
            name,
            collection_id: protoCollectionId,
            parent_project_id: protoParentId,
          });
          prototypeId = registered.prototype?.id;
        }

        if (!prototypeId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Could not create prototype. Please try again.",
              },
            ],
            isError: true,
          };
        }

        // Deploy via git path (GitHub repo + Vercel) so every prototype gets
        // version history, forkability, and push-to-deploy
        const result = await client.deployFiles(
          prototypeId,
          deployFiles,
          protoCommitMsg || "Deploy via MCP",
          protoDeployName,
          deployTemplate,
          protoSummary,
          protoVersionLabel,
        );

        // Check for existing manual topics to decide whether to prompt for feedback
        let hasManualTopics = false;
        try {
          const existingTopics = await client.listFeedbackTopics(prototypeId);
          hasManualTopics = (existingTopics.topics || []).some((t: { source: string }) => t.source === "manual");
        } catch { /* non-blocking */ }

        const feedbackPrompt = buildFeedbackPrompt(prototypeId, hasManualTopics);

        // Surface build status clearly
        const protoBuildFailed = result.buildError || result.success === false;
        const protoBuildVerified = result.buildVerified === true;

        let protoStatusLine: string;
        if (protoBuildFailed) {
          protoStatusLine = `BUILD FAILED — ${result.buildError || result.error || "Build script returned non-zero exit code"}.\nThe live URL may still be serving a previous version. Fix the build errors and deploy again.`;
        } else if (protoBuildVerified) {
          protoStatusLine = `Deployed ${deployFiles.length} file${deployFiles.length === 1 ? "" : "s"} successfully!`;
        } else {
          protoStatusLine = `Deployed ${deployFiles.length} file${deployFiles.length === 1 ? "" : "s"} — build in progress. If it fails, the live URL will serve the previous version. Run 'diagnose' to check status.`;
        }

        // Soft nudge: re-deploys benefit a lot from a one-line version_label.
        // Without one, the Versions panel just shows v1/v2/v3 and reviewers
        // can't tell which version is which.
        const wasReDeploy = !!prototype_id;
        const labelNudge = wasReDeploy && !protoVersionLabel && !protoBuildFailed
          ? `\n\n💡 **Tip:** No \`version_label\` was provided. On re-deploys, a short label like \`"dark theme"\` or \`"tightened spacing"\` makes the Versions panel scannable — reviewers can tell v3 apart from v5 without diff'ing files. Ask the user what to call this version next time.`
          : "";

        // Template nudge: if no template was used and org has templates, suggest it
        let templateNudge = "";
        if (!deployTemplate && !protoBuildFailed) {
          try {
            const tplResult = await client.listTemplates();
            const activeTpls = ((tplResult as any).templates || []).filter((t: { is_active: boolean }) => t.is_active);
            if (activeTpls.length > 0) {
              const tplNames = activeTpls.map((t: { name: string; slug: string }) => `${t.name} (\`${t.slug}\`)`).join(", ");
              templateNudge = `\n\n💡 **Design system available:** Your org has ${activeTpls.length} template${activeTpls.length === 1 ? "" : "s"}: ${tplNames}. Next time, ask the user if they'd like to use one of these before coding — it'll make the prototype match your org's brand from the start.`;
            }
          } catch { /* non-blocking */ }
        }

        return {
          content: [
            {
              type: "text",
              text: `${protoStatusLine}\n\n${result.deployName ? `Deploy name: ${result.deployName}\n` : ""}${result.shareUrl ? `Share URL: ${result.shareUrl}\n` : ""}Live URL: ${result.deployUrl || "Deploying..."}\nRepo: ${result.repoUrl || "N/A"}\n\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${prototypeId}\n\n${feedbackPrompt}${labelNudge}${templateNudge}${result.repoUrl ? `\n\nLocal sync check: this prototype's canonical repo is ${result.repoUrl}. If the user is working from a local clone, run \`git remote get-url origin\` — if it doesn't match, offer to run \`git remote set-url origin ${result.repoUrl}\` so future pushes deploy. (Common after re-cloning on a second machine.)` : ""}\n\nIMPORTANT: Update CLAUDE.md now with what was built, key decisions, and current state.`,
            },
          ],
          ...(protoBuildFailed ? { isError: true } : {}),
        };
      }

      case "create_collection": {
        const { name: collName, description: collDesc } = args as {
          name: string;
          description?: string;
        };

        const collResult = await client.createCollection({
          name: collName,
          description: collDesc,
        });
        const coll = collResult.collection;

        return {
          content: [
            {
              type: "text",
              text: `Collection created!\n\nName: ${coll.name}\nID: ${coll.id}\nSlug: ${coll.slug}\n\nYou can now use this collection_id when registering prototypes with register_prototype.`,
            },
          ],
        };
      }

      case "create_campaign": {
        const { preset, ...campaignArgs } = args as {
          name: string;
          goal?: string;
          preset?: string;
          feedback_mode?: "guided" | "open";
          feedback_layout?: "new_window" | "side_rail";
          variant_group?: string;
          randomize_order?: boolean;
          expires_in_days?: number;
          questions?: unknown[];
          prototypes?: Array<{ prototype_id: string; about?: string; questions?: unknown[] }>;
        };

        if (preset === "critique" && (!campaignArgs.questions || campaignArgs.questions.length === 0)) {
          campaignArgs.questions = CRITIQUE_STUDY_QUESTIONS;
        }

        const result = await client.createCampaign(campaignArgs);
        const c = result.campaign;
        const attached: string[] = result.attached || [];
        const skipped: string[] = result.skipped || [];

        let text = `Draft research campaign created!\n\nName: ${c.name}\nStatus: ${c.status} (not yet open)\n`;
        if (attached.length) text += `Prototypes: ${attached.join(", ")}\n`;
        if (skipped.length) text += `⚠ Skipped (not found in your org): ${skipped.join(", ")}\n`;
        if (preset === "critique") text += `Questions: structured critique preset (${CRITIQUE_STUDY_QUESTIONS.length} prompts)\n`;
        text += `\nReview & open it (opening applies access gating + invites your reviewers):\n${result.dashboardUrl}\n\nPortal link (after you open it): ${result.portalUrl}`;

        return { content: [{ type: "text", text }] };
      }

      case "deploy_files": {
        const { prototype_id: deployProtoId, files: inlineFiles, file_paths: filePaths, commit_message, summary: filesSummary, version_label: filesVersionLabel, deploy_name: deployName, template: filesTemplate } = args as {
          prototype_id: string;
          files?: Array<{ path: string; content: string }>;
          file_paths?: Array<{ path: string; deploy_path?: string }>;
          commit_message?: string;
          summary?: string;
          version_label?: string;
          deploy_name?: string;
          template?: string;
        };

        // Build combined files array from inline files and file paths
        const files: Array<{ path: string; content: string }> = [...(inlineFiles || [])];

        if (filePaths && filePaths.length > 0) {
          for (const fp of filePaths) {
            try {
              const content = readFileSync(fp.path, "utf-8");
              const deployPath = fp.deploy_path || basename(fp.path);
              files.push({ path: deployPath, content });
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error reading file "${fp.path}": ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        }

        if (files.length === 0) {
          return {
            content: [{ type: "text" as const, text: "Error: Either files or file_paths is required." }],
            isError: true,
          };
        }

        // Guardrail: if total payload is large, suggest import_repo instead
        const totalSize = files.reduce((sum, f) => sum + (f.content?.length || 0), 0);
        if (totalSize > 100_000) {
          return {
            content: [{
              type: "text" as const,
              text: `This deploy has ${files.length} files totaling ~${Math.round(totalSize / 1024)}KB — too large for inline deployment.\n\nUse \`import_repo\` instead if the code is in a GitHub repo. It fetches files server-side with no size limits and supports branch selection.\n\nIf the code isn't in a repo yet, commit and push it to GitHub first, then use \`import_repo\`.`,
            }],
            isError: true,
          };
        }

        // Pre-deploy validation: check if package.json has a framework or build script
        const pkgFile = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json"));
        if (pkgFile) {
          try {
            const pkgData = JSON.parse(pkgFile.content);
            const allDeps = { ...pkgData.dependencies, ...pkgData.devDependencies };
            const knownFrameworks = ["next", "vite", "nuxt", "astro", "gatsby", "react-scripts", "remix", "svelte", "@sveltejs/kit"];
            const hasFramework = knownFrameworks.some(f => f in allDeps);
            const hasBuild = !!pkgData.scripts?.build;
            if (!hasFramework && !hasBuild) {
              return {
                content: [{
                  type: "text",
                  text: `⚠ Pre-deploy validation failed!\n\nYour package.json has no recognized framework (next, vite, nuxt, astro, gatsby, etc.) and no build script. The build will fail.\n\nFix: Either install a framework (e.g., \`npm install next react react-dom\`) or add a "build" script to package.json, then try deploying again.`,
                }],
                isError: true,
              };
            }
          } catch {
            // If package.json can't be parsed, let it through — the build will catch it
          }
        }

        const deployResult = await client.deployFiles(
          deployProtoId,
          files,
          commit_message || "Deploy via MCP",
          deployName,
          filesTemplate,
          filesSummary,
          filesVersionLabel
        );

        // Feature 1: Auto-sync context if CLAUDE.md or AGENTS.md is present
        let contextSynced = false;
        try {
          const contextFile = files.find(
            (f) => f.path.toLowerCase().endsWith("claude.md") || f.path.toLowerCase().endsWith("agents.md")
          );
          if (contextFile) {
            await client.syncContext(deployProtoId, contextFile.content);
            contextSynced = true;
          }
        } catch (err) {
          console.error("Auto-sync context failed (non-blocking):", err);
        }

        // Feature 2: Auto-generate feedback topics if none exist
        let topicsGenerated = false;
        try {
          const existingTopics = await client.listFeedbackTopics(deployProtoId);
          if (!existingTopics.topics || existingTopics.topics.length === 0) {
            client.generateFeedbackTopics(deployProtoId, [
              { title: "Does this prototype effectively solve the intended problem?", theme: "vision" },
              { title: "What would you change about the interaction design?", theme: "interaction" },
              { title: "Is this ready for the next stage of development?", theme: "feasibility" },
            ]).catch((err: unknown) => console.error("Auto-generate feedback topics failed (non-blocking):", err));
            topicsGenerated = true;
          }
        } catch (err) {
          console.error("Feedback topics check failed (non-blocking):", err);
        }

        // Check if manual topics already exist
        let hasManualTopicsDF = false;
        try {
          const existingTopicsDF = await client.listFeedbackTopics(deployProtoId);
          hasManualTopicsDF = (existingTopicsDF.topics || []).some((t: { source: string }) => t.source === "manual");
        } catch { /* non-blocking */ }

        const feedbackPromptDF = buildFeedbackPrompt(deployProtoId, hasManualTopicsDF);

        const postDeployNotes: string[] = [];
        if (contextSynced) postDeployNotes.push("Context synced from CLAUDE.md.");

        // Surface build status clearly
        const dfBuildFailed = deployResult.buildError || deployResult.success === false;
        const dfBuildVerified = deployResult.buildVerified === true;

        let dfStatusLine: string;
        if (dfBuildFailed) {
          dfStatusLine = `BUILD FAILED — ${deployResult.buildError || deployResult.error || "Build script returned non-zero exit code"}.\nThe live URL may still be serving a previous version. Fix the build errors and deploy again.`;
        } else if (dfBuildVerified) {
          dfStatusLine = `Deployed ${files.length} files successfully!`;
        } else {
          dfStatusLine = `Deployed ${files.length} files — build in progress. If it fails, the live URL will serve the previous version. Run 'diagnose' to check status.`;
        }

        // Soft nudge: deploy_files always re-deploys (prototype_id required),
        // so a missing version_label is always worth flagging.
        const dfLabelNudge = !filesVersionLabel && !dfBuildFailed
          ? `\n\n💡 **Tip:** No \`version_label\` was provided. Re-deploys benefit from a short label like \`"dark theme"\` or \`"tightened spacing"\` so the Versions panel is scannable. Ask the user what to call this version next time.`
          : "";

        // Template nudge: if no template was used and org has templates, suggest it
        let dfTemplateNudge = "";
        if (!filesTemplate && !dfBuildFailed) {
          try {
            const tplResult = await client.listTemplates();
            const activeTpls = ((tplResult as any).templates || []).filter((t: { is_active: boolean }) => t.is_active);
            if (activeTpls.length > 0) {
              const tplNames = activeTpls.map((t: { name: string; slug: string }) => `${t.name} (\`${t.slug}\`)`).join(", ");
              dfTemplateNudge = `\n\n💡 **Design system available:** Your org has ${activeTpls.length} template${activeTpls.length === 1 ? "" : "s"}: ${tplNames}. Next time, ask the user if they'd like to use one of these before coding — it'll make the prototype match your org's brand from the start.`;
            }
          } catch { /* non-blocking */ }
        }

        return {
          content: [
            {
              type: "text",
              text: `${dfStatusLine}\n\n${deployResult.deployName ? `Deploy name: ${deployResult.deployName}\n` : ""}${deployResult.shareUrl ? `Share URL: ${deployResult.shareUrl}\n` : ""}Live URL: ${deployResult.deployUrl || "Deploying..."}\nRepo: ${deployResult.repoUrl || "N/A"}\nCommit: ${deployResult.commitSha || "N/A"}\n\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${deployProtoId}${postDeployNotes.length > 0 ? "\n\n" + postDeployNotes.join("\n") : ""}${dfLabelNudge}${dfTemplateNudge}\n\n${feedbackPromptDF}${deployResult.repoUrl ? `\n\nLocal sync check: this prototype's canonical repo is ${deployResult.repoUrl}. If the user is working from a local clone, run \`git remote get-url origin\` — if it doesn't match, offer to run \`git remote set-url origin ${deployResult.repoUrl}\` so future pushes deploy. (Common after re-cloning on a second machine.)` : ""}\n\nIMPORTANT: Update CLAUDE.md now with what was built, key decisions, and current state.`,
            },
          ],
          ...(dfBuildFailed ? { isError: true } : {}),
        };
      }

      case "import_repo": {
        const {
          repo_url,
          name: importName,
          prototype_id: importProtoId,
          collection_id: importCollectionId,
          parent_project_id: importParentId,
          description: importDesc,
          deploy_name: deployName,
          branch: importBranch,
          entry_point: importEntryPoint,
          version_label: importVersionLabel,
        } = args as {
          repo_url: string;
          name?: string;
          prototype_id?: string;
          collection_id?: string;
          parent_project_id?: string;
          description?: string;
          branch?: string;
          deploy_name?: string;
          entry_point?: string;
          version_label?: string;
        };

        // Guardrail: if no collection and no existing prototype specified, bounce back with options
        if (!importCollectionId && !importProtoId) {
          const [guardCollResult, guardProtoResult] = await Promise.all([
            client.listCollections(),
            client.listPrototypes(),
          ]);
          const guardCollections = guardCollResult.collections || [];
          const guardPrototypes = guardProtoResult.prototypes || [];

          const repoName = repo_url.replace(/\.git$/, "").split("/").pop() || "imported-prototype";
          const suggestedName = importName || repoName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

          // Check for similar existing prototypes
          const similarProjects = importName
            ? fuzzyMatch(importName, guardPrototypes, (p: { name: string }) => p.name).slice(0, 5)
            : [];

          const sections: string[] = [
            `HOLD ON — confirm these details with the user before deploying:\n`,
            `Prototype name: "${suggestedName}"`,
          ];

          if (similarProjects.length > 0) {
            sections.push(
              `\nSimilar existing projects found:\n` +
              similarProjects.map((m) => {
                const p = m.item as { id: string; name: string; external_url?: string };
                return `  - "${p.name}" (ID: ${p.id})${p.external_url ? ` → ${p.external_url}` : ""}`;
              }).join("\n") +
              `\n\nAsk the user: Is this an UPDATE to one of these existing projects, or a NEW project?`
            );
          }

          if (guardCollections.length > 0) {
            sections.push(
              `\nNo collection specified. Available collections:\n` +
              guardCollections.map((c: { id: string; name: string }) =>
                `  - ${c.name} (ID: ${c.id})`
              ).join("\n") +
              `\n\nAsk the user: Which collection should "${suggestedName}" go in?`
            );
          }

          if (!deployName) {
            const suggestedSlug = suggestedName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
            sections.push(
              `\nNo deploy name specified. Suggested: "${suggestedSlug}"\n` +
              `Ask the user: Do you want to use "${suggestedSlug}" or choose a different deploy name?`
            );
          }

          return {
            content: [
              {
                type: "text",
                text: sections.join("\n"),
              },
            ],
          };
        }

        // Auto-create prototype if no ID provided (collection was confirmed above)
        let protoId = importProtoId;
        if (!protoId) {
          // Derive name from repo URL if not provided
          const repoName = repo_url.replace(/\.git$/, "").split("/").pop() || "imported-prototype";
          const protoName = importName || repoName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

          const registered = await client.registerPrototype({
            name: protoName,
            description: importDesc || `Imported from ${repo_url}`,
            external_url: repo_url,
            collection_id: importCollectionId,
            parent_project_id: importParentId,
          });
          protoId = registered.prototype?.id;
        }

        if (!protoId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Could not create prototype. Please try again.",
              },
            ],
            isError: true,
          };
        }

        const importResult = await client.importRepo(protoId, repo_url, deployName, importBranch, importEntryPoint, importVersionLabel);

        // Feature 1: Context sync is handled server-side for repo imports (importContextFiles)

        // Feature 2: Auto-generate feedback topics if none exist
        let importTopicsGenerated = false;
        try {
          const existingTopics = await client.listFeedbackTopics(protoId);
          if (!existingTopics.topics || existingTopics.topics.length === 0) {
            client.generateFeedbackTopics(protoId, [
              { title: "Does this prototype effectively solve the intended problem?", theme: "vision" },
              { title: "What would you change about the interaction design?", theme: "interaction" },
              { title: "Is this ready for the next stage of development?", theme: "feasibility" },
            ]).catch((err: unknown) => console.error("Auto-generate feedback topics failed (non-blocking):", err));
            importTopicsGenerated = true;
          }
        } catch (err) {
          console.error("Feedback topics check failed (non-blocking):", err);
        }

        // Check if manual topics already exist
        let hasManualTopicsIR = false;
        try {
          const existingTopicsIR = await client.listFeedbackTopics(protoId);
          hasManualTopicsIR = (existingTopicsIR.topics || []).some((t: { source: string }) => t.source === "manual");
        } catch { /* non-blocking */ }

        const feedbackPromptIR = buildFeedbackPrompt(protoId, hasManualTopicsIR);

        const importPostNotes: string[] = [];
        if (importResult.indexNote) importPostNotes.push(`⚠ ${importResult.indexNote}`);

        // Surface build status clearly
        const buildFailed = importResult.buildStatus === "error" || importResult.success === false;
        const buildInProgress = importResult.buildStatus === "building";

        let statusLine: string;
        if (buildFailed) {
          statusLine = `BUILD FAILED — ${importResult.buildError || importResult.buildWarning || "Build script returned non-zero exit code"}.\nThe live URL may still be serving a previous version. Fix the build errors and re-import.`;
        } else if (buildInProgress) {
          statusLine = `Repo imported — build still in progress. If it fails, the live URL will serve the previous version. Run 'diagnose' to check status.`;
        } else {
          statusLine = `Repo imported and deployed successfully!`;
        }

        // Soft nudge: re-imports without a version_label leave the Versions
        // panel showing v1/v2/v3 with no headline. Only nag when this was a
        // re-import (existing prototype_id) — first imports get the
        // prototype's name as their banner anyway.
        const importLabelNudge = importProtoId && !importVersionLabel && !buildFailed
          ? `\n\n💡 **Tip:** No \`version_label\` was provided. On re-imports, a short label like \`"fixed nav spacing"\` or \`"merged dashboard branch"\` makes the Versions panel scannable. Ask the user what to call this version next time.`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `${statusLine}\n\n${importResult.deployName ? `Deploy name: ${importResult.deployName}\n` : ""}${importResult.shareUrl ? `Share URL: ${importResult.shareUrl}\n` : ""}Live URL: ${importResult.deployUrl}\nRepo: ${importResult.repoUrl}\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${protoId}\nFiles imported: ${importResult.fileCount || "unknown"}${importResult.changelog ? `\n\nWhat changed:\n${importResult.changelog}` : ""}${importPostNotes.length > 0 ? "\n\n" + importPostNotes.join("\n") : ""}${importLabelNudge}${importResult.repoUrl ? `\n\nLocal sync check: this prototype's canonical repo is ${importResult.repoUrl} — distinct from whatever GitHub repo was just imported. If the user wants to continue iterating locally, they should clone the canonical repo (not the original), so pushes deploy. Run \`git remote get-url origin\` to check, then \`git remote set-url origin ${importResult.repoUrl}\` if needed.` : ""}\n\n${feedbackPromptIR}`,
            },
          ],
          ...(buildFailed ? { isError: true } : {}),
        };
      }

      case "resolve_target": {
        const {
          collection_name: collName,
          project_name: projName,
          deploy_name: desiredDeployName,
        } = (args || {}) as {
          collection_name?: string;
          project_name?: string;
          deploy_name?: string;
        };

        // Fetch collections and prototypes in parallel
        const [collResult, protoResult] = await Promise.all([
          client.listCollections(),
          client.listPrototypes(),
        ]);
        const allCollections = collResult.collections || [];
        const allPrototypes = protoResult.prototypes || [];

        const sections: string[] = [];

        // --- Collection matching ---
        if (collName) {
          const collMatches = fuzzyMatch(
            collName,
            allCollections,
            (c: { name: string }) => c.name
          );

          if (collMatches.length === 0) {
            sections.push(
              `COLLECTION: No match for "${collName}".\n` +
              `Available collections:\n` +
              allCollections
                .map((c: { id: string; name: string }) => `  - ${c.name} (ID: ${c.id})`)
                .join("\n") +
              `\n\nAsk the user: Which collection should this go in? Or create a new one?`
            );
          } else if (collMatches[0].score >= 0.9) {
            const best = collMatches[0].item as { id: string; name: string };
            sections.push(
              `COLLECTION: Matched "${collName}" → "${best.name}" (ID: ${best.id})`
            );

            // Show prototypes in this collection for context
            const collProtos = allPrototypes.filter(
              (p: { folder_id?: string }) => p.folder_id === best.id
            );
            if (collProtos.length > 0) {
              sections.push(
                `Existing projects in "${best.name}":\n` +
                collProtos
                  .map(
                    (p: { id: string; name: string; external_url?: string }) =>
                      `  - ${p.name} (ID: ${p.id})${p.external_url ? ` → ${p.external_url}` : ""}`
                  )
                  .join("\n") +
                `\n\nAsk the user: Should this be a NEW project in "${best.name}", or an update to one of these existing projects?`
              );
            }
          } else {
            // Fuzzy matches but not confident
            sections.push(
              `COLLECTION: "${collName}" is not an exact match. Did the user mean one of these?\n` +
              collMatches
                .slice(0, 5)
                .map(
                  (m) => {
                    const c = m.item as { id: string; name: string };
                    return `  - "${c.name}" (ID: ${c.id}, confidence: ${Math.round(m.score * 100)}%)`;
                  }
                )
                .join("\n") +
              `\n\nAsk the user to confirm which collection.`
            );
          }
        } else {
          // No collection name given — show all options
          if (allCollections.length > 0) {
            sections.push(
              `COLLECTION: Not specified. Available collections:\n` +
              allCollections
                .map((c: { id: string; name: string }) => `  - ${c.name} (ID: ${c.id})`)
                .join("\n") +
              `\n\nAsk the user: Which collection should this prototype go in? Or create a new one?`
            );
          } else {
            sections.push(
              `COLLECTION: No collections exist yet. Ask the user if they want to create one.`
            );
          }
        }

        // --- Project matching ---
        if (projName) {
          const projMatches = fuzzyMatch(
            projName,
            allPrototypes,
            (p: { name: string }) => p.name
          );

          if (projMatches.length === 0) {
            sections.push(
              `PROJECT: No match for "${projName}". This will be a new project.\n` +
              `Ask the user to confirm the name for the new project.`
            );
          } else if (projMatches[0].score >= 0.9) {
            const best = projMatches[0].item as { id: string; name: string; external_url?: string };
            sections.push(
              `PROJECT: Matched "${projName}" → "${best.name}" (ID: ${best.id})${best.external_url ? `\n  Current URL: ${best.external_url}` : ""}\n\n` +
              `Ask the user: Deploy as an UPDATE to "${best.name}", or create a NEW project?`
            );
          } else {
            sections.push(
              `PROJECT: "${projName}" is not an exact match. Close matches:\n` +
              projMatches
                .slice(0, 5)
                .map(
                  (m) => {
                    const p = m.item as { id: string; name: string };
                    return `  - "${p.name}" (ID: ${p.id}, confidence: ${Math.round(m.score * 100)}%)`;
                  }
                )
                .join("\n") +
              `\n\nAsk the user: Is this an update to one of these, or a new project?`
            );
          }
        }

        // --- Deploy name ---
        if (desiredDeployName) {
          const slug = desiredDeployName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-{2,}/g, "-")
            .replace(/^-+|-+$/g, "");
          sections.push(
            `DEPLOY NAME: "${slug}"\n` +
            `(Availability will be checked at deploy time. If taken, a suffix will be added.)\n\n` +
            `Ask the user: Do you want to name this deployment "${slug}"?`
          );
        } else {
          sections.push(
            `DEPLOY NAME: Not specified.\n` +
            `Ask the user: Do you want a custom deploy name (e.g., "erg-v3-teams"), or auto-generate one?`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: sections.join("\n\n---\n\n"),
            },
          ],
        };
      }

      // ---- list_templates ----
      case "list_templates": {
        const { active_only = true } = args as { active_only?: boolean };
        const result = await client.listTemplates();
        const templates = ((result as any).templates || []).filter(
          (t: { is_active: boolean }) => !active_only || t.is_active
        );

        if (templates.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No templates found for your organization.\n\nTemplates define your design system — CSS variables, typography, spacing, and AI instructions that are injected at deploy time.\n\nCreate templates at: vibesharing.app/dashboard/settings/templates",
            }],
          };
        }

        const lines = templates.map((t: { name: string; slug: string; description: string | null; is_active: boolean; theme_css: string; design_instructions: string | null; preview_url: string | null }) => {
          const varCount = (t.theme_css.match(/--[\w-]+:/g) || []).length;
          const hasInstructions = !!t.design_instructions && t.design_instructions.length > 50;
          const hasPreview = !!t.preview_url;
          return `**${t.name}** (slug: \`${t.slug}\`)${!t.is_active ? " [INACTIVE]" : ""}\n  ${t.description || "No description"}\n  ${varCount} CSS variables${hasInstructions ? " + design instructions" : ""}${hasPreview ? " + reference screenshot" : ""}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Design System Templates (${templates.length})\n\n${lines.join("\n\n")}\n\n---\n**Want to use one?** Ask the user which template they'd like, then call \`get_template\` with the slug to pull the full CSS variables and design instructions into your project. This ensures every component matches the org's design system from the start.`,
          }],
        };
      }

      // ---- get_template ----
      case "get_template": {
        const { template: templateIdOrSlug } = args as { template: string };

        try {
          const result = await client.getTemplate(templateIdOrSlug);
          const t = (result as any).template;

          if (!t) {
            return {
              content: [{
                type: "text" as const,
                text: `Template "${templateIdOrSlug}" not found. Use \`list_templates\` to see available templates.`,
              }],
              isError: true,
            };
          }

          // Use merged fields if this is a variant with a parent, otherwise raw fields
          const css = t.merged_theme_css || t.theme_css;
          const instructions = t.merged_design_instructions || t.design_instructions;
          const starter = t.merged_starter_page || t.starter_page;

          const varCount = (css.match(/--[\w-]+:/g) || []).length;

          let text = `## Template: ${t.name}\n\n`;
          text += `**Slug:** \`${t.slug}\`\n`;
          text += `**Status:** ${t.is_active ? "Active" : "Inactive"}\n`;
          text += `**CSS Variables:** ${varCount}\n`;
          if (t.parent_template_id) {
            text += `**Extends:** base template (structural tokens inherited)\n`;
          }
          text += `\n`;

          if (t.description) {
            text += `${t.description}\n\n`;
          }

          text += `### CSS Variables\n\n\`\`\`css\n${css}\n\`\`\`\n\n`;

          if (instructions) {
            text += `### Design Instructions\n\n${instructions}\n\n`;
          }

          if (starter) {
            text += `### Starter Page\n\n\`\`\`tsx\n${starter}\n\`\`\`\n\n`;
          }

          if (t.preview_url) {
            text += `### Reference Screenshot\n\nA reference screenshot is attached below. Use it as a visual target — the prototype should match this layout, spacing, and visual hierarchy.\n\n`;
          }

          text += `---\n## How to use this template\n\n`;
          text += `1. **Write the CSS variables** into your project's \`globals.css\` (or equivalent) under \`:root { }\` so every component picks them up automatically.\n`;
          text += `2. **Write the design instructions** into your project's \`CLAUDE.md\` so they persist across sessions and every future edit stays on-brand.\n`;
          text += `3. **Use the CSS variables** (e.g., \`var(--color-primary)\`) in all components instead of hardcoded colors/fonts.\n`;
          text += `4. **When ready to deploy**, pass \`template: "${t.slug}"\` to \`deploy_files\` or \`deploy_prototype\` — this re-applies the template server-side to catch any drift.\n`;

          const contentBlocks: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
            { type: "text", text },
          ];

          // Fetch and attach preview image if available
          if (t.preview_url) {
            try {
              const imgRes = await fetch(t.preview_url, { signal: AbortSignal.timeout(5000) });
              if (imgRes.ok) {
                const imgBuffer = await imgRes.arrayBuffer();
                const base64 = Buffer.from(imgBuffer).toString("base64");
                const mimeType = imgRes.headers.get("content-type") || "image/png";
                contentBlocks.push({ type: "image", data: base64, mimeType });
              }
            } catch {
              // Non-blocking — skip image if fetch fails
            }
          }

          return { content: contentBlocks } as { content: { type: string; text: string }[]; isError?: boolean };
        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: `Error retrieving template: ${error.message}`,
            }],
            isError: true,
          };
        }
      }

      // ---- quick_prototype ----
      case "quick_prototype": {
        const {
          description: protoDescription,
          template: templateSlug,
          name: protoName,
          collection_id,
          parent_project_id,
        } = args as {
          description: string;
          template?: string;
          name?: string;
          collection_id?: string;
          parent_project_id?: string;
        };

        if (!protoDescription) {
          return { content: [{ type: "text" as const, text: "Please provide a description of what the prototype should show." }], isError: true };
        }

        const templatesResult = await client.listTemplates();
        const activeTemplates = ((templatesResult as any).templates || []).filter(
          (t: { is_active: boolean }) => t.is_active
        );

        if (activeTemplates.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No active templates found for your org. quick_prototype requires at least one template.\n\nCreate templates at: vibesharing.app/dashboard/settings/templates\nOr use `deploy_prototype` or `deploy_files` for unthemed deploys.",
            }],
            isError: true,
          };
        }

        let selectedTemplate = activeTemplates[0];
        if (templateSlug) {
          const match = activeTemplates.find((t: { slug: string }) => t.slug === templateSlug);
          if (!match) {
            const available = activeTemplates.map((t: { name: string; slug: string }) => `  - ${t.name} (slug: \`${t.slug}\`)`).join("\n");
            return {
              content: [{
                type: "text" as const,
                text: `Template "${templateSlug}" not found. Available templates:\n${available}`,
              }],
              isError: true,
            };
          }
          selectedTemplate = match;
        }

        const autoName = protoName || protoDescription.slice(0, 50).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
        const templateData = selectedTemplate as {
          name: string;
          slug: string;
          theme_css: string;
          starter_page: string | null;
          design_instructions: string | null;
        };

        const instructions = [
          `## Quick Prototype: "${autoName}"`,
          `**Template:** ${templateData.name} (${templateData.slug})`,
          `**Description:** ${protoDescription}`,
          ``,
          `### Next steps — generate the code and deploy`,
          ``,
          `1. **Register the prototype** using \`register_prototype\` with name: "${autoName}"${collection_id ? `, collection_id: "${collection_id}"` : ""}${parent_project_id ? `, parent_project_id: "${parent_project_id}"` : ""}`,
          `2. **Generate the code** — create a Next.js page that matches the description above. Use ONLY these CSS variables for colors and styling (never hardcode hex values):`,
          ``,
          `\`\`\`css`,
          templateData.theme_css,
          `\`\`\``,
          ``,
          `   Reference variables in Tailwind like: \`bg-[var(--bg-base)]\`, \`text-[var(--text-primary)]\`, \`border-[var(--border-default)]\``,
        ];

        if (templateData.design_instructions) {
          instructions.push(``, `3. **Follow these design instructions** from the template:`, ``, templateData.design_instructions);
        }

        if (templateData.starter_page) {
          instructions.push(``, `4. **Starter page available** — the template includes a starter page.tsx. You can use it as a base or generate from scratch using the design system.`);
        }

        instructions.push(
          ``,
          `5. **Deploy** using \`deploy_files\` with the prototype ID from step 1. Include:`,
          `   - \`app/globals.css\` — the template CSS above (use verbatim)`,
          `   - \`app/page.tsx\` — your generated page`,
          `   - Any additional component files`,
          `   - Set template: "${templateData.slug}" to apply template overrides at deploy time`,
          ``,
          `6. **Share the live URL** with the user when done.`,
        );

        return { content: [{ type: "text" as const, text: instructions.join("\n") }] };
      }

      case "add_context_link": {
        const { folder_id, project_id, title, url, note } = args as {
          folder_id?: string;
          project_id?: string;
          title: string;
          url?: string;
          note?: string;
        };

        if (!folder_id && !project_id) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Either folder_id or project_id is required.",
              },
            ],
            isError: true,
          };
        }

        const result = await client.addContextLink({
          folderId: folder_id,
          projectId: project_id,
          title,
          url,
          note,
        });

        const parentType = folder_id ? "collection" : "project";
        const parentId = folder_id || project_id;

        return {
          content: [
            {
              type: "text",
              text: `Reference link added successfully!\n\nTitle: ${title}${url ? `\nURL: ${url}` : ""}${note ? `\nNote: ${note}` : ""}\nAttached to ${parentType}: ${parentId}\nLink ID: ${result.link?.id}\n\nView it at: ${VIBESHARING_URL}/dashboard/${folder_id ? "folders" : "projects"}/${parentId}`,
            },
          ],
        };
      }

      case "list_context_links": {
        const { folder_id, project_id } = args as {
          folder_id?: string;
          project_id?: string;
        };

        if (!folder_id && !project_id) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Either folder_id or project_id is required.",
              },
            ],
            isError: true,
          };
        }

        const result = await client.listContextLinks({
          folderId: folder_id,
          projectId: project_id,
        });
        const links = result.links || [];

        if (links.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No reference links found. Use add_context_link to attach Figma designs, PRDs, docs, or notes.",
              },
            ],
          };
        }

        const list = links
          .map(
            (l: { id: string; title: string; url?: string; note?: string; created_at: string }) =>
              `- ${l.title}\n  ID: ${l.id}${l.url ? `\n  URL: ${l.url}` : " (note)"}${l.note ? `\n  Note: ${l.note}` : ""}\n  Added: ${new Date(l.created_at).toLocaleDateString()}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${links.length} reference link(s):\n\n${list}`,
            },
          ],
        };
      }

      case "remove_context_link": {
        const { link_id } = args as { link_id: string };

        await client.removeContextLink(link_id);

        return {
          content: [
            {
              type: "text",
              text: `Reference link ${link_id} removed successfully.`,
            },
          ],
        };
      }

      case "generate_feedback_topics": {
        const { project_id, topics, brief, focus, scope_note } = args as {
          project_id: string;
          topics?: Array<{ title: string; description?: string; theme?: string }>;
          brief?: string;
          focus?: string;
          scope_note?: string;
        };

        const feedbackFocus = focus || "full";

        const themeLabels: Record<string, string> = {
          vision: "Vision Alignment",
          feasibility: "Feasibility",
          design: "Design Fidelity",
          interaction: "Interaction Design",
          critique: "Structured Critique",
        };

        const focusLabels: Record<string, string> = {
          awareness: "Awareness only",
          design: "Design direction",
          feasibility: "Technical feasibility",
          vision: "Vision alignment",
          interaction: "Interaction design",
          critique: "Structured critique",
          full: "Full review",
        };

        // Store brief and focus
        try {
          await client.updateFeedbackBrief(project_id, brief || "", feedbackFocus, scope_note);
        } catch (err) {
          console.error("Failed to store feedback brief/focus:", err);
        }

        // Awareness mode: no questions, just the brief
        if (feedbackFocus === "awareness") {
          // Clear any existing auto-generated questions
          try {
            await client.generateFeedbackTopics(project_id, []);
          } catch {
            // OK if this fails — just means no old auto topics to clear
          }

          const lines = [
            `📢 Prototype set to awareness mode — no feedback questions will be shown.`,
          ];
          if (brief) {
            lines.push("", `📋 Brief saved: "${brief.substring(0, 100)}${brief.length > 100 ? "..." : ""}"`);
          }
          lines.push(
            "",
            "Stakeholders will see this as an FYI with the Context tab available.",
            "They can still leave general comments if they choose to."
          );

          return {
            content: [{ type: "text", text: lines.join("\n") }],
          };
        }

        // All other modes: generate questions
        let workingTopics = topics;
        if ((!workingTopics || workingTopics.length === 0) && feedbackFocus === "critique") {
          workingTopics = CRITIQUE_TOPICS;
        }
        if (!workingTopics || workingTopics.length === 0) {
          return {
            content: [{ type: "text", text: "Error: At least one topic is required when focus is not 'awareness' or 'critique'." }],
          };
        }

        // Sort topics: focused theme first, then others
        const sortedTopics = feedbackFocus !== "full"
          ? [
              ...workingTopics.filter(t => t.theme === feedbackFocus),
              ...workingTopics.filter(t => t.theme !== feedbackFocus),
            ]
          : workingTopics;

        const result = await client.generateFeedbackTopics(project_id, sortedTopics);
        const created = result.topics || [];

        const lines = [
          `✅ Created ${created.length} feedback question${created.length === 1 ? "" : "s"} (focus: ${focusLabels[feedbackFocus] || feedbackFocus}):`,
          "",
          ...created.map((t: { title: string; theme?: string }, i: number) => {
            const tag = t.theme ? ` [${themeLabels[t.theme] || t.theme}]` : "";
            const star = t.theme === feedbackFocus ? " ★" : "";
            return `  ${i + 1}. ${t.title}${tag}${star}`;
          }),
        ];

        if (brief) {
          lines.push("", `📋 Feedback brief saved — stakeholders can see it in the Context tab.`);
        }

        if (feedbackFocus !== "full") {
          lines.push("", `${themeLabels[feedbackFocus] || feedbackFocus} questions are pinned to the top for stakeholders.`);
        }

        lines.push(
          "",
          "Previous auto-generated questions were replaced. Manual questions are untouched."
        );

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }

      case "diagnose": {
        const result = await client.diagnose();

        const lines: string[] = [
          `VibeSharing Health Check (MCP v${CURRENT_VERSION})`,
          "========================",
        ];

        // Token status
        if (result.token?.valid) {
          lines.push(`\u2713 Token: valid (org: ${result.token.org}, role: ${result.token.role})`);
        } else {
          lines.push(`\u2717 Token: invalid — ${result.token?.error || "unknown error"}`);
        }

        // GitHub status
        if (result.github?.connected) {
          lines.push(`\u2713 GitHub: connected (@${result.github.username})`);
        } else {
          lines.push(`\u2717 GitHub: not connected — connect at ${VIBESHARING_URL}/dashboard/account`);
        }

        // Deploy locks
        if (result.deploy_locks?.stuck > 0) {
          const cleared = result.deploy_locks.cleared || 0;
          const names = (result.deploy_locks.prototypes || [])
            .map((p: { name: string }) => p.name)
            .join(", ");
          if (cleared > 0) {
            lines.push(`\u2717 Deploy locks: ${result.deploy_locks.stuck} stuck lock(s) found on: ${names} — cleared ${cleared}`);
          } else {
            lines.push(`\u2717 Deploy locks: ${result.deploy_locks.stuck} stuck lock(s) on: ${names}`);
          }
        } else {
          lines.push(`\u2713 Deploy locks: none`);
        }

        // Recent deploys
        const successful = result.recent_deploys?.successful || 0;
        const failed = result.recent_deploys?.failed || 0;
        if (failed > 0) {
          lines.push(`\u26A0 Recent deploys (24h): ${successful} successful, ${failed} failed`);
          const errors = result.recent_deploys?.errors || [];
          for (const err of errors.slice(0, 3)) {
            lines.push(`  - ${err.error_type}: ${err.error_message || "no details"}`);
          }
        } else {
          lines.push(`\u2713 Recent deploys (24h): ${successful} successful, 0 failed`);
        }

        // Prototypes
        const total = result.prototypes?.total || 0;
        const withoutUrl = result.prototypes?.without_url || 0;
        if (withoutUrl > 0 && total > 0) {
          lines.push(`\u26A0 Prototypes: ${withoutUrl} of ${total} not deployed yet`);
        } else {
          lines.push(`\u2713 Prototypes: ${total} total, all have deploy URLs`);
        }

        // Hosting credits
        if (result.hosting) {
          const h = result.hosting as { provider: string; team?: string; plan?: string; credits?: { used: number; included: number; remaining: number }; error?: string };
          if (h.error) {
            lines.push(`\u26A0 Hosting (${h.provider}): ${h.error}`);
          } else if (h.credits) {
            const pct = Math.round((h.credits.used / h.credits.included) * 100);
            const icon = pct >= 80 ? "\u26A0" : "\u2713";
            lines.push(`${icon} Hosting (${h.provider}): ${h.credits.remaining}/${h.credits.included} credits remaining (${pct}% used) — ${h.team} (${h.plan})`);
          }
        }

        // Issues summary
        const issues: string[] = [];
        if (!result.token?.valid) issues.push("Token is invalid. Get a new one from Account Settings.");
        if (!result.github?.connected) issues.push("GitHub not connected. Connect at Account Settings to enable Push to Deploy.");
        if (result.deploy_locks?.cleared > 0) {
          issues.push(`${result.deploy_locks.cleared} stuck deploy lock(s) were cleared. Retry your deploy.`);
        }
        if (failed > 0) issues.push(`${failed} deploy error(s) in the last 24h. Check the errors above.`);
        if (result.hosting?.credits?.remaining <= 50) {
          issues.push(`Low hosting credits: ${result.hosting.credits.remaining} remaining. Consider upgrading your Netlify plan.`);
        }

        if (issues.length > 0) {
          lines.push("", "Issues found:");
          for (const issue of issues) {
            lines.push(`- ${issue}`);
          }
        } else {
          lines.push("", "No issues found. Everything looks good!");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }

      case "validate_project": {
        const { project_path } = args as { project_path?: string };
        const projectDir = project_path || process.cwd();
        const issues: Array<{ level: "error" | "warning" | "ok"; message: string; fix?: string }> = [];

        // Check for package.json
        let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } | null = null;
        try {
          const pkgContent = readFileSync(join(projectDir, "package.json"), "utf-8");
          pkg = JSON.parse(pkgContent);
        } catch {
          // No package.json — could be a static HTML project
        }

        if (!pkg) {
          // Check if there's at least an index.html for static deployment
          try {
            readFileSync(join(projectDir, "index.html"), "utf-8");
            issues.push({ level: "ok", message: "Static HTML project detected (no package.json). Will deploy as a static site." });
          } catch {
            issues.push({ level: "warning", message: "No package.json or index.html found. The hosting provider may not know how to deploy this project.", fix: "Add an index.html for static hosting, or run `npm init` and install a framework." });
          }
        } else {
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          const frameworks = ["next", "vite", "nuxt", "astro", "gatsby", "react-scripts", "remix", "svelte", "@sveltejs/kit"];
          const detectedFrameworks = frameworks.filter(f => f in allDeps);

          if (detectedFrameworks.length === 0 && !pkg.scripts?.build) {
            issues.push({
              level: "error",
              message: "package.json has no recognized framework and no build script. Build will fail.",
              fix: "Install a framework (e.g., `npm install next react react-dom`) or add a \"build\" script to package.json.",
            });
          } else if (detectedFrameworks.length === 0 && pkg.scripts?.build) {
            issues.push({ level: "ok", message: `Custom build script found: "${pkg.scripts.build}". No standard framework detected, but the hosting provider should use your build script.` });
          } else {
            issues.push({ level: "ok", message: `Framework detected: ${detectedFrameworks.join(", ")}` });
          }

          // Check for Next.js-specific issues
          if ("next" in allDeps) {
            if (!pkg.scripts?.build) {
              issues.push({ level: "warning", message: "Next.js detected but no build script found.", fix: "Add `\"build\": \"next build\"` to your package.json scripts." });
            }
            // Check for next.config
            let hasNextConfig = false;
            for (const configName of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
              try { readFileSync(join(projectDir, configName), "utf-8"); hasNextConfig = true; break; } catch {}
            }
            if (!hasNextConfig) {
              issues.push({ level: "warning", message: "No next.config file found. This is usually fine but may be needed for custom settings." });
            }
          }

          // Check for lock file
          let hasLockFile = false;
          for (const lockFile of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"]) {
            try { readFileSync(join(projectDir, lockFile), "utf-8"); hasLockFile = true; break; } catch {}
          }
          if (!hasLockFile) {
            issues.push({ level: "warning", message: "No lock file found (package-lock.json, yarn.lock, etc.).", fix: "Run `npm install` to generate a lock file. Vercel builds may be inconsistent without one." });
          }

          // Check package-lock.json for entries pinned to non-registry URLs.
          // Mutable URLs (no version in path, served from a custom CDN) break
          // builds the moment the upstream tarball is republished, because the
          // lockfile's integrity hash no longer matches what's served.
          // Known landmine: @diligentcorp/atlas-react-bundle on atlas.diligent.com.
          const REGISTRY_HOST_SUFFIXES = [
            "registry.npmjs.org",
            "registry.npmjs.com",
            "registry.yarnpkg.com",
            "npm.pkg.github.com",
            ".pkgs.visualstudio.com",
            ".codeartifact.amazonaws.com",
            ".jfrog.io",
            ".cloudsmith.io",
            ".gitlab.com",
          ];
          const isRegistryUrl = (url: string) => {
            try {
              const host = new URL(url).hostname;
              return REGISTRY_HOST_SUFFIXES.some(s =>
                s.startsWith(".") ? host.endsWith(s) : host === s
              );
            } catch {
              return false;
            }
          };
          try {
            const lockText = readFileSync(join(projectDir, "package-lock.json"), "utf-8");
            const lock = JSON.parse(lockText) as {
              packages?: Record<string, { resolved?: string; integrity?: string }>;
            };
            const suspect: Array<{ pkg: string; url: string }> = [];
            for (const [path, entry] of Object.entries(lock.packages || {})) {
              if (!entry.resolved || !entry.integrity) continue;
              if (entry.resolved.startsWith("git+")) continue; // git refs are tagged
              if (isRegistryUrl(entry.resolved)) continue;
              const pkgName = path.replace(/^.*node_modules\//, "") || path;
              suspect.push({ pkg: pkgName, url: entry.resolved });
            }
            if (suspect.length > 0) {
              const list = suspect
                .slice(0, 3)
                .map(s => `${s.pkg} → ${new URL(s.url).host}`)
                .join(", ");
              const more = suspect.length > 3 ? ` (+${suspect.length - 3} more)` : "";
              issues.push({
                level: "warning",
                message: `package-lock.json pins ${suspect.length} dependency to a non-registry URL: ${list}${more}. If the upstream tarball is republished without a version bump, npm install will fail with an integrity-check error and your deploy will break.`,
                fix: "Ask the package maintainer to publish to an npm registry, or to use immutable per-version URLs. As a workaround, deploy this prototype without a lockfile so npm always installs the latest tarball.",
              });
              // Track for platform-wide visibility
              client.trackEvent("validate_project_lockfile_mutable_url", {
                count: suspect.length,
                packages: suspect.slice(0, 5).map(s => s.pkg),
                hosts: [...new Set(suspect.map(s => { try { return new URL(s.url).host; } catch { return "unknown"; } }))],
              }).catch(() => {});
            }
          } catch {
            // No package-lock.json or parse error — already covered by the hasLockFile check
          }

          // Check for scripts that reach above the repo root. Common when a
          // project is extracted from a monorepo subfolder without updating
          // relative paths — `../foo` resolved when the package lived inside
          // its parent repo but doesn't exist once the folder is the build
          // root. npm runs the script during install and exits non-zero
          // before the build can even start.
          if (pkg.scripts) {
            const escapingScripts: Array<{ name: string; command: string }> = [];
            for (const [name, command] of Object.entries(pkg.scripts)) {
              if (typeof command !== "string") continue;
              if (/(^|\s)\.\.\//.test(command)) {
                escapingScripts.push({ name, command });
              }
            }
            if (escapingScripts.length > 0) {
              const list = escapingScripts
                .slice(0, 3)
                .map(s => `"${s.name}": ${s.command}`)
                .join("; ");
              const more = escapingScripts.length > 3 ? ` (+${escapingScripts.length - 3} more)` : "";
              issues.push({
                level: "error",
                message: `package.json scripts reference paths outside the repo root: ${list}${more}. These will fail at install/build time because the parent directory doesn't exist on the build host.`,
                fix: "Update the path to be relative to the repo root (e.g., `../scripts/foo.mjs` → `./scripts/foo.mjs`) or move the referenced file into the repo.",
              });
              client.trackEvent("validate_project_script_escapes_root", {
                count: escapingScripts.length,
                scripts: escapingScripts.slice(0, 5).map(s => s.name),
              }).catch(() => {});
            }
          }
        }

        // Format output
        const errors = issues.filter(i => i.level === "error");
        const warnings = issues.filter(i => i.level === "warning");
        const oks = issues.filter(i => i.level === "ok");

        const lines: string[] = [`Project Validation: ${projectDir}`, "=".repeat(40)];

        for (const ok of oks) lines.push(`✓ ${ok.message}`);
        for (const w of warnings) {
          lines.push(`⚠ ${w.message}`);
          if (w.fix) lines.push(`  Fix: ${w.fix}`);
        }
        for (const e of errors) {
          lines.push(`✗ ${e.message}`);
          if (e.fix) lines.push(`  Fix: ${e.fix}`);
        }

        if (errors.length > 0) {
          lines.push("", `${errors.length} error(s) found. Deployment will likely fail.`);
        } else if (warnings.length > 0) {
          lines.push("", `No errors, but ${warnings.length} warning(s). Deployment should work but review the warnings.`);
        } else {
          lines.push("", "All checks passed. Ready to deploy!");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }

      case "send_support_request": {
        const { subject, description, context } = args as {
          subject: string;
          description: string;
          context?: string;
        };

        if (!subject || !description) {
          return {
            content: [{ type: "text", text: "Error: subject and description are required." }],
            isError: true,
          };
        }

        const result = await client.sendSupportRequest({ subject, description, context });

        return {
          content: [
            {
              type: "text",
              text: result.sent
                ? `Support request sent!\n\nSubject: ${subject}\n\n${result.message}`
                : `Support request logged but email delivery had an issue.\n\nSubject: ${subject}\n\n${result.message}`,
            },
          ],
        };
      }

      case "list_versions": {
        const { prototype_id: versionsProtoId, limit: versionsLimit } = args as {
          prototype_id: string;
          limit?: number;
        };

        const versionsResult = await client.listVersions(versionsProtoId, versionsLimit);
        const versions = versionsResult.versions || [];

        if (versions.length === 0) {
          return {
            content: [{ type: "text", text: "No version history found for this prototype. Version tracking starts on the next deploy." }],
          };
        }

        const lines = versions.map((v: {
          version_number: number;
          file_count: number;
          commit_sha: string | null;
          commit_message: string | null;
          deploy_url: string | null;
          deploy_method: string | null;
          deployed_by: string | null;
          can_rollback: boolean;
          created_at: string;
          files: Array<{ path: string; size: number }>;
        }) => {
          const sha = v.commit_sha ? v.commit_sha.slice(0, 7) : "—";
          const msg = v.commit_message || "No message";
          const who = v.deployed_by || "Unknown";
          const when = new Date(v.created_at).toLocaleString();
          const rollback = v.can_rollback ? "✓" : "✗";
          const topFiles = v.files.slice(0, 5).map((f: { path: string }) => f.path).join(", ");
          const moreFiles = v.files.length > 5 ? ` (+${v.files.length - 5} more)` : "";

          return `**v${v.version_number}** — ${when}\n  ${v.deploy_method || "unknown"} by ${who} | ${v.file_count} files | commit: ${sha}\n  ${msg}\n  Files: ${topFiles}${moreFiles}\n  Rollback: ${rollback}${v.deploy_url ? ` | URL: ${v.deploy_url}` : ""}`;
        });

        return {
          content: [{ type: "text", text: `Version history (${versions.length} versions):\n\n${lines.join("\n\n")}` }],
        };
      }

      case "rollback_deploy": {
        const { prototype_id: rollbackProtoId, version_number: rollbackVersion } = args as {
          prototype_id: string;
          version_number: number;
        };

        if (!rollbackVersion || typeof rollbackVersion !== "number") {
          return {
            content: [{ type: "text", text: "Error: version_number is required. Use list_versions to find available versions." }],
            isError: true,
          };
        }

        const rollbackResult = await client.rollback(rollbackProtoId, rollbackVersion);

        return {
          content: [
            {
              type: "text",
              text: `${rollbackResult.message}\n\n${rollbackResult.deploy_url ? `URL: ${rollbackResult.deploy_url}` : ""}${rollbackResult.commit_sha ? `\nCommit: ${rollbackResult.commit_sha}` : ""}`,
            },
          ],
        };
      }

      case "fork_prototype": {
        const {
          prototype_id: forkSourceId,
          name: forkName,
          deploy_name: forkDeployName,
          collection_id: forkCollectionId,
        } = args as {
          prototype_id: string;
          name?: string;
          deploy_name?: string;
          collection_id?: string;
        };

        const forkResult = await client.forkPrototype(forkSourceId, {
          name: forkName,
          deploy_name: forkDeployName,
          collection_id: forkCollectionId,
        });

        const fork = forkResult.fork;

        return {
          content: [
            {
              type: "text",
              text: `${forkResult.message}\n\nFork: ${fork.name}\nID: ${fork.id}\nParent: ${fork.parent_name} (${fork.parent_id})\nFiles: ${fork.file_count}\n${fork.deploy_url ? `Live URL: ${fork.deploy_url}\n` : "Deploying...\n"}Dashboard: ${fork.dashboard_url}\n\nThe original prototype is untouched. Deploy changes to the fork using its ID.`,
            },
          ],
        };
      }

      case "delete_prototype": {
        const { prototype_id: deleteProtoId } = args as { prototype_id: string };

        const deleteResult = await client.deletePrototype(deleteProtoId);

        return {
          content: [
            {
              type: "text",
              text: `Deleted "${deleteResult.name}" (${deleteResult.deleted}).`,
            },
          ],
        };
      }

      case "update_prototype": {
        const {
          prototype_id: updateProtoId,
          name: updateName,
          description: updateDesc,
          external_url: updateUrl,
        } = args as {
          prototype_id: string;
          name?: string;
          description?: string;
          external_url?: string;
        };

        const updates: Record<string, string> = {};
        if (updateName) updates.name = updateName;
        if (updateDesc !== undefined) updates.description = updateDesc;
        if (updateUrl !== undefined) updates.external_url = updateUrl;

        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: "text", text: "Error: Provide at least one field to update (name, description, or external_url)." }],
            isError: true,
          };
        }

        await client.updatePrototype(updateProtoId, updates);

        const changedFields = Object.keys(updates).join(", ");
        return {
          content: [{ type: "text", text: `Updated ${changedFields} for prototype ${updateProtoId}.` }],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMsg}\n\nTroubleshooting steps:\n1. Call the \`diagnose\` tool to check token, GitHub, deploy locks, and recent errors\n2. Read https://vibesharing.app/DEPLOY-TROUBLESHOOTING.md for common fixes\n3. If still stuck, call \`send_support_request\` with the error details and diagnose output so the admin can help`,
        },
      ],
      isError: true,
    };
  }
  })();

  // Prepend What's New to the first successful tool call after upgrade
  if (pendingWhatsNew && !toolResult.isError) {
    toolResult.content.unshift({ type: "text", text: pendingWhatsNew + "\n\n---\n" });
    pendingWhatsNew = null;
  }

  // Prepend update notice if a newer version is available
  if (updateNotice && !toolResult.isError) {
    toolResult.content.unshift({ type: "text", text: updateNotice + "\n\n---\n" });
    updateNotice = null; // Only show once per session
  }

  // Prepend welcome message on the first successful tool call
  if (pendingWelcome && !toolResult.isError) {
    const welcome = await pendingWelcome;
    pendingWelcome = null as any; // Only show once per session
    if (welcome) {
      toolResult.content.unshift({ type: "text", text: welcome + "\n\n---\n" });
    }
  }

  // Prepend unread feedback summary on the first successful tool call
  if (pendingFeedbackCheck && !toolResult.isError) {
    const feedbackSummary = await pendingFeedbackCheck;
    pendingFeedbackCheck = null as any; // Only show once per session
    if (feedbackSummary) {
      toolResult.content.unshift({ type: "text", text: feedbackSummary + "\n\n---\n" });
    }
  }

  return toolResult;
});

// List available resources (prototypes as resources)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const result = await client.listPrototypes();
    const prototypes = result.prototypes || [];

    return {
      resources: prototypes.map(
        (p: { id: string; name: string; description?: string }) => ({
          uri: `vibesharing://prototype/${p.id}`,
          name: p.name,
          description: p.description || `Prototype: ${p.name}`,
          mimeType: "application/json",
        })
      ),
    };
  } catch {
    return { resources: [] };
  }
});

// Read a specific resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const match = uri.match(/^vibesharing:\/\/prototype\/(.+)$/);

  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const projectId = match[1];
  const [prototype, feedbackResult] = await Promise.all([
    client.getPrototype(projectId),
    client.getFeedback(projectId),
  ]);

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            prototype: prototype.project,
            feedback: feedbackResult.feedback,
          },
          null,
          2
        ),
      },
    ],
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("VibeSharing MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
