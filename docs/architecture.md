# Architecture

## System overview

A Next.js app where the page is rendered from a typed section array in `content/sections.json`. Visitors suggest changes to individual sections. Each suggestion triggers a durable Inngest workflow: scope classification → moderation → patch generation → schema validation → GitHub PR → CI → auto-merge → Vercel deploy → live page refresh.

Supabase Realtime pushes status updates to all connected clients. When a deployment completes, a GitHub Actions workflow calls `/api/deploy-webhook`, which busts the ISR cache and marks comments as `deployed`. The page updates in place via `router.refresh()` — no manual reload needed.

## Editable elements

Every section in `content/sections.json` has an `id` field that becomes the `data-edit-id` on the rendered element. This ID appears in agent prompts, activity feed entries, PR commit messages, and moderation logs.

The theme accent colour is separately editable via `theme/tokens.json`.

Anything without an `id` is intentionally not editable.

## Section model

The page is a single ordered array of typed sections. Twelve types are available:

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
| `threejs-scene` | `height`, `camera`, `lights[]`, `objects[]` |
| `workflow` | `steps[]` (each with `title`, `description`) |
| `stat-row` | `stats[]` (each with `value`, `label`) |
| `tech-stack` | `items[]` (each with `name`, `description`, optional `href`) |

Each section also has `id` (kebab-case), `visible` (boolean), and an optional `animation` field (`{ preset, duration, delay }`). The agent returns the complete sections array on every edit — never a diff. A Zod discriminated union validates the shape before any commit.

## Agent pipeline

Each comment submission triggers this Inngest workflow:

```
1.  Comment received → persisted to Supabase (status: queued), event sent to Inngest
2.  Load comment row
3.  Kill switch check → if active, mark failed, halt (zero API spend)
4.  Moderate (Claude Haiku) → safe / unsafe / off-topic
     └─ not safe → mark rejected, pipeline stops
5.  Classify scope (Claude Haiku) → "section" or "global"
     └─ determines how much context is shown to Sonnet in step 6
6.  Generate patch (Claude Sonnet)
     · section-scope: TARGET SECTION highlighted; all others marked read-only
     · global-scope: all sections passed equally
     → returns { name: "update_sections" | "update_theme", input: { ... } }
7.  Validate patch (Zod) → invalid shapes throw, comment marked failed
8.  Hold check (if require_approval = true)
     → mark held, store patch preview; stop here until owner approves or rejects
     → on approval: re-run from step 6 to generate against current file state
9.  Commit + PR (Octokit) → branch created, file patched, PR opened, auto-merge enabled
10. CI (GitHub Actions) → allowlist check on agent/* branches
     └─ disallowed file → CI fails, auto-merge blocked
11. Auto-merge → squash merge to main when CI passes
12. Vercel redeploy → triggered on push to main
13. GitHub Actions (mark-deployed.yml) → waits 60s, calls /api/deploy-webhook
14. Deploy webhook → marks merged comments as deployed, calls revalidatePath('/')
15. Supabase Realtime fires → XRayProvider calls router.refresh()
16. Page updates in place for all connected visitors
```

Steps are durable and retryable via Inngest. Failures surface in the Inngest trace UI.

## Scope-aware generation

Step 5 classifies every suggestion before passing it to Sonnet. This prevents "make this more technical" on a single element from rewriting the whole page.

- **Section-scope** (default): the generate-patch prompt marks the clicked element as `TARGET SECTION` and all other sections as `CONTEXT SECTIONS — do NOT modify`. Sonnet sees the full structure for awareness but cannot touch what wasn't asked about.
- **Global-scope**: triggered only when the suggestion explicitly targets the whole page (e.g. "reorder everything", "make the whole site more formal"). All sections are passed equally.

## CI allowlist (safety wall)

A GitHub Actions workflow runs on all PRs from `agent/*` branches and rejects any change that touches a file outside the exact allowlist:

```
content/sections.json
theme/tokens.json
```

The check uses exact file path matching — subdirectories or other files in `content/` or `theme/` are not permitted.

Human dev PRs (`feat/*`, `fix/*`, etc.) skip the check entirely. The agent literally cannot modify application code — this check runs on GitHub's infrastructure, not inside the pipeline.

## Deploy webhook

`/api/deploy-webhook` receives a POST from GitHub Actions after a successful Vercel build. It:

1. Verifies the `Authorization: Bearer <DEPLOY_HOOK_SECRET>` header
2. Updates all `merged` comments → `deployed` in Supabase
3. Calls `revalidatePath('/')` to bust the ISR cache

Clients subscribed to Supabase Realtime receive the status change and call `router.refresh()`, which re-fetches server components silently. Visitors see the new content without reloading.

Required secrets:
- `DEPLOY_HOOK_SECRET` — in both Vercel env vars and GitHub repo secrets
- `SITE_URL` — production URL (e.g. `https://your-domain.vercel.app`) in GitHub repo secrets

## X-ray view

A toggleable overlay that surfaces the editable structure and pipeline state. Activated by:
- The floating pill button (bottom-right corner)
- `⌘.` / `Ctrl+.` keyboard shortcut
- `?xray=<edit-id>` URL parameter

When active, each section shows its `id` label and a comment count badge. A sidebar lists recent pipeline activity with status, reasoning, and PR links.

## Admin panel

Protected `/admin` route, gated by `ADMIN_EMAIL` env var (must match the GitHub OAuth account email). Provides:

- Stats grid: suggestions / applied / rejected / in pipeline
- Kill switch: halts the pipeline before any API call
- Require-approval toggle: holds all suggestions for owner review before committing
- Activity log with status filter tabs and inline Approve / Reject for held comments

## Supabase client split

- `lib/supabase.ts` — server-only, uses `SUPABASE_SERVICE_ROLE_KEY`. Used in API routes and Inngest functions.
- `lib/supabase-browser.ts` — browser singleton, uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Used in `XRayProvider`.

`SUPABASE_SERVICE_ROLE_KEY` is never prefixed `NEXT_PUBLIC_` and never sent to the browser.

## Data flow

```
Visitor                App                    Inngest              GitHub / Vercel
  │                     │                        │                       │
  │── suggest ─────────▶│                        │                       │
  │                     │── inngest.send ────────▶│                       │
  │                     │                        │── moderate (Haiku)    │
  │                     │                        │── classify scope      │
  │                     │                        │── generate (Sonnet)   │
  │                     │                        │── validate (Zod)      │
  │                     │                        │── commit + PR ────────▶│
  │                     │                        │   auto-merge enabled  │── CI check
  │                     │                        │                       │── auto-merge
  │                     │                        │                       │── Vercel build
  │                     │◀── Realtime (merged) ──│◀── mark merged        │
  │◀── feed update ─────│                        │                       │
  │                     │                        │         GH Actions ───▶│ (sleep 60s)
  │                     │◀── POST /deploy-webhook─────────────────────────│
  │                     │── revalidatePath(/)    │                       │
  │                     │── mark deployed ───────▶│                       │
  │◀── router.refresh() │◀── Realtime (deployed) │                       │
  │   page updates ─────│                        │                       │
```

## File structure

```
app/
  layout.tsx                      # Wraps app in XRayProvider
  page.tsx                        # Renders sections from content/sections.json (ISR)
  admin/
    page.tsx                      # Owner ops panel
    actions.ts                    # Server actions: kill switch, approval, reject
  api/
    comment/route.ts              # POST /api/comment — submit a suggestion
    deploy-webhook/route.ts       # POST /api/deploy-webhook — marks deployed, busts cache
    inngest/route.ts              # Inngest webhook handler
components/
  EditableElement.tsx             # Wraps any section; hover icon + x-ray overlay
  CommentPopover.tsx              # Suggestion dialog with honeypot and auth check
  XRayProvider.tsx                # X-ray state + Supabase Realtime + router.refresh()
  XRayPill.tsx                    # Floating toggle button
  XRaySidebar.tsx                 # Fixed right panel — per-element comment history
  ActivityPanel.tsx               # Full activity feed with stats
  sections/
    registry.ts                   # Maps section type → renderer component
    HeadingSection.tsx
    ParagraphSection.tsx
    CalloutSection.tsx
    OrderedListSection.tsx
    BulletListSection.tsx
    CodeBlockSection.tsx
    LinkBlockSection.tsx
    QuoteSection.tsx
  admin/
    ActivityLog.tsx               # Realtime log with filter tabs and held-comment actions
content/
  sections.json                   # Ordered typed section array — agent edits this
theme/
  tokens.json                     # { accent } — agent edits this
lib/
  supabase.ts                     # Server-only client (service role key)
  supabase-browser.ts             # Browser singleton (anon key)
  github.ts                       # Octokit wrapper — commitAndOpenPR
  schemas.ts                      # Zod schemas — single source of truth for all shapes
inngest/
  client.ts
  functions/
    processComment.ts             # The full agent pipeline
docs/
  architecture.md                 # This file
  system-reference.md             # Agent ground truth — injected into generate-patch prompt
  roadmap.md                      # Version history and what's deferred
  decisions/                      # ADRs
supabase/
  migrations/                     # Sequential SQL migrations
.github/
  workflows/
    check-allowlist.yml           # Blocks agent PRs touching files outside the allowlist
    mark-deployed.yml             # Fires on push to main, calls /api/deploy-webhook
```
