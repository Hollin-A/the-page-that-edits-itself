# System Reference

> **Purpose:** This document is the source of truth about what this system is and how it works. It exists so the agent (Claude Sonnet) can answer suggestions like *"make this paragraph more technical"* or *"add a section about moderation"* without hallucinating facts.
>
> **Usage in the next project:** include this document in the `generate-patch` system prompt so the agent has factual ground truth when writing content about the system. The agent should never invent details about the architecture — if a suggestion asks for technical information not in this document, the agent should write conservatively or decline.

---

## What this system is, in one paragraph

This is a marketing site that any visitor can edit. Suggested changes are reviewed by an AI moderation pass, then a second AI generates the actual code change as a structured patch. The patch becomes a real pull request on GitHub, runs through CI safety checks, auto-merges if it passes, and Vercel rebuilds the site. The whole cycle takes 30–90 seconds. Every change has a traceable PR. No human is in the loop unless a comment is held for owner review.

---

## What's editable

The page is built from an array of typed sections stored in `content/sections.json`. Each section has a type (paragraph, heading, callout, code block, list, link, quote, diagram, etc.), an id, and typed content fields.

A suggestion can ask the agent to:

- **Rewrite** the text inside a section (any tone, voice, length within field limits)
- **Split** one section into multiple
- **Merge** multiple sections into one
- **Reorder** sections
- **Add** a new section of any existing type
- **Remove** a section
- **Change** a section's type (paragraph → callout, etc.)
- **Hide or show** a section via its `visible` field
- **Animate** a section's entrance — change its scroll-triggered animation preset, speed, or delay

Every section accepts an optional `animation` field:
```json
{ "animation": { "preset": "fade-up", "duration": 0.5, "delay": 0 } }
```
Available presets: `fade-up`, `fade-in`, `slide-left`, `slide-right`, `zoom-in`, `none`.
Omitting the field defaults to `fade-up`. Use `"none"` to disable animation on a section.

The agent **cannot** invent new section types, add fields to the schema, or modify any code. The renderer registry is hardcoded; the agent only manipulates structured data that registered components know how to render.

Theme tokens (accent color, optional effects from a fixed catalog) are editable separately via their own tool.

---

## The pipeline (what happens after you submit a suggestion)

1. **Submit** — The comment is posted to `/api/comment` with the `edit_id` of the section being targeted and the suggestion text. The IP is hashed (SHA-256) and rate-limited. A row is inserted to Supabase with status `queued`. An event is sent to Inngest.

2. **Load** — The Inngest function loads the comment row.

3. **Kill switch check** — Reads the `kill_switch` row from the `settings` table. If active, the pipeline halts immediately and the comment is marked `failed`. No API spend is incurred.

4. **Moderate** — Claude Haiku reads the suggestion and returns a verdict: `safe`, `unsafe`, or `off-topic`. Anything not `safe` is rejected at this step.

5. **Generate** — Claude Sonnet receives the current content, the target `edit_id`, and the suggestion. It returns a structured patch by calling the `update_sections` tool (or the equivalent for theme).

6. **Validate** — The patch is run through the relevant Zod schema. Invalid patches throw and the comment is marked `failed`.

7. **(Held comments only)** — If the suggestion meets hold conditions (low agent confidence, require_approval enabled, etc.), the patch is saved and the comment marked `held`. The owner reviews it in the admin panel. On approval, the pipeline re-generates from the current file state to avoid stale-patch merge conflicts.

8. **Commit and open PR** — Octokit creates a branch, writes the patched file, opens a PR with a commit message in the format `agent(edit_id): description`. Auto-merge is enabled.

9. **CI** — A GitHub Actions workflow checks every changed file against an allowlist (`content/`, `theme/`, `overrides/`). Any file outside the allowlist blocks the merge. This is the safety wall: the agent literally cannot modify application code, no matter what.

10. **Merge** — If CI passes, GitHub auto-merges.

11. **Deploy** — Vercel rebuilds on the merge. ISR refreshes the public page within 60 seconds.

12. **Mark merged** — The comment row is updated to `merged` with the PR URL and the agent's reasoning.

---

## Architecture and tech stack

- **Frontend and rendering:** Next.js App Router with ISR (`revalidate = 60`) so updated content reaches visitors without a manual refresh
- **Hosting:** Vercel
- **Database:** Supabase (Postgres) with Realtime enabled on the `comments` table
- **Pipeline orchestration:** Inngest — handles retries, step isolation, observability
- **AI models:** Claude Haiku for moderation, Claude Sonnet for code generation. Both via the Anthropic API.
- **Authentication:** Auth.js (NextAuth v5) with GitHub OAuth
- **Repository operations:** Octokit, using a fine-grained GitHub PAT scoped to this repository with `contents: write` and `pull_requests: write` permissions
- **Schema validation:** Zod — used by both the API layer and the agent patch validator. Same schemas, single source of truth.
- **Styling:** Tailwind CSS

---

## Safety model

There are several independent walls. A failure in any one does not compromise the others.

1. **Rate limiting** — 3 submissions per hour for anonymous users (if anonymous is enabled), 20 per hour for GitHub-authenticated users. Tracked by hashed IP.

2. **AI moderation gate** — Every suggestion passes through Haiku before any Sonnet call. Off-topic and unsafe content is rejected cheaply, before the expensive generation step.

3. **Element locking** — While a comment is in the pipeline, its target element is locked. Further submissions for the same element are rejected with HTTP 409 until the comment resolves.

4. **Zod schema validation** — The agent's output is validated against strict schemas before any commit happens. Bad shapes, bad values, missing fields — all caught at this step.

5. **CI allowlist** — A GitHub Actions workflow blocks any PR that touches files outside the allowlist. The agent can never modify application code.

6. **Kill switch** — The owner can halt the entire pipeline instantly via the admin panel. Active kill switch marks new comments as `failed` before any API call.

7. **Anthropic spend cap** — A monthly hard limit set in the Anthropic console. When the cap is reached, the API returns errors and the pipeline marks comments `failed`. The financial ceiling is fixed regardless of traffic.

8. **Held-comment queue** — Optional human approval step for low-confidence agent outputs or sensitive edits. The owner reviews and approves; the patch is re-generated against current state on approval to avoid stale-patch merge issues.

---

## What proves the system is real, not a database

The most common skepticism is *"this is just a database with extra steps."* The following features prove otherwise:

- **Every change has a real GitHub PR.** The activity panel links to actual pull requests in the repository. Anyone can read the commit, the diff, the merge timestamp.
- **Structural changes happen.** A suggestion can split a paragraph into three, reorder sections, add a callout. A pure database cannot rearrange page structure.
- **Real CI failures are visible.** If a suggestion produces an invalid patch (bad hex color, oversized text), the activity panel shows the failure with the actual reason. Database-backed sites have no equivalent failure mode.
- **The pipeline takes 30–90 seconds.** The latency is visible — moderating, generating, building, deploying — because real work is happening at each step.
- **The codebase is public.** The repository, the commit history, the CI configuration, and the Inngest workflow are all viewable.

---

## Voice and tone for content about this system

When the agent writes content describing the system, the following voice guidance applies:

- **Factual over evocative.** Describe what the system does. Avoid hype.
- **Specific over abstract.** "Claude Sonnet generates a structured patch" beats "AI works its magic."
- **Active over passive.** "The agent opens a pull request" beats "A pull request is opened."
- **Concrete numbers when available.** Rate limits, timing, model names, file paths are all worth mentioning when relevant.
- **Acknowledge limits.** The system has clear constraints (only data edits, never code; only fixed section types). Honesty about limits is more interesting than glossing over them.
- **No marketing superlatives.** Avoid "revolutionary," "powerful," "cutting-edge." The thing is interesting because it's real, not because it claims to be.

---

## Things the agent should *never* claim

- That the system uses any AI provider other than Anthropic
- That the agent can write or modify code (it cannot — only structured data)
- That there is no human oversight (the kill switch and held-comment queue exist)
- That suggestions are guaranteed to be applied (moderation, validation, and CI can all reject)
- That changes are instant (the pipeline takes time and that's visible)
- Specific company names, customer names, testimonials, or social proof that don't appear in this document or in `content/sections.json`

If a suggestion asks the agent to add content of a type that can't be grounded in this document, the agent should either rewrite the suggestion conservatively or output a section flagging that the requested content is unverifiable.
