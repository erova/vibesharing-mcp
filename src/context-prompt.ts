/**
 * The "What this is" context prompt, served as the `write-context` MCP prompt.
 * Copy of lib/context-prompt.ts (source of truth: docs/prompts/prototype-context.md).
 * Keep them in sync.
 */
export const WRITE_CONTEXT_PROMPT = `You are writing the context file for a prototype, so that anyone who opens it later (a stakeholder, a teammate, or another AI such as Claude desktop reading it through VibeSharing) understands what it is without having been in this conversation.

**Source material, in this order of authority:**
1. This conversation: what the author asked for, how the request changed, what they pushed back on, what they approved. This is the primary source.
2. Any files or documents the author supplied or you read during the work (briefs, specs, screenshots, references).
3. The prototype's files, only to confirm facts you are about to state (a screen exists, a toggle exists). Never to invent purpose.

If an existing context file exists, call \`get_prototype_context\` first and update it rather than rewriting from scratch: keep what is still true, correct what changed, add what is new.

**Write these sections, in this order, skipping any you have no evidence for. Never pad.**

# <Prototype name>

## What this is
Two or three sentences. What the prototype shows or does, in the author's terms, and the situation it was made for. A stranger should be able to say what it is after reading only this.

## Who it is for and what it should answer
The audience, and the decision or question the prototype exists to help with (for example "show product leaders what a shared home could feel like"). If the author named what they want feedback on, say so here.

## What's in it
The main screens, modes, toggles and flows, described as the author would describe them to a colleague. Include things that are deliberately interactive versus static. Mark roadmap or concept elements as such.

## Decisions and why
Each real decision the author made, with the reason when they gave one. Prefer the form "X, not Y, because Z". Include options the author considered and rejected, and constraints they set ("no guided flows", "US vocabulary", "never use the codename"). This is the highest-value section: it stops the next person from re-opening settled questions.

## Assumptions and open questions
Things you assumed to keep moving, placeholders standing in for real content, and anything the author left undecided or deferred. Label each clearly as an assumption or open.

## Working notes
Only if useful to whoever edits it next: where the source lives, how to rebuild or redeploy, and known traps (things that broke and how). One line each.

**Rules**
- Ground every statement in the conversation or the files. If you are unsure, leave it out or put it under Assumptions. Do not describe features you have not seen.
- Write about the prototype, not about the chat. No "the user asked me to", no timeline of the session, no praise.
- Refer to the author as "the author" or by role. Do not include personal names, customer or contact names, emails, tokens, secrets or internal URLs. Use generic fillers (Acme Inc., Jane Doe) if an example is needed.
- Plain language a non-technical stakeholder can read. Name technologies only where they affect how it can be used or edited.
- Be specific. "A calendar with four lanes and a two-week view" beats "a rich calendar experience".
- 250 to 500 words. Shorter is fine if that is all the evidence supports.
- Output markdown only, no preamble.

**Then:** show the draft to the author and, once they accept or correct it, call \`sync_context\` with \`project_id\` and the final text. If you were not given a \`project_id\`, call \`list_prototypes\` (or \`resolve_target\`) to find it and confirm with the author before syncing. Do not sync a draft the author has not seen.`;

export function buildWriteContextPrompt(projectId?: string): string {
  const target = projectId
    ? `\n\nThe prototype's VibeSharing project_id is "${projectId}". Call get_prototype_context with it first to see any existing context, then write or update the context file from this conversation.`
    : `\n\nNo project_id was given. Find the prototype with list_prototypes or resolve_target, confirm which one with the author, then call get_prototype_context with its id to see any existing context.`;
  return WRITE_CONTEXT_PROMPT + target;
}
