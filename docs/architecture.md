# Architecture

## System overview

A Next.js app where every editable element on the page carries a `data-edit-id` attribute. Visitors leave comments on those elements. Each comment triggers a durable Inngest workflow that moderates, generates a structured patch, validates it, commits it to a branch, opens a PR, waits for CI, and auto-merges. Vercel auto-deploys on merge. Supabase Realtime pushes status updates to connected clients.

## Editable elements

Every element the agent is allowed to modify has a `data-edit-id` attribute with a hierarchical dot-notation ID:

```
hero.title
hero.subtitle
theme.accent
override.typography
```

The ID appears in agent prompts, activity feed entries, PR commit messages, and moderation logs. Anything without an ID is intentionally not editable. See [ADR-001](decisions/ADR-001-element-identity.md).

## The three-layer edit model

Edits are routed to one of three layers based on the comment and target element. See [ADR-002](decisions/ADR-002-layered-scope.md).

| Layer | What it holds | Example |
|---|---|---|
| **Theme** | Global design tokens — accent color | `"make the accent more blue"` |
| **Override** | Per-element typography and layout overrides | `"make the title bigger"` |
| **Content** | Copy strings | `"make this headline punchier"` |

The agent's routing decision — which layer to write to — is visible in the activity feed and X-ray view.

## Agent pipeline

Each comment submission triggers this Inngest workflow:

```
1. Comment received → persisted to Supabase, status: queued
2. Moderation (Claude Haiku) → classifies as safe / unsafe / off-topic
   └─ unsafe/off-topic → status: rejected, pipeline stops
3. Generation (Claude Sonnet) → emits a structured JSON patch via tool use
4. Schema validation (Zod) → patch validated against the target layer's schema
   └─ invalid → error surfaced in Inngest trace, pipeline stops
5. Commit + PR (Octokit) → branch created (or recreated for retry safety),
   file patched, PR opened, GitHub auto-merge enabled via GraphQL
6. CI (GitHub Actions) → allowlist check runs on agent/* branches only
   └─ disallowed file touched → CI fails, auto-merge blocked
7. Auto-merge → squash merge to main once CI passes
8. Vercel redeploy → triggered automatically on main push
9. Status update → Supabase row updated to 'merged', Realtime notifies clients
```

Each step is durable and retryable. Failures surface in the Inngest trace UI. Branch creation is idempotent — the branch is deleted before creation so Inngest retries never fail with "reference already exists".

**Note on status:** the pipeline sets `status: merged` (not `deployed`) once auto-merge is enabled, because the pipeline has no signal for when Vercel finishes building. The activity feed shows "Merged — deploying" to reflect this. See roadmap for the planned Vercel webhook to close this gap.

## The CI allowlist (safety net)

The most important safety layer. A GitHub Actions workflow runs on all PRs from `agent/*` branches and rejects any change that touches a file outside the permitted set:

```
content/hero.json
theme/tokens.json
overrides/index.json
```

Human dev PRs (`feat/*`, `fix/*`, etc.) skip this check entirely — the workflow exits early for non-agent branches so branch protection is always satisfied. See [ADR-005](decisions/ADR-005-auto-merge.md) for why auto-merge uses GitHub's GraphQL API rather than an immediate REST call.

## X-ray view

A toggleable overlay that makes the editable surface and pipeline state visible. Activated by:
- The floating pill button (bottom-right corner)
- `⌘.` / `Ctrl+.` keyboard shortcut
- Clicking any item in the activity feed (focuses that element)
- `?xray=<edit-id>` URL parameter (opens focused on a specific element)

When active, each `EditableElement` shows its `data-edit-id` label and a comment count badge. A sidebar lists all recent pipeline activity with status, reasoning, and PR links. Dismissed via the pill button, `Escape`, or the × in the sidebar header. Outside-click is intentionally not used — it conflicts with the pill toggle due to native DOM event ordering.

## Supabase client split

Two separate modules handle Supabase access:

- `lib/supabase.ts` — server-only client using `SUPABASE_SERVICE_ROLE_KEY`. Used in API routes and Inngest functions. Never imported by client components.
- `lib/supabase-browser.ts` — browser client using `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Used in client components (`XRayProvider`, `ActivityFeed`). Safe to ship to the browser.

The split exists because `SUPABASE_SERVICE_ROLE_KEY` is not prefixed `NEXT_PUBLIC_` and is never sent to the browser. Importing `lib/supabase.ts` from a client component causes a runtime error because the service role key is undefined in the browser environment.

## Data flow diagram

```
Visitor                App                    Inngest              GitHub / Vercel
  │                     │                        │                       │
  │── comment submit ──▶│                        │                       │
  │                     │── inngest.send ────────▶│                       │
  │                     │                        │── moderate ──▶ Haiku  │
  │                     │                        │── generate ──▶ Sonnet │
  │                     │                        │── validate (Zod)      │
  │                     │                        │── commit + PR ────────▶│
  │                     │                        │   enable auto-merge   │── CI check
  │                     │                        │                       │── auto-merge
  │                     │                        │                       │── Vercel deploy
  │                     │◀── Realtime update ────│◀── status: merged ────│
  │◀── feed update ─────│                        │                       │
```

## File structure

```
app/
  layout.tsx                    # Wraps app in XRayProvider
  page.tsx                      # The editable marketing page
  api/
    comment/route.ts            # POST /api/comment
    inngest/route.ts            # Inngest webhook handler
components/
  EditableElement.tsx           # Wraps any element; hover icon + x-ray overlay
  CommentPopover.tsx            # Comment submission dialog (portal-based)
  ActivityFeed.tsx              # Realtime activity feed; consumes XRayProvider
  XRayProvider.tsx              # X-ray state + shared Supabase subscription
  XRayPill.tsx                  # Floating toggle button
  XRaySidebar.tsx               # Fixed right panel showing pipeline activity
content/
  hero.json                     # { title, subtitle } — agent can edit this
theme/
  tokens.json                   # { accent } — agent can edit this
overrides/
  index.json                    # { heroFontSize, heroFontWeight, heroPadding }
lib/
  supabase.ts                   # Server-only Supabase client (service role)
  supabase-browser.ts           # Browser Supabase client (anon key)
  github.ts                     # Octokit wrapper — commitAndOpenPR
  schemas.ts                    # Zod schemas — single source of truth
inngest/
  client.ts
  functions/
    processComment.ts           # The full agent pipeline
supabase/
  migrations/
    0001_init.sql
.github/
  workflows/
    check-allowlist.yml         # CI safety net — agent/* branches only
```
