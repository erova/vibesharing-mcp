#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
// VibeSharing API client
class VibesharingClient {
    baseUrl;
    token;
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;
    }
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
                "X-Vibesharing-Client": "mcp",
                ...options.headers,
            },
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `API error: ${response.status}`);
        }
        return response.json();
    }
    async registerPrototype(params) {
        return this.request("/api/prototypes", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async listCollections() {
        return this.request("/api/collections");
    }
    async createCollection(params) {
        return this.request("/api/collections", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async deployFiles(prototypeId, files, commitMessage, deployName) {
        return this.request(`/api/prototypes/${prototypeId}/deploy-code`, {
            method: "POST",
            body: JSON.stringify({ files, commitMessage, deployName }),
        });
    }
    async listPrototypes() {
        return this.request("/api/prototypes");
    }
    async getPrototype(id) {
        return this.request(`/api/prototypes/${id}`);
    }
    async getFeedback(projectId, filters) {
        const params = new URLSearchParams({ projectId });
        if (filters?.status)
            params.set("status", filters.status);
        if (filters?.priority)
            params.set("priority", filters.priority);
        if (filters?.assigned_to)
            params.set("assignedTo", filters.assigned_to);
        return this.request(`/api/feedback?${params.toString()}`);
    }
    async triageFeedback(feedbackIds, updates) {
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
    async syncContext(projectId, content) {
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
    async listFeedbackTopics(projectId) {
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
    async uploadSource(prototypeId, sourceCode, filename, storageOption) {
        return this.request(`/api/prototypes/${prototypeId}/source`, {
            method: "POST",
            body: JSON.stringify({
                source_code: sourceCode,
                filename: filename || "page.tsx",
                storage_option: storageOption || "permanent",
            }),
        });
    }
    async deployStatic(params) {
        return this.request("/api/deploy/static", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async deployPrototype(params) {
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
    async importRepo(prototypeId, repoUrl, deployName) {
        return this.request("/api/git/import-repo", {
            method: "POST",
            body: JSON.stringify({ prototypeId, repoUrl, deployName }),
        });
    }
    async addContextLink(params) {
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
    async listContextLinks(params) {
        const param = params.folderId
            ? `folderId=${params.folderId}`
            : `projectId=${params.projectId}`;
        return this.request(`/api/context-links?${param}`);
    }
    async removeContextLink(linkId) {
        return this.request(`/api/context-links/${linkId}`, {
            method: "DELETE",
        });
    }
    async diagnose() {
        return this.request("/api/diagnose");
    }
    async sendSupportRequest(params) {
        return this.request("/api/support", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async generateFeedbackTopics(projectId, topics) {
        return this.request("/api/feedback-topics", {
            method: "POST",
            body: JSON.stringify({
                projectId,
                topics,
                source: "auto",
            }),
        });
    }
    async notifyFeedbackResolved(projectId, feedbackIds, deployUrl) {
        return this.request("/api/feedback/notify-resolved", {
            method: "POST",
            body: JSON.stringify({ projectId, feedbackIds, deployUrl }),
        });
    }
    async updateFeedbackBrief(projectId, brief, focus) {
        const updates = { feedback_brief: brief };
        if (focus)
            updates.feedback_focus = focus;
        return this.request(`/api/prototypes/${projectId}`, {
            method: "PATCH",
            body: JSON.stringify(updates),
        });
    }
}
/**
 * Simple fuzzy text matching. Scores based on:
 * - Exact match → 1.0
 * - Case-insensitive exact → 0.95
 * - Query is a substring → 0.7–0.9 (bonus for matching at word boundaries)
 * - Token overlap (words in common) → 0.3–0.7
 * - Otherwise → 0
 */
function fuzzyScore(query, target) {
    const q = query.toLowerCase().trim();
    const t = target.toLowerCase().trim();
    if (q === t)
        return 1.0;
    if (t === q)
        return 0.95;
    // Substring match
    if (t.includes(q)) {
        // Bonus if it matches at a word boundary
        const wordBoundary = t.startsWith(q) || t.includes(` ${q}`);
        return wordBoundary ? 0.9 : 0.75;
    }
    if (q.includes(t))
        return 0.7;
    // Token overlap
    const qTokens = q.split(/[\s\-_]+/).filter(Boolean);
    const tTokens = t.split(/[\s\-_]+/).filter(Boolean);
    if (qTokens.length === 0 || tTokens.length === 0)
        return 0;
    let matches = 0;
    for (const qt of qTokens) {
        if (tTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
            matches++;
        }
    }
    const overlap = matches / Math.max(qTokens.length, tTokens.length);
    return overlap * 0.7;
}
function fuzzyMatch(query, items, getName, threshold = 0.3) {
    return items
        .map((item) => ({ item, score: fuzzyScore(query, getName(item)) }))
        .filter((m) => m.score >= threshold)
        .sort((a, b) => b.score - a.score);
}
// ---- Version tracking & What's New ----
const CURRENT_VERSION = "0.9.3";
const WHATS_NEW = {
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
        "• Named deployments — Set friendly Vercel URLs with deploy_name.",
        "• Fuzzy search on list_collections and list_prototypes.",
        "• Guardrails on deploy tools.",
    ].join("\n"),
};
function getWhatsNew() {
    try {
        const configDir = (0, path_1.join)((0, os_1.homedir)(), ".vibesharing");
        const versionFile = (0, path_1.join)(configDir, "mcp-version");
        let lastVersion = null;
        try {
            lastVersion = (0, fs_1.readFileSync)(versionFile, "utf-8").trim();
        }
        catch {
            // First run or file missing
        }
        // Update stored version
        try {
            (0, fs_1.mkdirSync)(configDir, { recursive: true });
            (0, fs_1.writeFileSync)(versionFile, CURRENT_VERSION);
        }
        catch {
            // Non-fatal
        }
        if (lastVersion === CURRENT_VERSION)
            return null;
        // Collect all changelogs newer than lastVersion
        const notes = [];
        for (const [ver, note] of Object.entries(WHATS_NEW)) {
            if (!lastVersion || ver > lastVersion) {
                notes.push(note);
            }
        }
        return notes.length > 0 ? notes.join("\n\n") : null;
    }
    catch {
        return null;
    }
}
// Check once at startup, prepend to first tool call
let pendingWhatsNew = getWhatsNew();
// Get configuration from environment
const VIBESHARING_URL = process.env.VIBESHARING_URL || "https://vibesharing.app";
const VIBESHARING_TOKEN = process.env.VIBESHARING_TOKEN;
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
let updateNotice = null;
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
    }
    catch {
        // Silently ignore — don't block startup for a version check
    }
})();
const client = new VibesharingClient(VIBESHARING_URL, VIBESHARING_TOKEN);
// Check for unread feedback (non-blocking — runs in background)
let pendingFeedbackCheck = (async () => {
    try {
        const result = await client.listPrototypes();
        const prototypes = (result.prototypes || []).slice(0, 10);
        if (prototypes.length === 0)
            return null;
        const feedbackByPrototype = [];
        await Promise.all(prototypes.map(async (proto) => {
            try {
                const fbResult = await client.getFeedback(proto.id, { status: "open" });
                const feedback = (fbResult.feedback || []);
                if (feedback.length > 0) {
                    feedbackByPrototype.push({ name: proto.name, items: feedback });
                }
            }
            catch {
                // Skip prototypes we can't access
            }
        }));
        if (feedbackByPrototype.length === 0)
            return null;
        let summary = "📬 Unread feedback since your last session:\n";
        for (const proto of feedbackByPrototype) {
            const count = proto.items.length;
            summary += `\n"${proto.name}" — ${count} new item${count !== 1 ? "s" : ""}\n`;
            for (const item of proto.items.slice(0, 5)) {
                const priorityTag = item.priority ? ` (${item.priority} priority)` : "";
                const truncated = item.content.length > 80 ? item.content.slice(0, 77) + "..." : item.content;
                summary += `  - ${item.user_name}: "${truncated}"${priorityTag}\n`;
            }
            if (proto.items.length > 5) {
                summary += `  ... and ${proto.items.length - 5} more\n`;
            }
        }
        summary += "\nUse get_feedback to see full details, or triage_feedback to respond.";
        return summary;
    }
    catch {
        // Silently ignore — don't block startup for a feedback check
        return null;
    }
})();
// Create MCP server
const server = new index_js_1.Server({
    name: "vibesharing",
    version: CURRENT_VERSION,
}, {
    capabilities: {
        tools: {},
        resources: {},
    },
});
// Define available tools
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "register_prototype",
                description: "Register a prototype on VibeSharing. Creates a standalone prototype by default. To add it as a version under an existing project, provide parent_project_id. IMPORTANT: Before calling this, use resolve_target to confirm the collection and project name with the user. Do not auto-generate names without user confirmation. Returns the VibeSharing URL where the team can view and leave feedback.",
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
                            description: "URL where the prototype is deployed (e.g., https://my-app.vercel.app)",
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
                description: "List all prototypes in your VibeSharing organization. Shows name, URL, and recent activity. Optionally filter by search query (fuzzy matched).",
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
                description: "List all collections (folders) in your VibeSharing organization. Use this to find the collection_id when registering prototypes. Optionally filter by search query (fuzzy matched).",
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
                description: "Get feedback and comments for a specific prototype. Can filter by status (open, in_progress, resolved, wont_fix, deferred), priority (critical, high, medium, low), or assignee.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project_id: {
                            type: "string",
                            description: "The VibeSharing project/prototype ID",
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
                description: "Update status, priority, or assignee on one or more feedback items. Use this to triage feedback from within your editor.",
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
                description: "CALL THIS AFTER DEPLOYING when there is open feedback. Matches what you just built to open feedback items, resolves them with explanations, and notifies the original stakeholders with a personalized digest. The stakeholder sees exactly what happened to their feedback.\n\nFlow:\n1. Pull open feedback via get_feedback\n2. Look at what you built and match changes to feedback items\n3. Call this tool with the resolutions\n4. Stakeholders get email: 'Your feedback was addressed' with per-item explanations",
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
                description: "Sync your CLAUDE.md, AGENTS.md, or project context to VibeSharing. This helps maintain context across AI sessions and team members.",
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
                description: "Verify that your VibeSharing deploy token is valid. Use this to check connectivity and authentication before other operations.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "upload_source",
                description: "Upload source code for an existing prototype on VibeSharing. Colleagues can then download the source from the prototype page. Use this when you want to share code without deploying it.",
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
                description: "Deploy code directly to VibeSharing. This deploys your code to Vercel and registers it as a prototype in one step. IMPORTANT: Before calling this, use resolve_target to confirm the collection, project name, and deploy name with the user. Do not deploy without user confirmation on where it should go.",
                inputSchema: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description: "The React/Next.js page code to deploy (typically a page.tsx file)",
                        },
                        name: {
                            type: "string",
                            description: "Name for the prototype (e.g., 'Checkout Flow v2')",
                        },
                        prototype_id: {
                            type: "string",
                            description: "Optional: existing prototype ID to update (creates new if not provided)",
                        },
                    },
                    required: ["code", "name"],
                },
            },
            {
                name: "share_html",
                description: "Share a static HTML page on VibeSharing — the simplest way to share. No Vercel, no GitHub, no React wrapper. Just uploads the HTML and gives you a shareable link with the feedback widget built in. Use this for standalone HTML files, one-page prototypes, or any static content that doesn't need a build step. For large HTML files, use file_path instead of html to avoid MCP parameter size limits.",
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
                description: "Create a new collection in your VibeSharing organization. Collections group related projects and prototypes. Use this before deploying a prototype if you need a new collection to put it in.",
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
                name: "deploy_files",
                description: "Deploy a multi-file Next.js project to VibeSharing. Pushes files to GitHub, deploys to Vercel. Requires an existing prototype ID. For large files, use file_paths instead of files to read from disk and avoid MCP parameter size limits (~100KB). IMPORTANT: Before calling this, use resolve_target to confirm the target prototype with the user. If the user hasn't specified where to deploy, do NOT proceed — ask first.",
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
                        deploy_name: {
                            type: "string",
                            description: "Optional: Friendly name for the Vercel project URL (e.g., 'erg-v3-teams' → erg-v3-teams.vercel.app). On redeploy, renames the Vercel project if different from current name.",
                        },
                    },
                    required: ["prototype_id"],
                },
            },
            {
                name: "import_repo",
                description: "Import an existing GitHub repo into VibeSharing. Pulls the code into a VibeSharing-hosted repo and deploys it to Vercel. IMPORTANT: Before calling this, use resolve_target to confirm the collection, project name, and deploy name with the user. Do not import without user confirmation on where it should go and what it should be called.",
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
                            description: "Optional: Friendly name for the Vercel project URL (e.g., 'erg-v3-teams' → erg-v3-teams.vercel.app). Lowercase, hyphens allowed, max 100 chars. Auto-derived from 'name' if omitted.",
                        },
                    },
                    required: ["repo_url"],
                },
            },
            {
                name: "resolve_target",
                description: "CALL THIS BEFORE deploying or registering a prototype when the user hasn't provided exact IDs. Fuzzy-matches collection and project names, suggests where to put the prototype, and checks deploy_name availability. Returns structured options so you can confirm with the user before proceeding.",
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
                name: "add_context_link",
                description: "Attach a reference link or note to a collection or project/prototype. Use this to add links to Figma designs, PRDs, Confluence docs, or free-text notes that provide context for reviewers.",
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
                description: "List all reference links and notes attached to a collection or project/prototype.",
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
                description: "Remove a reference link or note by its ID.",
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
                description: "Auto-generate feedback questions for a prototype based on what was built. IMPORTANT: Before generating questions, ask the user: 'What type of feedback is most important for this deploy?' and present these options:\n\n  1. Awareness only — just sharing progress, no feedback needed\n  2. Design direction — brand, visual, layout feedback\n  3. Technical feasibility — is this buildable, are these features doable\n  4. Vision alignment — does this match where we're going\n  5. Interaction design — usability, flow, UX patterns\n  6. Full review — all feedback welcome (default)\n\nUse their answer as the 'focus' parameter. If 'awareness', skip topic generation and just set the brief. Otherwise generate 3-5 questions, weighting toward the chosen focus theme.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project_id: {
                            type: "string",
                            description: "The VibeSharing prototype ID",
                        },
                        focus: {
                            type: "string",
                            enum: ["awareness", "design", "feasibility", "vision", "interaction", "full"],
                            description: "The type of feedback the designer wants. 'awareness' = no questions, just FYI. Others emphasize that theme. 'full' = all themes equally. Default: 'full'.",
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
                                        enum: ["vision", "feasibility", "design", "interaction"],
                                        description: "Question theme: 'vision' (alignment with goals), 'feasibility' (technical possibility), 'design' (brand/visual fidelity), 'interaction' (usability/UX patterns)",
                                    },
                                },
                                required: ["title"],
                            },
                            description: "Array of feedback questions to create. Generate 3-5 based on what you built. Weight toward the focus theme (e.g., if focus is 'feasibility', 2-3 questions should be feasibility-themed). Not required when focus is 'awareness'.",
                        },
                    },
                    required: ["project_id"],
                },
            },
            {
                name: "diagnose",
                description: "Run a comprehensive health check on the user's VibeSharing setup. Checks token validity, GitHub connection, stuck deploy locks (auto-clears them), recent deploy errors, and prototype status. Use this to troubleshoot issues.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "send_support_request",
                description: "Send a support request to the VibeSharing admin. Use this when the user has an issue you can't resolve, needs a configuration change, or wants to report a bug.",
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
        ],
    };
});
// Handle tool calls
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolResult = await (async () => {
        try {
            switch (name) {
                case "register_prototype": {
                    const params = args;
                    // Guardrail: if no collection specified, bounce back with options
                    if (!params.collection_id) {
                        const [guardCollResult, guardProtoResult] = await Promise.all([
                            client.listCollections(),
                            client.listPrototypes(),
                        ]);
                        const guardCollections = guardCollResult.collections || [];
                        const guardPrototypes = guardProtoResult.prototypes || [];
                        const similarProjects = fuzzyMatch(params.name, guardPrototypes, (p) => p.name).slice(0, 5);
                        const sections = [
                            `HOLD ON — confirm with the user before registering "${params.name}":\n`,
                        ];
                        if (similarProjects.length > 0) {
                            sections.push(`Similar existing projects:\n` +
                                similarProjects.map((m) => {
                                    const p = m.item;
                                    return `  - "${p.name}" (ID: ${p.id})`;
                                }).join("\n") +
                                `\n\nAsk the user: Is this an update to one of these, or a new project?`);
                        }
                        if (guardCollections.length > 0) {
                            sections.push(`\nNo collection specified. Available collections:\n` +
                                guardCollections.map((c) => `  - ${c.name} (ID: ${c.id})`).join("\n") +
                                `\n\nAsk the user: Which collection should "${params.name}" go in?`);
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
                        }
                        catch (err) {
                            sourceInfo = `\nWarning: Source upload failed: ${err instanceof Error ? err.message : "Unknown error"}`;
                        }
                    }
                    const hierarchyNote = !params.parent_project_id
                        ? "\n\nNote: This created a standalone prototype. To organize it under a project, use the 'Move to project' option on the VibeSharing dashboard."
                        : "";
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Prototype registered successfully!\n\nName: ${result.prototype?.name || params.name}\nVibeSharing URL: ${VIBESHARING_URL}/dashboard/projects/${protoId}\n${params.external_url ? `Live URL: ${params.external_url}` : ""}${sourceInfo}\n\nYour team can now view and leave feedback on this prototype.${hierarchyNote}`,
                            },
                        ],
                    };
                }
                case "list_prototypes": {
                    const { search: protoSearch } = (args || {});
                    const result = await client.listPrototypes();
                    let prototypes = result.prototypes || [];
                    if (protoSearch) {
                        const matches = fuzzyMatch(protoSearch, prototypes, (p) => p.name);
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
                        .map((p) => `- ${p.name}\n  ID: ${p.id}\n  ${p.external_url ? `URL: ${p.external_url}\n  ` : ""}Updated: ${new Date(p.updated_at).toLocaleDateString()}`)
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
                    const { search: collSearch } = (args || {});
                    const result = await client.listCollections();
                    let collections = result.collections || [];
                    if (collSearch) {
                        const matches = fuzzyMatch(collSearch, collections, (c) => c.name);
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
                        .map((c) => `- ${c.name}\n  ID: ${c.id}${c.description ? `\n  ${c.description}` : ""}`)
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
                    const { project_id, status: statusFilter, priority: priorityFilter, assigned_to: assignedToFilter } = args;
                    const result = await client.getFeedback(project_id, {
                        status: statusFilter,
                        priority: priorityFilter,
                        assigned_to: assignedToFilter,
                    });
                    const feedback = result.feedback || [];
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
                    const feedbackList = feedback
                        .map((f) => {
                        const itemStatus = f.status || (f.resolved_at ? "resolved" : "open");
                        const priorityLabel = f.priority ? ` [${f.priority.toUpperCase()}]` : "";
                        const assigneeLabel = f.assignee_name ? ` → ${f.assignee_name}` : "";
                        const replies = f.replies && f.replies.length > 0
                            ? `\n  Replies: ${f.replies.length}`
                            : "";
                        return `- [${itemStatus}]${priorityLabel}${assigneeLabel} ${f.user_name}: "${f.content}"\n  ID: ${f.id}\n  ${new Date(f.created_at).toLocaleDateString()}${replies}`;
                    })
                        .join("\n\n");
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Feedback (${feedback.length} items):\n\n${feedbackList}`,
                            },
                        ],
                    };
                }
                case "triage_feedback": {
                    const { feedback_ids, status: newStatus, priority: newPriority, assigned_to: newAssignee, resolution_note } = args;
                    if (!feedback_ids || feedback_ids.length === 0) {
                        return {
                            content: [{ type: "text", text: "Error: feedback_ids array is required" }],
                        };
                    }
                    const updates = {};
                    if (newStatus)
                        updates.status = newStatus;
                    if (newPriority !== undefined)
                        updates.priority = newPriority;
                    if (newAssignee !== undefined)
                        updates.assigned_to = newAssignee || null;
                    if (resolution_note)
                        updates.resolution_note = resolution_note;
                    const result = await client.triageFeedback(feedback_ids, updates);
                    const changes = [];
                    if (newStatus)
                        changes.push(`status → ${newStatus}`);
                    if (newPriority)
                        changes.push(`priority → ${newPriority}`);
                    if (newAssignee !== undefined)
                        changes.push(newAssignee ? `assigned → ${newAssignee}` : "unassigned");
                    if (resolution_note)
                        changes.push(`note: "${resolution_note}"`);
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
                    const { project_id, resolutions, deploy_url } = args;
                    if (!resolutions || resolutions.length === 0) {
                        return {
                            content: [{ type: "text", text: "Error: At least one resolution is required." }],
                        };
                    }
                    // Step 1: Resolve each feedback item with its note
                    const resolvedIds = [];
                    const errors = [];
                    for (const res of resolutions) {
                        try {
                            await client.triageFeedback([res.feedback_id], {
                                status: res.status,
                                resolution_note: res.note,
                            });
                            resolvedIds.push(res.feedback_id);
                        }
                        catch (err) {
                            errors.push(`Failed to update ${res.feedback_id}: ${err}`);
                        }
                    }
                    // Step 2: Notify stakeholders
                    let notifyResult = { notified: 0, emailed: 0, stakeholders: 0 };
                    if (resolvedIds.length > 0) {
                        try {
                            notifyResult = await client.notifyFeedbackResolved(project_id, resolvedIds, deploy_url);
                        }
                        catch (err) {
                            errors.push(`Notification failed: ${err}`);
                        }
                    }
                    const statusLabels = {
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
                        lines.push("", `📬 ${notifyResult.stakeholders} stakeholder${notifyResult.stakeholders === 1 ? "" : "s"} notified (${notifyResult.emailed} email${notifyResult.emailed === 1 ? "" : "s"} sent)`, "Each stakeholder received a personalized digest showing what happened to their specific feedback.");
                    }
                    if (errors.length > 0) {
                        lines.push("", `⚠️ ${errors.length} error(s):`, ...errors.map(e => `  - ${e}`));
                    }
                    return {
                        content: [{ type: "text", text: lines.join("\n") }],
                    };
                }
                case "sync_context": {
                    const { project_id, content } = args;
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
                    }
                    else {
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
                    const { prototype_id, source_code, filename, storage_option } = args;
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
                    const { html: shareHtmlParam, file_path: shareFilePath, name: shareName, prototype_id: shareProtoId, collection_id: shareCollId, } = args;
                    // Resolve HTML content from either inline or file path
                    let shareHtml = shareHtmlParam;
                    let bundledAssets = 0;
                    if (!shareHtml && shareFilePath) {
                        try {
                            shareHtml = (0, fs_1.readFileSync)(shareFilePath, "utf-8");
                        }
                        catch (err) {
                            return {
                                content: [{ type: "text", text: `Error reading file: ${err instanceof Error ? err.message : "Unknown error"}` }],
                                isError: true,
                            };
                        }
                        // Auto-bundle: inline relative CSS, SVG, and images so the HTML is self-contained
                        const htmlDir = shareFilePath.substring(0, shareFilePath.lastIndexOf("/")) || ".";
                        // Inline CSS <link> tags
                        shareHtml = shareHtml.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (_match, href) => {
                            if (href.startsWith("http://") || href.startsWith("https://"))
                                return _match;
                            try {
                                const cssPath = (0, path_1.join)(htmlDir, href);
                                const css = (0, fs_1.readFileSync)(cssPath, "utf-8");
                                bundledAssets++;
                                return `<style>/* ${href} */\n${css}</style>`;
                            }
                            catch {
                                return _match; // Keep original if file not found
                            }
                        });
                        // Inline SVG <img> tags as inline SVG elements
                        shareHtml = shareHtml.replace(/<img\s+[^>]*src=["']([^"']+\.svg)["'][^>]*\/?>/gi, (_match, src) => {
                            if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:"))
                                return _match;
                            try {
                                const svgPath = (0, path_1.join)(htmlDir, src);
                                const svg = (0, fs_1.readFileSync)(svgPath, "utf-8");
                                // Extract class/style/alt from original img tag
                                const classMatch = _match.match(/class=["']([^"']*)["']/);
                                const styleMatch = _match.match(/style=["']([^"']*)["']/);
                                let inlineSvg = svg.trim();
                                if (classMatch)
                                    inlineSvg = inlineSvg.replace("<svg", `<svg class="${classMatch[1]}"`);
                                if (styleMatch)
                                    inlineSvg = inlineSvg.replace("<svg", `<svg style="${styleMatch[1]}"`);
                                bundledAssets++;
                                return inlineSvg;
                            }
                            catch {
                                return _match;
                            }
                        });
                        // Inline PNG/JPG/GIF/WEBP as base64 data URIs
                        shareHtml = shareHtml.replace(/<img\s+[^>]*src=["']([^"']+\.(png|jpg|jpeg|gif|webp))["'][^>]*\/?>/gi, (_match, src, ext) => {
                            if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:"))
                                return _match;
                            try {
                                const imgPath = (0, path_1.join)(htmlDir, src);
                                const imgData = (0, fs_1.readFileSync)(imgPath);
                                const mimeTypes = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
                                const mime = mimeTypes[ext.toLowerCase()] || "image/png";
                                const dataUri = `data:${mime};base64,${imgData.toString("base64")}`;
                                bundledAssets++;
                                return _match.replace(src, dataUri);
                            }
                            catch {
                                return _match;
                            }
                        });
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
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Shared!\n\nView URL: ${shareResult.viewUrl}\nPrototype ID: ${shareResult.prototypeId}\n\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${shareResult.prototypeId}\n\nThis is a lightweight static share — no Vercel project, no GitHub repo, no build step. The feedback widget is included automatically.${bundledAssets > 0 ? `\n\n${bundledAssets} asset(s) auto-bundled (CSS, SVGs, images inlined into the HTML).` : ""}\n\n${shareResult.shareSummary ? `Share this with your team:\n${shareResult.shareSummary}` : ""}`,
                            },
                        ],
                    };
                }
                case "deploy_prototype": {
                    const { code, name, prototype_id } = args;
                    // Guardrail: if no existing prototype specified, bounce back with options
                    if (!prototype_id) {
                        const [guardCollResult, guardProtoResult] = await Promise.all([
                            client.listCollections(),
                            client.listPrototypes(),
                        ]);
                        const guardCollections = guardCollResult.collections || [];
                        const guardPrototypes = guardProtoResult.prototypes || [];
                        const similarProjects = fuzzyMatch(name, guardPrototypes, (p) => p.name).slice(0, 5);
                        const sections = [
                            `HOLD ON — confirm with the user before deploying "${name}":\n`,
                        ];
                        if (similarProjects.length > 0) {
                            sections.push(`Similar existing projects:\n` +
                                similarProjects.map((m) => {
                                    const p = m.item;
                                    return `  - "${p.name}" (ID: ${p.id})${p.external_url ? ` → ${p.external_url}` : ""}`;
                                }).join("\n") +
                                `\n\nAsk the user: Is this an UPDATE to one of these, or a NEW project?`);
                        }
                        if (guardCollections.length > 0) {
                            sections.push(`\nAvailable collections:\n` +
                                guardCollections.map((c) => `  - ${c.name} (ID: ${c.id})`).join("\n") +
                                `\n\nAsk the user: Which collection should this go in?`);
                        }
                        const suggestedSlug = name
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-+|-+$/g, "");
                        sections.push(`\nSuggested deploy name: "${suggestedSlug}" → https://${suggestedSlug}.vercel.app\n` +
                            `Ask the user: Do you want to use this name or choose a different one?`);
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
                        const registered = await client.registerPrototype({ name });
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
                    const result = await client.deployPrototype({
                        code,
                        prototypeName: name,
                        prototypeId,
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Deployed successfully!\n\nLive URL: ${result.deployedUrl}\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${prototypeId}\n\nYour team can now view the prototype and leave feedback.${result.contextImported ? "\n\nProject context was automatically imported." : ""}`,
                            },
                        ],
                    };
                }
                case "create_collection": {
                    const { name: collName, description: collDesc } = args;
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
                case "deploy_files": {
                    const { prototype_id: deployProtoId, files: inlineFiles, file_paths: filePaths, commit_message, deploy_name: deployName } = args;
                    // Build combined files array from inline files and file paths
                    const files = [...(inlineFiles || [])];
                    if (filePaths && filePaths.length > 0) {
                        for (const fp of filePaths) {
                            try {
                                const content = (0, fs_1.readFileSync)(fp.path, "utf-8");
                                const deployPath = fp.deploy_path || (0, path_1.basename)(fp.path);
                                files.push({ path: deployPath, content });
                            }
                            catch (err) {
                                return {
                                    content: [{ type: "text", text: `Error reading file "${fp.path}": ${err instanceof Error ? err.message : "Unknown error"}` }],
                                    isError: true,
                                };
                            }
                        }
                    }
                    if (files.length === 0) {
                        return {
                            content: [{ type: "text", text: "Error: Either files or file_paths is required." }],
                            isError: true,
                        };
                    }
                    const deployResult = await client.deployFiles(deployProtoId, files, commit_message || "Deploy via MCP", deployName);
                    // Feature 1: Auto-sync context if CLAUDE.md or AGENTS.md is present
                    let contextSynced = false;
                    try {
                        const contextFile = files.find((f) => f.path.toLowerCase().endsWith("claude.md") || f.path.toLowerCase().endsWith("agents.md"));
                        if (contextFile) {
                            await client.syncContext(deployProtoId, contextFile.content);
                            contextSynced = true;
                        }
                    }
                    catch (err) {
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
                            ]).catch((err) => console.error("Auto-generate feedback topics failed (non-blocking):", err));
                            topicsGenerated = true;
                        }
                    }
                    catch (err) {
                        console.error("Feedback topics check failed (non-blocking):", err);
                    }
                    const postDeployNotes = [];
                    if (contextSynced)
                        postDeployNotes.push("Context synced from CLAUDE.md.");
                    if (topicsGenerated)
                        postDeployNotes.push("Feedback topics auto-generated for your team.");
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Deployed ${files.length} files!\n\n${deployResult.deployName ? `Deploy name: ${deployResult.deployName}\n` : ""}Live URL: ${deployResult.deployUrl || "Deploying..."}\nRepo: ${deployResult.repoUrl || "N/A"}\nCommit: ${deployResult.commitSha || "N/A"}\n\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${deployProtoId}\n\nYour team can now view the prototype and leave feedback.${postDeployNotes.length > 0 ? "\n\n" + postDeployNotes.join("\n") : ""}`,
                            },
                        ],
                    };
                }
                case "import_repo": {
                    const { repo_url, name: importName, prototype_id: importProtoId, collection_id: importCollectionId, parent_project_id: importParentId, description: importDesc, deploy_name: deployName, } = args;
                    // Guardrail: if no collection and no existing prototype specified, bounce back with options
                    if (!importCollectionId && !importProtoId) {
                        const [guardCollResult, guardProtoResult] = await Promise.all([
                            client.listCollections(),
                            client.listPrototypes(),
                        ]);
                        const guardCollections = guardCollResult.collections || [];
                        const guardPrototypes = guardProtoResult.prototypes || [];
                        const repoName = repo_url.replace(/\.git$/, "").split("/").pop() || "imported-prototype";
                        const suggestedName = importName || repoName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                        // Check for similar existing prototypes
                        const similarProjects = importName
                            ? fuzzyMatch(importName, guardPrototypes, (p) => p.name).slice(0, 5)
                            : [];
                        const sections = [
                            `HOLD ON — confirm these details with the user before deploying:\n`,
                            `Prototype name: "${suggestedName}"`,
                        ];
                        if (similarProjects.length > 0) {
                            sections.push(`\nSimilar existing projects found:\n` +
                                similarProjects.map((m) => {
                                    const p = m.item;
                                    return `  - "${p.name}" (ID: ${p.id})${p.external_url ? ` → ${p.external_url}` : ""}`;
                                }).join("\n") +
                                `\n\nAsk the user: Is this an UPDATE to one of these existing projects, or a NEW project?`);
                        }
                        if (guardCollections.length > 0) {
                            sections.push(`\nNo collection specified. Available collections:\n` +
                                guardCollections.map((c) => `  - ${c.name} (ID: ${c.id})`).join("\n") +
                                `\n\nAsk the user: Which collection should "${suggestedName}" go in?`);
                        }
                        if (!deployName) {
                            const suggestedSlug = suggestedName
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/^-+|-+$/g, "");
                            sections.push(`\nNo deploy name specified. Suggested: "${suggestedSlug}" → https://${suggestedSlug}.vercel.app\n` +
                                `Ask the user: Do you want to use "${suggestedSlug}" or choose a different deploy name?`);
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
                        const protoName = importName || repoName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
                    const importResult = await client.importRepo(protoId, repo_url, deployName);
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
                            ]).catch((err) => console.error("Auto-generate feedback topics failed (non-blocking):", err));
                            importTopicsGenerated = true;
                        }
                    }
                    catch (err) {
                        console.error("Feedback topics check failed (non-blocking):", err);
                    }
                    const importPostNotes = [];
                    if (importTopicsGenerated)
                        importPostNotes.push("Feedback topics auto-generated for your team.");
                    if (importResult.indexNote)
                        importPostNotes.push(`⚠ ${importResult.indexNote}`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Repo imported and deploying!\n\n${importResult.deployName ? `Deploy name: ${importResult.deployName}\n` : ""}Live URL: ${importResult.deployUrl}\nRepo: ${importResult.repoUrl}\nVibeSharing: ${VIBESHARING_URL}/dashboard/projects/${protoId}\nFiles imported: ${importResult.fileCount || "unknown"}\n\nPushes to the VibeSharing repo will auto-deploy to Vercel.${importPostNotes.length > 0 ? "\n\n" + importPostNotes.join("\n") : ""}`,
                            },
                        ],
                    };
                }
                case "resolve_target": {
                    const { collection_name: collName, project_name: projName, deploy_name: desiredDeployName, } = (args || {});
                    // Fetch collections and prototypes in parallel
                    const [collResult, protoResult] = await Promise.all([
                        client.listCollections(),
                        client.listPrototypes(),
                    ]);
                    const allCollections = collResult.collections || [];
                    const allPrototypes = protoResult.prototypes || [];
                    const sections = [];
                    // --- Collection matching ---
                    if (collName) {
                        const collMatches = fuzzyMatch(collName, allCollections, (c) => c.name);
                        if (collMatches.length === 0) {
                            sections.push(`COLLECTION: No match for "${collName}".\n` +
                                `Available collections:\n` +
                                allCollections
                                    .map((c) => `  - ${c.name} (ID: ${c.id})`)
                                    .join("\n") +
                                `\n\nAsk the user: Which collection should this go in? Or create a new one?`);
                        }
                        else if (collMatches[0].score >= 0.9) {
                            const best = collMatches[0].item;
                            sections.push(`COLLECTION: Matched "${collName}" → "${best.name}" (ID: ${best.id})`);
                            // Show prototypes in this collection for context
                            const collProtos = allPrototypes.filter((p) => p.folder_id === best.id);
                            if (collProtos.length > 0) {
                                sections.push(`Existing projects in "${best.name}":\n` +
                                    collProtos
                                        .map((p) => `  - ${p.name} (ID: ${p.id})${p.external_url ? ` → ${p.external_url}` : ""}`)
                                        .join("\n") +
                                    `\n\nAsk the user: Should this be a NEW project in "${best.name}", or an update to one of these existing projects?`);
                            }
                        }
                        else {
                            // Fuzzy matches but not confident
                            sections.push(`COLLECTION: "${collName}" is not an exact match. Did the user mean one of these?\n` +
                                collMatches
                                    .slice(0, 5)
                                    .map((m) => {
                                    const c = m.item;
                                    return `  - "${c.name}" (ID: ${c.id}, confidence: ${Math.round(m.score * 100)}%)`;
                                })
                                    .join("\n") +
                                `\n\nAsk the user to confirm which collection.`);
                        }
                    }
                    else {
                        // No collection name given — show all options
                        if (allCollections.length > 0) {
                            sections.push(`COLLECTION: Not specified. Available collections:\n` +
                                allCollections
                                    .map((c) => `  - ${c.name} (ID: ${c.id})`)
                                    .join("\n") +
                                `\n\nAsk the user: Which collection should this prototype go in? Or create a new one?`);
                        }
                        else {
                            sections.push(`COLLECTION: No collections exist yet. Ask the user if they want to create one.`);
                        }
                    }
                    // --- Project matching ---
                    if (projName) {
                        const projMatches = fuzzyMatch(projName, allPrototypes, (p) => p.name);
                        if (projMatches.length === 0) {
                            sections.push(`PROJECT: No match for "${projName}". This will be a new project.\n` +
                                `Ask the user to confirm the name for the new project.`);
                        }
                        else if (projMatches[0].score >= 0.9) {
                            const best = projMatches[0].item;
                            sections.push(`PROJECT: Matched "${projName}" → "${best.name}" (ID: ${best.id})${best.external_url ? `\n  Current URL: ${best.external_url}` : ""}\n\n` +
                                `Ask the user: Deploy as an UPDATE to "${best.name}", or create a NEW project?`);
                        }
                        else {
                            sections.push(`PROJECT: "${projName}" is not an exact match. Close matches:\n` +
                                projMatches
                                    .slice(0, 5)
                                    .map((m) => {
                                    const p = m.item;
                                    return `  - "${p.name}" (ID: ${p.id}, confidence: ${Math.round(m.score * 100)}%)`;
                                })
                                    .join("\n") +
                                `\n\nAsk the user: Is this an update to one of these, or a new project?`);
                        }
                    }
                    // --- Deploy name ---
                    if (desiredDeployName) {
                        const slug = desiredDeployName
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "-")
                            .replace(/-{2,}/g, "-")
                            .replace(/^-+|-+$/g, "");
                        sections.push(`DEPLOY NAME: "${slug}" → will deploy to https://${slug}.vercel.app\n` +
                            `(Availability will be checked at deploy time. If taken, a suffix will be added.)\n\n` +
                            `Ask the user: Do you want to name this deployment "${slug}"?`);
                    }
                    else {
                        sections.push(`DEPLOY NAME: Not specified.\n` +
                            `Ask the user: Do you want a custom deploy name (e.g., "erg-v3-teams" → erg-v3-teams.vercel.app), or auto-generate one?`);
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
                case "add_context_link": {
                    const { folder_id, project_id, title, url, note } = args;
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
                    const { folder_id, project_id } = args;
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
                        .map((l) => `- ${l.title}\n  ID: ${l.id}${l.url ? `\n  URL: ${l.url}` : " (note)"}${l.note ? `\n  Note: ${l.note}` : ""}\n  Added: ${new Date(l.created_at).toLocaleDateString()}`)
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
                    const { link_id } = args;
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
                    const { project_id, topics, brief, focus } = args;
                    const feedbackFocus = focus || "full";
                    const themeLabels = {
                        vision: "Vision Alignment",
                        feasibility: "Feasibility",
                        design: "Design Fidelity",
                        interaction: "Interaction Design",
                    };
                    const focusLabels = {
                        awareness: "Awareness only",
                        design: "Design direction",
                        feasibility: "Technical feasibility",
                        vision: "Vision alignment",
                        interaction: "Interaction design",
                        full: "Full review",
                    };
                    // Store brief and focus
                    try {
                        await client.updateFeedbackBrief(project_id, brief || "", feedbackFocus);
                    }
                    catch (err) {
                        console.error("Failed to store feedback brief/focus:", err);
                    }
                    // Awareness mode: no questions, just the brief
                    if (feedbackFocus === "awareness") {
                        // Clear any existing auto-generated questions
                        try {
                            await client.generateFeedbackTopics(project_id, []);
                        }
                        catch {
                            // OK if this fails — just means no old auto topics to clear
                        }
                        const lines = [
                            `📢 Prototype set to awareness mode — no feedback questions will be shown.`,
                        ];
                        if (brief) {
                            lines.push("", `📋 Brief saved: "${brief.substring(0, 100)}${brief.length > 100 ? "..." : ""}"`);
                        }
                        lines.push("", "Stakeholders will see this as an FYI with the Context tab available.", "They can still leave general comments if they choose to.");
                        return {
                            content: [{ type: "text", text: lines.join("\n") }],
                        };
                    }
                    // All other modes: generate questions
                    if (!topics || topics.length === 0) {
                        return {
                            content: [{ type: "text", text: "Error: At least one topic is required when focus is not 'awareness'." }],
                        };
                    }
                    // Sort topics: focused theme first, then others
                    const sortedTopics = feedbackFocus !== "full"
                        ? [
                            ...topics.filter(t => t.theme === feedbackFocus),
                            ...topics.filter(t => t.theme !== feedbackFocus),
                        ]
                        : topics;
                    const result = await client.generateFeedbackTopics(project_id, sortedTopics);
                    const created = result.topics || [];
                    const lines = [
                        `✅ Created ${created.length} feedback question${created.length === 1 ? "" : "s"} (focus: ${focusLabels[feedbackFocus] || feedbackFocus}):`,
                        "",
                        ...created.map((t, i) => {
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
                    lines.push("", "Previous auto-generated questions were replaced. Manual questions are untouched.");
                    return {
                        content: [{ type: "text", text: lines.join("\n") }],
                    };
                }
                case "diagnose": {
                    const result = await client.diagnose();
                    const lines = [
                        `VibeSharing Health Check (MCP v${CURRENT_VERSION})`,
                        "========================",
                    ];
                    // Token status
                    if (result.token?.valid) {
                        lines.push(`\u2713 Token: valid (org: ${result.token.org}, role: ${result.token.role})`);
                    }
                    else {
                        lines.push(`\u2717 Token: invalid — ${result.token?.error || "unknown error"}`);
                    }
                    // GitHub status
                    if (result.github?.connected) {
                        lines.push(`\u2713 GitHub: connected (@${result.github.username})`);
                    }
                    else {
                        lines.push(`\u2717 GitHub: not connected — connect at ${VIBESHARING_URL}/dashboard/account`);
                    }
                    // Deploy locks
                    if (result.deploy_locks?.stuck > 0) {
                        const cleared = result.deploy_locks.cleared || 0;
                        const names = (result.deploy_locks.prototypes || [])
                            .map((p) => p.name)
                            .join(", ");
                        if (cleared > 0) {
                            lines.push(`\u2717 Deploy locks: ${result.deploy_locks.stuck} stuck lock(s) found on: ${names} — cleared ${cleared}`);
                        }
                        else {
                            lines.push(`\u2717 Deploy locks: ${result.deploy_locks.stuck} stuck lock(s) on: ${names}`);
                        }
                    }
                    else {
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
                    }
                    else {
                        lines.push(`\u2713 Recent deploys (24h): ${successful} successful, 0 failed`);
                    }
                    // Prototypes
                    const total = result.prototypes?.total || 0;
                    const withoutUrl = result.prototypes?.without_url || 0;
                    if (withoutUrl > 0 && total > 0) {
                        lines.push(`\u26A0 Prototypes: ${withoutUrl} of ${total} not deployed yet`);
                    }
                    else {
                        lines.push(`\u2713 Prototypes: ${total} total, all have deploy URLs`);
                    }
                    // Issues summary
                    const issues = [];
                    if (!result.token?.valid)
                        issues.push("Token is invalid. Get a new one from Account Settings.");
                    if (!result.github?.connected)
                        issues.push("GitHub not connected. Connect at Account Settings to enable Push to Deploy.");
                    if (result.deploy_locks?.cleared > 0) {
                        issues.push(`${result.deploy_locks.cleared} stuck deploy lock(s) were cleared. Retry your deploy.`);
                    }
                    if (failed > 0)
                        issues.push(`${failed} deploy error(s) in the last 24h. Check the errors above.`);
                    if (issues.length > 0) {
                        lines.push("", "Issues found:");
                        for (const issue of issues) {
                            lines.push(`- ${issue}`);
                        }
                    }
                    else {
                        lines.push("", "No issues found. Everything looks good!");
                    }
                    return {
                        content: [{ type: "text", text: lines.join("\n") }],
                    };
                }
                case "send_support_request": {
                    const { subject, description, context } = args;
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
        }
        catch (error) {
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
    // Prepend unread feedback summary on the first successful tool call
    if (pendingFeedbackCheck && !toolResult.isError) {
        const feedbackSummary = await pendingFeedbackCheck;
        pendingFeedbackCheck = null; // Only show once per session
        if (feedbackSummary) {
            toolResult.content.unshift({ type: "text", text: feedbackSummary + "\n\n---\n" });
        }
    }
    return toolResult;
});
// List available resources (prototypes as resources)
server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
    try {
        const result = await client.listPrototypes();
        const prototypes = result.prototypes || [];
        return {
            resources: prototypes.map((p) => ({
                uri: `vibesharing://prototype/${p.id}`,
                name: p.name,
                description: p.description || `Prototype: ${p.name}`,
                mimeType: "application/json",
            })),
        };
    }
    catch {
        return { resources: [] };
    }
});
// Read a specific resource
server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
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
                text: JSON.stringify({
                    prototype: prototype.project,
                    feedback: feedbackResult.feedback,
                }, null, 2),
            },
        ],
    };
});
// Start the server
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("VibeSharing MCP server running");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
