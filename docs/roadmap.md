# Roadmap

---

## v0 — Prototype ✓

The vertical slice. Proves the full agentic loop works end-to-end before building the full system.

**Shipped:**
- Single page with three editable surfaces: hero title, hero subtitle, theme accent color
- Corner-icon comment affordance on each editable element
- Comment submission API with IP-based rate limiting (3/hour anonymous)
- Inngest workflow: moderation → generation → schema validation → PR → auto-merge → deploy
- Claude Haiku for moderation, Claude Sonnet for generation
- Structured output via Anthropic tool use, validated against Zod schemas
- Real-time activity feed via Supabase Realtime
- Anonymous-only submissions
- CI allowlist: agent PRs may only touch `content/hero.json` and `theme/tokens.json`

**Deferred to v1:**
- Override layer, element locking, X-ray view, OAuth login, owner ops panel

**Contributor notifications** — dropped entirely. Not warranted at this scale.

---

## v1 — Full system ✓

**Shipped:**

1. **Override layer** — third editable layer (`overrides/index.json`), `update_override` tool, CSS variables applied to the page. Agent routes across all three layers.

2. **X-ray view** — toggleable overlay with `data-edit-id` labels, pipeline sidebar, `⌘.` shortcut, activity-feed click entry point, `?xray=<edit-id>` deep links. Simplified vs original spec: sidebar shows per-element comment history inline (last 3 comments); full narrative feed moved to the activity panel.

3. **Element locking** — while a comment is in the pipeline, its target element is locked (409 on new submissions, disabled affordance on the element). Unlocks on `merged` or `rejected`. `resolved_edit_id` tracked separately from `edit_id` when the agent writes to a different element than the one clicked.

4. **ISR / live content refresh** — `export const revalidate = 60` on `app/page.tsx`; content files read at render time via `fs.readFileSync` (not bundled static imports). Page refreshes within ~60 seconds of a merge without a manual reload.

5. **OAuth login** — GitHub-only (Google dropped — not needed). Higher rate limit for authenticated users (20/hr vs 3/hr anonymous). GitHub avatars via `avatars.githubusercontent.com/u/{id}`. Attribution shown in activity panel and X-ray sidebar. Notification on deploy — deferred.

6. **Floating activity panel** — inline feed removed from the page. Replaced by a fixed bottom-right card (420px, 70vh max). Ambient pill shows live queue count and last-change time. Rejected/failed rows get a coloured left border and a text status pill.

7. **Owner ops panel** — protected `/admin` route gated by `ADMIN_EMAIL`. Stats grid (suggestions / applied / rejected / in pipeline), kill switch (halts pipeline before moderation, marks `failed`, zero API spend), real-time activity log with status filter tabs. Kill switch revalidates the admin page on toggle.

**Deferred to v2:**
- Held-comment moderation queue
- Anthropic spend cap (Anthropic console — not a code change)
- Vercel deploy webhook → true `deployed` status
- Require GitHub sign-in (anonymous still allowed in v1)

**Dropped / deferred indefinitely:**
- Spend cap card in admin (requires cost instrumentation)
- Ban controls
- Agent prompt editor
- Notification on deploy for logged-in users

---

## v2 — Section list model + hardening

The credibility upgrade. Replaces the fixed-shape content model with a dynamic array of typed sections, unlocking structural edits. Adds all deferred security hardening.

**In scope:**

### Section list model *(core change)*
The page is rendered from a single ordered array of typed sections in `content/sections.json`. This is the entire point of v2 — it lets the agent restructure the page, not just rewrite words.

Eight section types at launch:

| Type | Fields |
|---|---|
| `heading` | `level` (1–3), `text` |
| `paragraph` | `text` |
| `callout` | `tone` (info / warn / success), `title`, `body` |
| `ordered-list` | `items[]` |
| `bullet-list` | `items[]` |
| `code-block` | `language`, `code` |
| `link-block` | `text`, `href` |
| `quote` | `text`, `attribution` |

Structural operations now available: rewrite, split, merge, reorder, add, remove, type-change, show/hide. The agent returns the complete sections array on every edit — never a diff. Zod discriminated union validates the shape before any commit.

`hero.json` and `overrides/index.json` are replaced by `content/sections.json`. The CI allowlist is updated accordingly. Everything else — `EditableElement`, pipeline, auth, admin — is unchanged.

### Security hardening
- **Require GitHub sign-in** — anonymous submissions dropped. `ALLOW_ANONYMOUS` env var for local dev only.
- **Honeypot field** — hidden form input; silent reject if populated.
- **Anthropic spend cap** — monthly hard cap set in the Anthropic console before launch. Not a code change.
- **Held-comment moderation queue** — pipeline flags a comment `held` before `create-pr` when `require_approval = true` (owner-toggled in admin) or when agent confidence is below threshold. Admin panel gets a Held tab with Approve / Reject per comment. Approving re-runs `generate-patch` against current file state — stored patch is preview only, not what gets committed.

### Vercel deploy webhook
`/api/deploy-webhook` receives Vercel's deployment completion POST and updates matching comment rows from `merged` to `deployed`. Activity panel and X-ray sidebar surface `deployed` as the true final state.

### Agent ground truth
`docs/system-reference.md` injected into the generate-patch system prompt. Agent has factual grounding when writing content about the system; won't hallucinate architecture details.

### Launch content + docs
Deliberate 8–10 section initial content. Page explicitly surfaces structural suggestion prompts. `architecture.md` and `README.md` rewritten for the v2 model.

**Done when:** a visitor can suggest "split this paragraph into three," watch a PR open with three sections where one existed, and see the page update with `deployed` status — all within 90 seconds.

---

## Later / open questions

These are real features but not warranted at v2 scale. Revisit when there's evidence they're needed.

- **Voting** — vote table, vote endpoint, queue ordering by votes. Useful when simultaneous suggestions per element are common. Skipped in v1 and v2 in favour of element locking as the simpler conflict resolution mechanism.
- **Conflict detection + decision windows** — depends on voting. Deferred alongside it.
- **Diagram section type** — requires pre-built SVG/React components and a maintained slug catalog. Add when there's a specific diagram to ship, not speculatively.
- **Agent confidence scoring** — prompting the model to self-rate certainty is unreliable in practice. `require_approval` flag covers the manual approval case. Revisit if held-queue patterns reveal a real need.
- **PostHog analytics** — add after v2 ships and real traffic exists.
- **GHAW hybrid for PR step** — additional defence-in-depth. CI allowlist is already the hard wall. Defer unless the project gets serious attack surface.
- **Vercel deploy webhook** — moved into v2. ✓
- **Ban controls** — `banned_ips` table + submission API check. Low priority while GitHub sign-in is required.
- **Notification on deploy** — email or in-app notification when a logged-in user's suggestion goes live. Deferred since v1.
