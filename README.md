# The page that edits itself

A Next.js site where any visitor can suggest a change to the page content. An AI agent moderates the suggestion, generates a structured patch, opens a real GitHub pull request, and Vercel redeploys. The page updates in front of visitors without a manual refresh. Every change is traceable to a PR.

End-to-end latency: 30–90 seconds.

## What this proves

The pipeline is not a database with a chatbot in front of it. It performs real structural edits:

- Splitting one paragraph into three sections
- Reordering sections
- Adding or removing a callout
- Changing a section's type (paragraph → callout, list → code block)
- Rewriting text in a different tone or voice

Every change has a real GitHub PR. CI runs on every agent PR and blocks merges that touch files outside the permitted set. The agent literally cannot modify application code.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Schema & validation | Zod |
| Database + realtime | Supabase |
| Authentication | Auth.js with GitHub OAuth |
| Workflow orchestration | Inngest |
| LLM | Anthropic API (Haiku for moderation + scope classification, Sonnet for generation) |
| Repo automation | Octokit (GitHub API) |
| Hosting | Vercel |

## Running locally

You need two terminals.

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — Inngest dev server (workflows won't fire without this)
npx inngest-cli@latest dev
```

Visit `http://localhost:3000`. The Inngest trace UI runs at `http://localhost:8288`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values.

The same variables (except `ALLOW_ANONYMOUS`) must be set in Vercel project settings for production.

For the deploy webhook to work in production, two GitHub repository secrets are also required — see `docs/architecture.md`.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — system design, pipeline, safety model
- [`docs/system-reference.md`](docs/system-reference.md) — agent ground truth, injected into every generate-patch prompt
- [`docs/roadmap.md`](docs/roadmap.md) — what shipped in v0, v1, and v2; what's deferred
- [`docs/decisions/`](docs/decisions/) — architecture decision records
