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
- Ensure x-ray mode is dismissed by pressing `Escape` or clicking outside the sidebar

**Checkpoint:**
- `⌘.` toggles x-ray overlay; all three editable elements show their `data-edit-id` labels
- Clicking a feed item opens x-ray mode focused on the relevant element
- Navigating to `?xray=hero.title` opens x-ray mode with hero.title highlighted
- Pressing `Escape` dismisses x-ray mode
- No layout shift or console errors when toggling

---

## Phase 10 — Voting

Let visitors vote on pending suggestions to influence processing order.

**Tasks:**
- Add `votes` table to Supabase: `id`, `comment_id` (FK to comments), `ip_hash`, `created_at`
- Add unique constraint on `(comment_id, ip_hash)` to prevent duplicate votes
- Create `app/api/vote/route.ts`: validate comment ID, hash IP, upsert vote row, return updated count
- Update `ActivityFeed.tsx` to show a vote button and count on queued/moderating comments
- Update Inngest `processComment` to order the queue by vote count when multiple comments are pending (highest votes processed first)

**Checkpoint:**
- Vote on a queued comment → count increments in the feed in real time
- Vote twice from the same IP → second vote is rejected (409)
- Two comments queued simultaneously → higher-voted one is processed first
- Voting on a deployed or rejected comment → returns 400

---

## Phase 11 — Conflict detection + decision windows

Prevent two agent edits from overwriting each other on the same target.

**Tasks:**
- On comment submission, check if another comment targeting the same `edit_id` is already in `queued` or `moderating` state
- If a conflict exists, set both to `status: 'contested'` and record a `decision_deadline` (e.g. 10 minutes from now)
- Add a `contested` status to `CommentSchema` and `ActivityFeed` display
- After the decision window expires, an Inngest scheduled function picks the higher-voted comment, sets it back to `queued`, and rejects the other with `reasoning: 'Lost conflict vote'`
- If votes are tied, pick the earlier submission

**Checkpoint:**
- Submit two comments targeting `hero.title` in quick succession → both show `contested` in the feed
- Vote on one → after the decision window, the higher-voted one proceeds, the other is rejected
- Submit two comments targeting different elements → no conflict, both proceed independently
- Tie-break: earlier submission wins

---

## Phase 12 — Live page content refresh

Remove the manual-refresh requirement after an agent deployment.

**Tasks:**
- Add `export const revalidate = 60` to `app/page.tsx` to enable ISR with a 60-second window
- Verify `hero.json` and `tokens.json` are read via `fs` (static import) — confirm Next.js treats them as data dependencies that trigger revalidation on rebuild
- Test that after a Vercel deployment, the page reflects new content within 60 seconds without a manual refresh

**Checkpoint:**
- Submit a comment → agent merges PR → Vercel redeploys → page content updates within ~60 seconds without a manual refresh
- A second browser tab open during the deployment picks up the new content on next background revalidation

---

## Phase 13 — OAuth login

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

---

## Phase 14 — Owner ops panel

Operational controls for the site owner.

**Tasks:**
- Create a protected route `app/admin/page.tsx` — accessible only to a hardcoded owner email (from env)
- Moderation queue view: list all `queued` and `moderating` comments with manual approve/reject controls
- Kill switch: env-gated flag that halts the Inngest pipeline before the generate-patch step
- Spend cap display: read from Anthropic API usage endpoint and display current daily spend vs cap
- Ban controls: add `banned_ips` table; check it in the comment submission API before inserting

**Checkpoint:**
- Owner manually rejects a queued comment → status updates to `rejected`, pipeline does not proceed
- Kill switch enabled → new comments are stored but pipeline halts at generate-patch
- Banned IP submits a comment → 429 returned immediately, no row inserted

---

## v1 Done

When Phase 14 passes, v1 is complete. The system is production-ready with attribution, conflict resolution, operator controls, and a fully legible editing surface.
