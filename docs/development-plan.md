# Development Plan

A phase-by-phase build guide for the v0 prototype. Each phase has a clear scope and a checkpoint — the checkpoint must pass before moving to the next phase.

---

## Phase 0 — Infrastructure setup

Before writing any feature code, all external services must be wired up and verified.

**Tasks:**
- Create Supabase project, run migrations (`supabase/migrations/0001_init.sql`) — comments table, rate_limits table, Realtime enabled on comments
- Create Inngest account, note event key + signing key
- Create Anthropic API key, set a low daily spend cap (e.g. $5)
- Create a GitHub fine-grained PAT scoped to this repo with `contents: write` and `pull_requests: write` permissions
- Connect Vercel to the repo, confirm auto-deploy on `main` is enabled
- Add all env vars to `.env.local` (locally) and Vercel project settings (production)
- Commit `.env.example` with all required keys listed, no values

**Checkpoint:**
- `npm run dev` runs without errors
- Vercel deploys the default page on push to `main`
- Supabase tables exist and are visible in the dashboard

---

## Phase 1 — The editable page

Build the static marketing page with the editable surface. No API or agent work yet.

**Tasks:**
- Create `content/hero.json` with `title` and `subtitle` fields
- Create `theme/tokens.json` with `accent` field (hex color)
- Build `app/page.tsx` — renders hero title, hero subtitle, and an accent color swatch, reading from the JSON files statically
- Build `components/EditableElement.tsx` — wraps any element, adds a corner comment icon that appears on hover
- Build `components/CommentPopover.tsx` — opens on icon click, contains a textarea and submit button (not wired to any API yet)
- Apply the accent token as a CSS variable so it cascades to relevant elements

**Checkpoint:**
- Page loads and displays content from the JSON files
- Hovering an editable element reveals the corner icon
- Clicking the icon opens the comment popover
- No console errors

---

## Phase 2 — Zod schemas

Establish the single source of truth for all data shapes before writing any API or agent code. Everything downstream depends on this file.

**Tasks:**
- Create `lib/schemas.ts` with:
  - `HeroContentSchema` — validates `content/hero.json` shape
  - `ThemeTokensSchema` — validates `theme/tokens.json` shape (accent must be a valid 6-digit hex)
  - `ModerationResultSchema` — `{ verdict: "safe" | "unsafe" | "off-topic", reason: string }`
  - `CommentSchema` — shape of a stored comment row
  - `UpdateContentTool` — Anthropic tool definition for content edits
  - `UpdateThemeTool` — Anthropic tool definition for theme edits

**Checkpoint:**
- Schemas import cleanly with no TypeScript errors
- A manual `.parse()` call against a valid object passes
- A manual `.parse()` call against an invalid object (e.g. accent set to `"reddish"`) throws with a clear error

---

## Phase 3 — Comment submission API

Wire the popover to a real API endpoint. The Inngest workflow doesn't need to exist yet — just the event trigger.

**Tasks:**
- Create `lib/supabase.ts` — Supabase client (service role for server, anon for client)
- Create `inngest/client.ts` — Inngest client config
- Create `app/api/comment/route.ts`:
  - Validate request body against a submission schema (edit_id + text)
  - Hash the IP with SHA-256 (never store raw IPs)
  - Check rate limit: reject with 429 if more than 3 comments in the last hour from this IP
  - Insert comment row to Supabase with status `queued`
  - Send `comment/submitted` event to Inngest
  - Return the new comment ID
- Wire `CommentPopover.tsx` to POST to `/api/comment`

**Checkpoint:**
- Submit a comment via the popover → row appears in Supabase with status `queued`
- Inngest event appears in the Inngest dev UI at `localhost:8288` (even with no workflow registered yet)
- Submit 4 comments rapidly from the same IP → 4th returns 429
- Submit with missing fields → returns 400

---

## Phase 4 — The agent pipeline

The heart of the system. Build the Inngest workflow step by step. Each step should be verified individually before adding the next.

**Tasks:**
- Create `app/api/inngest/route.ts` — serves the Inngest webhook handler
- Create `lib/github.ts` — Octokit wrapper with `commitAndOpenPR` function
- Create `lib/anthropic.ts` — Anthropic client initialisation
- Create `inngest/functions/processComment.ts` with these steps in order:

  1. **load-comment** — fetch the comment row from Supabase
  2. **moderate** — call Claude Haiku, parse `ModerationResultSchema`; if verdict is not `safe`, update row to `rejected` and stop
  3. **generate-patch** — update row to `generating`, call Claude Sonnet with `UpdateContentTool` and `UpdateThemeTool`, extract the tool use block
  4. **validate-patch** — run the patch through the relevant Zod schema; throw if invalid so Inngest surfaces it as a retryable error
  5. **create-pr** — call `commitAndOpenPR`, merge current file + patch, commit to a new branch, open PR, auto-merge
  6. **mark-deployed** — update row to `deployed`, store patch + PR URL + routing reasoning

**Checkpoint:**
- Submit a safe copy edit → all 6 steps complete in the Inngest dev UI → PR appears on GitHub → row in Supabase shows `deployed`
- Submit a theme edit ("make the accent more red") → agent selects `UpdateThemeTool` instead of `UpdateContentTool`
- Submit a bad-faith comment ("write something offensive") → row shows `rejected`, pipeline stops at step 2, no PR opened
- Force an invalid generation (modify the prompt temporarily) → Inngest trace shows error at validate-patch step, no PR opened, step is marked as failed not silently swallowed

---

## Phase 5 — CI safety net

The second wall that prevents the agent from modifying anything outside the permitted files.

**Tasks:**
- Create `.github/workflows/check-allowlist.yml`
- Workflow runs on all PRs targeting `main`
- Checks every changed file against an allowlist: `content/hero.json`, `theme/tokens.json`
- Fails with a clear message if any file outside the allowlist is touched

**Checkpoint:**
- Manually open a PR that modifies `app/page.tsx` → CI fails with "Disallowed file changed"
- An agent-opened PR that only touches `content/hero.json` → CI passes
- Confirm the allowlist check is required before merge (branch protection rule on `main`)

---

## Phase 6 — Real-time activity feed

Surface the pipeline status to visitors as it progresses.

**Tasks:**
- Create `components/ActivityFeed.tsx`:
  - On mount, fetch the 10 most recent comments from Supabase ordered by `created_at` desc
  - Subscribe to Supabase Realtime on the `comments` table for all change events
  - On each change event, update the relevant row in local state
  - Display edit_id, status, comment text, and reasoning (when available) for each entry
- Mount `ActivityFeed` on `app/page.tsx`

**Checkpoint:**
- Open the page in two browser tabs
- Submit a comment in tab 1
- In tab 2, watch the feed update through `queued → generating → deployed` without a page refresh
- Confirm the feed shows the agent's routing reasoning once the row is deployed

---

## Phase 7 — End-to-end production verification

Validate the full system works in production, not just local dev.

**Tasks:**
- Push the branch to `main` and confirm Vercel deploys successfully
- Set all env vars in Vercel project settings (Inngest requires the production signing key, not the dev one)
- Configure the Inngest production environment to point at the Vercel deployment URL for the webhook
- Run the full happy path on the production URL

**Checkpoint:**
- A comment submitted on the live production site results in a visible change on that same site within 1–3 minutes
- The activity feed updates in real time for a second browser tab open simultaneously
- A bad-faith comment is rejected and never reaches GitHub
- The GitHub repo shows an agent-opened PR that was auto-merged with a correctly formatted commit message
- The Inngest production dashboard shows the completed workflow trace

---

## v0 Done

When Phase 7 passes, v0 is complete. Every architectural assumption from `docs/architecture.md` has been validated in production.

---

---

# v1 — Full system

---

## Phase 8 — Override layer

Add a third editable layer for CSS and layout overrides, alongside the existing content and theme layers.

**Tasks:**
- Create `overrides/index.json` with an initial set of overrideable properties (e.g. `heroFontSize`, `heroFontWeight`, `heroPadding`)
- Add `OverridesSchema` to `lib/schemas.ts` — validates the shape of `overrides/index.json`
- Add `UpdateOverrideTool` to `lib/schemas.ts` — Anthropic tool definition for override edits
- Register `UpdateOverrideTool` in `inngest/functions/processComment.ts` alongside the existing two tools
- Add `update_override` branch to the validate-patch and create-pr steps
- Add `overrides/index.json` to the CI allowlist in `.github/workflows/check-allowlist.yml`
- Apply override tokens as CSS variables in `app/page.tsx` alongside the existing accent token
- Wrap relevant elements with `EditableElement` using `override.*` edit IDs

**Checkpoint:**
- Submit a suggestion targeting an override element → agent selects `UpdateOverrideTool` instead of content or theme tools
- PR modifies `overrides/index.json` only → CI allowlist passes
- Submit suggestions targeting all three layers in sequence → agent routes each to the correct tool
- Invalid override value (e.g. `heroFontSize: "large"` instead of a valid CSS value) → validate-patch step throws, no PR opened

---

## Phase 9 — X-ray view

A toggleable overlay that makes the editable surface and pipeline state legible at a glance.

**Tasks:**
- Add x-ray toggle state to a client-side context provider (`components/XRayProvider.tsx`)
- Three entry points that activate x-ray mode: ambient pill button (bottom-right corner), `⌘.` keyboard shortcut, and clicking any item in the activity feed
- When active, overlay each `EditableElement` with its `data-edit-id` label and a comment count badge
- Show a pipeline sidebar listing recent comments with status, routing reasoning, and PR link for each
- Add deep-link support: `?xray=<edit-id>` opens x-ray mode with that element highlighted on page load
- Ensure x-ray mode is dismissed by pressing `Escape`, clicking the pill button, or the × in the sidebar header (outside-click is intentionally not used — it conflicts with the pill toggle due to native DOM event ordering)

**Checkpoint:**
- `⌘.` toggles x-ray overlay; all three editable elements show their `data-edit-id` labels
- Clicking a feed item opens x-ray mode focused on the relevant element
- Navigating to `?xray=hero.title` opens x-ray mode with hero.title highlighted
- `Escape`, pill button, and × button all dismiss x-ray mode
- No layout shift or console errors when toggling

---

## Phase 10 — Element locking + resolved edit tracking

Prevent simultaneous conflicts by locking an element while its comment is in the pipeline. Also adds accurate tracking of which element the agent actually wrote to.

**Why locking over voting:** voting introduces social mechanics and explanation complexity that aren't warranted at this stage. Locking is the simpler, more honest first step — an element being actively processed is genuinely unavailable, and visitors can clearly see why. Voting is preserved as a later option if scale demands it.

**Tasks:**
- Add `resolved_edit_id` column to the `comments` table (nullable text) — populated by the pipeline after generation, set to the element that was actually modified (derived from the tool name and patch)
- Update `processComment.ts` to write `resolved_edit_id` when marking the comment as merged
- Update `CommentSchema` in `lib/schemas.ts` to include `resolved_edit_id`
- On comment submission in `app/api/comment/route.ts`, check if any comment for the same `edit_id` is currently active (status in `queued`, `moderating`, `generating`) — if so, return 409 with a clear message
- Update `EditableElement.tsx` to show a locked state when the element has an active comment: disable the comment icon, show a subtle indicator (e.g. pulsing dot or lock icon)
- Update `ActivityFeed.tsx` and `XRaySidebar.tsx` to display `resolved_edit_id` when it differs from `edit_id`

**Checkpoint:**
- Submit a comment on `hero.title` → while it's in the pipeline, the `hero.title` element shows a locked indicator and the comment icon is disabled
- Submit a second comment on `hero.title` while the first is active → API returns 409
- Submit a comment on `hero.subtitle` while `hero.title` is locked → proceeds normally (lock is per-element)
- Comment a font size change via the `theme.accent` element → `edit_id` is `theme.accent`, `resolved_edit_id` is `override.typography` — feed shows the resolved target
- Element unlocks once the comment reaches `merged` or `rejected`

---

## Phase 11 — Live page content refresh

Remove the manual-refresh requirement after an agent deployment.

**Tasks:**
- Replace static JSON imports in `app/page.tsx` with `fs.readFileSync` calls so content, theme, and override files are read at render time (static imports are bundled at build time and never update during a running deployment)
- Add `export const revalidate = 60` to `app/page.tsx` — this is the previous-model ISR config (Next.js 16 without `cacheComponents: true` uses route segment config, not the `use cache` directive)
- Verify the build output shows `Revalidate: 1m` for the `/` route

**Checkpoint:**
- Submit a comment → agent merges PR → Vercel redeploys → page content updates within ~60 seconds without a manual refresh
- A second browser tab open during the deployment picks up the new content on next background revalidation

**Status: complete** — `export const revalidate = 60` + `fs.readFileSync` shipped in PR #24.

---

## Phase 12 — OAuth login

Replace anonymous submissions with attributed ones.

**Tasks:**
- Add `next-auth` with GitHub and Google providers
- Add `user_id` and `user_name` columns to the `comments` table (nullable for legacy anonymous rows)
- Gate the comment submission API: logged-in users get a higher rate limit (e.g. 20/hour vs 3/hour for anonymous)
- Show avatar and username in the activity feed for attributed comments
- Send a notification (email or GitHub) when a logged-in user's suggestion goes live

**Checkpoint:**
- Sign in with GitHub → submit a comment → row in Supabase includes `user_id` and `user_name`
- Logged-in user submits 5 comments in an hour → all accepted (higher rate limit)
- Anonymous user submits 4 comments in an hour → 4th is rejected with 429
- User whose suggestion deploys receives a notification

**Status: complete** — shipped in PR #34. Decisions and deviations:
- GitHub-only OAuth (Google provider dropped — not needed for v1)
- GitHub avatars derived at render time from stored `user_id` via `https://avatars.githubusercontent.com/u/{id}` — no separate storage needed
- Attribution shown in activity panel and X-ray sidebar inline history
- Notification on deploy not shipped — deferred

---

## Phase 13 — Floating activity panel

Move the activity feed from inline page content to a floating panel, making the default view look like a normal marketing site. The feed is only visible when deliberately opened.

**Why now:** the inline feed breaks the "normal site" premise — a real visitor landing on the page should see a clean marketing site, not a live feed below the hero. The floating panel restores this, and its position (bottom-right) sets up the shared chrome that Phase 14's ops panel will build on.

**Tasks:**
- Remove the inline `<ActivityFeed />` from `app/page.tsx`
- Add an ambient pill component (bottom-right, fixed) that shows a live queue count and time of last change, sourced from `XRayProvider` comment state
  - Pill design: pulse dot · **N** in queue · last change Xm ago
  - Clicking the pill opens the activity panel
- Build a floating activity panel (`components/ActivityPanel.tsx`) that renders as a fixed card (bottom-right, 420px wide, max-height 70vh):
  - Panel header: pulse dot + "Live activity" title + close (×) button
  - Stats bar: in queue · applied today · mod pass rate (counts derived from comment state)
  - Feed list: each item shows a circular status badge (✓ / … / · / ! / ×), a styled `edit_id` target tag, the comment text, a layer tag (content / theme / override), the agent reasoning block with left border, and a relative timestamp
  - Closing the panel returns to the ambient pill view
- Integrate the ambient pill and X-ray button into a shared bottom-right cluster (pill on the left, X-ray button on the right — both always visible in normal and feed views; pill hides in X-ray view)
- Simplify `XRaySidebar` — strip the full comment feed from the sidebar (it now lives in the activity panel). Sidebar retains: element list with per-element comment counts and status dots, click-to-focus behaviour, and PR links. The full narrative feed (reasoning block, timestamps, attribution) is deferred to the activity panel.

**Checkpoint:**
- Default view shows a clean site with only the ambient pill cluster visible (no inline feed)
- Clicking the ambient pill opens the floating panel; × closes it back to the pill
- Panel updates in real time as comments progress through the pipeline
- X-ray button remains accessible in both pill and panel states
- No layout shift on the page content when panel opens/closes (panel is fixed, not in flow)

**Status: complete** — shipped in PRs #36. Decisions and deviations:
- `ActivityFeed` component deleted; fully replaced by `ActivityPanel`
- XRaySidebar status dot shows green pulse only when something is actively in-flight on that element (not the latest comment's status) — avoids ambiguity e.g. "Rejected · 14" reading as 14 rejections
- Clicking an element row (or its label badge on the page) expands an inline history of the last 3 comments for that element in the sidebar; if more exist, a "see all in activity panel →" link opens the panel. The focused element is always the expanded one — no explicit collapse needed
- Rejected/failed rows in the activity panel have a coloured left border and a text status pill for at-a-glance scanning
- X-ray pill cluster hidden on `/admin` routes

---

## Phase 14 — Owner ops panel

Operational controls for the site owner, accessed at a separate URL. There is no public button or link to this route — the owner navigates directly by typing `/admin`.

**Layout:**
- Full-page layout, distinct from the marketing site chrome
- Left sidebar (240px, dark background `#14141A`): brand + OPS tag, nav sections with greyed-out items for deferred features
- Main content area: stats grid, kill switch, activity log

**Tasks:**
- Create a protected route `app/admin/page.tsx` — gate by checking the session email against `ADMIN_EMAIL` env var; redirect to `/` if not authorized
- **Stats grid**: suggestions today, applied today, rejected today, in pipeline — all read from Supabase
- **Kill switch**: a toggle stored in a `settings` Supabase table; when on, the pipeline halts at `check-kill-switch` (before any moderation or API spend) and marks the comment `failed`
- **Activity log**: full unbounded real-time feed with status filter tabs (All / Active / Merged / Rejected), table view with target, suggestion, status, author, timestamp, PR link

**Checkpoint:**
- Navigating to `/admin` without being logged in as the owner redirects to `/`
- Kill switch enabled → new comments halt before moderation, marked `failed` with "Pipeline halted by kill switch" reasoning
- Activity log updates in real time and filters correctly by status
- Stats grid reflects real Supabase data

**Status: complete** — shipped in PR #37. Decisions and deviations:
- Kill switch halts before moderation (not before `generate-patch` as originally planned) — stops all API spend immediately; marks comment `failed` (not `held`)
- Stats grid simplified: suggestions today / applied today / rejected today / in pipeline (spend and avg deploy time deferred — require additional instrumentation)
- X-ray pill cluster hidden on `/admin` routes

**Deferred to v2:**
- Moderation queue with `held` status and Approve / Reject actions
- Spend cap card (requires cost tracking instrumented in the pipeline)
- Allowed scope toggles (content / theme / override layers)
- Ban controls (`banned_ips` table + submission API check)
- Agent prompt editor

---

## v1 Done

Phases 8–14 complete. The system is production-ready with attribution, element locking, a floating activity surface, and a private operator dashboard.

---

---

# v2 — Section list model + hardening

---

## Phase 15 — Schemas

Replace the fixed-shape content schemas with a discriminated-union section list model. This is the data foundation for everything in v2 — no UI or rendering changes yet.

**Tasks:**
- Rewrite `lib/schemas.ts`:
  - Remove `HeroContentSchema`, `OverridesSchema`, `UpdateContentTool`, `UpdateOverrideTool`
  - Add `SectionBaseSchema` — `id` (slug regex), `visible` (boolean, default true)
  - Add all 8 section type schemas extending the base: `HeadingSchema`, `ParagraphSchema`, `CalloutSchema`, `OrderedListSchema`, `BulletListSchema`, `CodeBlockSchema`, `LinkBlockSchema`, `QuoteSchema`
  - Add `SectionSchema` — discriminated union on `type`
  - Add `SectionsFileSchema` — `{ sections: SectionSchema[] }`, min 1, max 50
  - Add `UpdateSectionsTool` — Anthropic tool definition; agent returns the complete sections array, never a diff
  - Keep `ThemeTokensSchema` and `UpdateThemeTool` unchanged
- Export TypeScript types derived from each schema (`z.infer<>`)

**Checkpoint:**
- All schemas import cleanly with no TypeScript errors
- `.parse()` against a valid sections array passes for all 8 types
- `.parse()` against an invalid section (wrong type literal, missing field, field over max length) throws with a clear error
- Discriminated union correctly narrows: a `callout` object fails if it's missing `tone`

---

## Phase 16 — Static render

Build the renderer components and wire up the page. No agent involvement yet — hand-crafted content only.

**Tasks:**
- Create `content/sections.json` with one hand-crafted example of every section type — this replaces `content/hero.json` and `content/overrides/index.json`
- Create `components/sections/` directory with one component per type:
  - `HeadingSection.tsx` — `level` drives h1/h2/h3
  - `ParagraphSection.tsx`
  - `CalloutSection.tsx` — `tone` drives styling (info / warn / success)
  - `OrderedListSection.tsx`
  - `BulletListSection.tsx`
  - `CodeBlockSection.tsx` — styled `<pre>`, no syntax highlighting library yet
  - `LinkBlockSection.tsx`
  - `QuoteSection.tsx`
- Create `components/sections/registry.ts` — maps type strings to renderer components
- Rewrite `app/page.tsx` — loop over `sections`, filter `visible`, wrap each in `EditableElement` with `editId={section.${section.id}}`
- Remove old hero/override rendering from `app/page.tsx`
- Update CI allowlist (`.github/workflows/check-allowlist.yml`) — replace `content/hero.json` and `overrides/index.json` with `content/sections.json`

**Checkpoint:**
- Page renders every section type from `content/sections.json` without errors
- All 8 section types display correctly (inspect each visually)
- Hovering any section reveals the `EditableElement` comment affordance
- Hidden sections (`visible: false`) are not rendered
- CI allowlist: a test PR touching `content/sections.json` passes; one touching `app/page.tsx` fails
- No TypeScript errors, no console errors

---

## Phase 17 — Pipeline rewire

Replace the old tools with `update_sections` in the Inngest function. Full suggestion-to-PR cycle with the new content model.

**Tasks:**
- Update `inngest/functions/processComment.ts`:
  - Replace `UpdateContentTool` + `UpdateOverrideTool` with `UpdateSectionsTool` in the generate-patch step
  - Update validate-patch step to use `SectionsFileSchema`
  - Update create-pr step to write `content/sections.json` (not `hero.json` or `overrides/index.json`)
  - Update `edit_id` convention — sections use `section.{id}`; theme edits continue as `theme.accent`
- Inject `docs/system-reference.md` content into the generate-patch system prompt so the agent has factual grounding when writing content about the system
- Delete `lib/github.ts` helper references to the old file paths; update to `content/sections.json`

**Checkpoint:**
- Submit a text rewrite suggestion → PR opens with a correct diff against `content/sections.json`
- Submit a structural suggestion ("split this into two paragraphs") → PR shows two sections where one existed
- Submit a reorder suggestion → sections array in the PR diff reflects the new order
- Submit a theme suggestion → agent uses `UpdateThemeTool`, not `UpdateSectionsTool`
- Invalid patch (agent invents a new section type) → validate-patch step throws, no PR opened
- Agent reasoning in the PR commit message and comment row reflects the system-reference content accurately

---

## Phase 18 — Security hardening

All planned security features from `docs/security.md` ship in this phase.

**Part A — Simple hardening (fast):**
- Require GitHub sign-in: `app/api/comment/route.ts` returns 401 if no authenticated session. Add `ALLOW_ANONYMOUS=true` env var for local dev only
- Honeypot field: add `<input name="website" className="hidden" tabIndex={-1} autoComplete="off" />` to `CommentPopover`. API route returns 200 silently but does not insert or trigger Inngest if the field is populated
- Anthropic spend cap: set a monthly hard cap in the Anthropic console (not a code change — document the required action)

**Part B — Held-comment moderation queue (substantial):**
- DB migration: add `held` to the `comment_status` enum; add `require_approval` key to the `settings` table (default `false`); add `patch` column to `comments` for storing the generated patch as preview
- Pipeline: add `check-hold` step in `processComment.ts` after `validate-patch` — checks `require_approval` setting; if held, stores patch + reasoning in the comment row, marks status `held`, throws `NonRetriableError` (no PR opened)
- Admin panel: add a **Held** tab to the activity log — each row shows target element, original suggestion text, generated patch as a diff view, agent reasoning, submitter, time in queue, Approve and Reject buttons
- Approve server action: sends a new `comment/approved` Inngest event carrying only the `comment_id`; the pipeline re-runs `generate-patch` against current file state (not the stored patch), skipping the hold check (`approved: true` on the event); the stored patch is preview only
- Reject server action: marks the comment `rejected`, no PR opened

**Checkpoint:**
- Anonymous submission attempt → returns 401
- Honeypot field populated → returns 200, no Supabase row inserted, no Inngest event fired
- Toggle `require_approval = true` in admin → submit a suggestion → comment lands in Held tab, no PR opened
- Approve a held comment → pipeline re-runs generate-patch against current sections.json → PR opens and merges
- Reject a held comment → row status becomes `rejected`, Held tab empties
- Approve a held comment after another suggestion has already merged (stale patch scenario) → re-generated patch reflects current file state, not the stored preview

---

## Phase 19 — Deploy webhook

Close the loop between merge and live deploy. Comments currently sit at `merged` indefinitely; this phase adds a true `deployed` status.

**Tasks:**
- Create `app/api/deploy-webhook/route.ts` — receives Vercel's deployment completion POST, verifies the webhook signature, identifies which branch/commit triggered the deployment, updates matching comment rows from `merged` to `deployed`
- Add `deployed` to the `comment_status` enum (DB migration)
- Update `ActivityPanel.tsx` and `XRaySidebar.tsx` to render `deployed` as a distinct final state (e.g. green check, "live" label) separate from `merged`
- Configure the Vercel project to POST to `/api/deploy-webhook` on deployment success

**Checkpoint:**
- Full cycle ends with the comment row showing `deployed` (not `merged`) after Vercel finishes rebuilding
- Activity panel shows the comment transitioning `merged → deployed` in real time
- Webhook signature check: a POST with an invalid signature returns 401

---

## Phase 20 — Launch content + docs

Write the deliberate public-facing content and refresh the documentation.

**Tasks:**
- Write the final `content/sections.json` — 8–10 sections:
  1. Heading (h1) — page title
  2. Paragraph — one-sentence elevator pitch
  3. Ordered list — the 6-step pipeline
  4. Callout (info) — the safety model / kill switch
  5. Callout (warn) — what the agent cannot do (honest about limits)
  6. Paragraph — what "structural edit" means, with a concrete example
  7. Code block — example agent commit message format
  8. Link block — link to the repo's open PRs
- Add structural suggestion prompts to the page UI: *"Try: 'split this paragraph into three,' 'add a section about moderation,' 'put the list before the callout.'"*
- Rewrite `docs/architecture.md` to reflect the section list model
- Rewrite `README.md` as launch material — not a build journal
- Archive `docs/development-plan.md` and `docs/next-project-guide.md` (artifacts of the prototype build, not relevant to the public repo)

**Checkpoint:**
- Page reads as a coherent, inviting explanation of the system to a first-time visitor
- Structural suggestion prompts are visible and accurate
- `architecture.md` matches the actual v2 implementation
- `README.md` reads as launch copy, not internal notes

---

## v2 Done

Phases 15–20 complete. The system supports structural page edits, a full held-comment moderation queue, GitHub-required attribution, a true deployed status signal, and deliberate launch content.
