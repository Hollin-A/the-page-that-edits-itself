# Security & Cost Protection

This document covers the protections in place and the ones planned before the project goes public. It also specifies the human-in-the-loop approval flow for agent merges that need owner review.

---

## Current protections (already shipped)

### Rate limiting
Anonymous submissions are capped at 3/hr per IP. GitHub-authenticated users get 20/hr. Implemented in `app/api/comment/route.ts` using a hashed IP (SHA-256 — raw IPs are never stored).

### Kill switch
A toggle in the `/admin` panel that sets `kill_switch = true` in the Supabase `settings` table. The pipeline reads this after loading the comment and halts before any moderation or Anthropic API call, marking the comment `failed`. Zero spend is incurred. See `inngest/functions/processComment.ts` → `check-kill-switch` step.

### AI moderation gate
Every comment passes through Claude Haiku before any Sonnet call. Off-topic or unsafe suggestions are rejected at this step. Haiku is cheap enough that even a flood of bad suggestions costs pennies.

### Element locking
While a comment is in the pipeline, its target element is locked — further submissions for the same element are rejected with 409. Prevents simultaneous conflicting edits.

### CI allowlist
GitHub Actions blocks any PR that touches files outside the allowlist (`content/hero.json`, `theme/tokens.json`, `overrides/index.json`). The agent cannot modify application code, even if it tries.

---

## Planned hardening (before going public)

### 1. Anthropic spend cap
Set a monthly hard cap in the Anthropic console (e.g. $10–20). When the cap is hit, API calls fail and the pipeline marks comments `failed`. This is the single most important protection — it requires no code and is the hard financial ceiling regardless of everything else.

**Action:** Set before the next project launches. Not a code change.

### 2. Require GitHub sign-in for submissions
Drop anonymous submissions entirely, or make them a config flag defaulting to off. A real GitHub account is a meaningful barrier — creating dozens of accounts to spam a niche experimental site is not worth anyone's effort.

**Implementation:** In `app/api/comment/route.ts`, check `session` from `auth()` and return 401 if no authenticated user. The `ALLOW_ANONYMOUS` env var can override this for local dev.

### 3. Honeypot field
Add a hidden form field to `CommentPopover`. Legitimate users never fill it in. If it's populated, reject the submission silently (return 200 but don't insert or trigger Inngest). Catches the simplest bots with zero infrastructure cost.

**Implementation:** Add `<input name="website" className="hidden" tabIndex={-1} autoComplete="off" />` to the form. Check for a non-empty `website` field in the API route and return early.

---

## Human-in-the-loop approval

Some agent outputs should require owner sign-off before merging. This is the moderation queue, currently deferred but specified here for implementation in the next project.

### When a comment should be held for review

The pipeline flags a comment as `held` (a new status, between `generating` and `merged`) in any of these cases:

- The agent's confidence is low — detectable by prompting the model to rate its own certainty and threshold on the score
- The patch touches multiple fields at once (a single suggestion changing title + accent color is suspicious)
- The suggestion is directional/vague and the generated output diverges significantly from the original (edit distance above a threshold)
- The owner has enabled "review all" mode via a `require_approval` setting in the `settings` table — useful before a launch or demo

### What "held" means in the pipeline

1. Pipeline runs through `generate-patch` and `validate-patch` as normal
2. Instead of calling `create-pr`, the step checks for hold conditions
3. If held: update status to `held`, store the generated patch in the `patch` column, store reasoning, stop
4. The PR is **not opened** — the patch sits in Supabase waiting for owner action

### Admin panel — moderation queue

A new card on `/admin` lists all `held` comments. Each row shows:
- Target element (`edit_id`)
- Original suggestion text
- The generated patch (diff view — old value → new value)
- The agent's reasoning
- Submitter (GitHub avatar + login or anonymous)
- Time in queue
- **Approve** button → resumes the pipeline from `create-pr`, opens and merges the PR
- **Reject** button → marks the comment `rejected`, no PR opened

### Schema changes required

```sql
-- Add held to the status enum
alter type comment_status add value 'held';

-- settings table already exists — add require_approval
insert into settings (key, value) values ('require_approval', 'false');
```

### Pipeline changes required

In `processComment.ts`, after `validate-patch`:

```ts
await step.run('check-hold', async () => {
  const { data: requireApproval } = await supabase
    .from('settings').select('value').eq('key', 'require_approval').single()

  const shouldHold = requireApproval?.value === 'true' || /* confidence check */

  if (shouldHold) {
    await supabase.from('comments')
      .update({ status: 'held', patch, reasoning })
      .eq('id', commentId)
    throw new NonRetriableError('Comment held for owner review.')
  }
})
```

The Approve action in the admin panel calls a server action that re-triggers the pipeline from the `create-pr` step using Inngest's `invoke` or by sending a new event with the pre-validated patch.

### Merge conflict risk on approval

A held comment's patch is generated against the file content at the time it runs. If other suggestions merge while the comment is held, the patch becomes stale — approving it would silently overwrite whatever changed in the meantime. No git conflict is raised because the PR opens and merges cleanly; the staleness is semantic, not structural.

**How to handle it: re-generate on approval**

When the owner approves a held comment, do not use the stored patch. Instead re-run `generate-patch` against the current file content before calling `create-pr`. The agent re-executes the suggestion fresh, accounting for all changes that landed while the comment was held.

This means the stored patch serves as a **preview** in the admin queue — it shows the owner what the agent intended — but the actual commit is always generated against current state. The owner is approving the *suggestion intent*, not the specific bytes.

The pipeline change is minimal: the approve server action sends a new `comment/approved` Inngest event carrying only the `comment_id`. The pipeline re-runs from `generate-patch` onward, skipping the hold check this time (flagged by an `approved: true` field on the event).

This risk is scoped to suggestions targeting the **same field**. If suggestion 10 touches `hero.title` and suggestions 11–30 only touch `theme.accent`, there is no conflict — the patches are independent. The re-generation approach handles all cases uniformly regardless.

---

## Summary table

| Protection | Status | Prevents |
|---|---|---|
| Rate limiting | Shipped | IP-level flooding |
| Kill switch | Shipped | All pipeline activity instantly |
| AI moderation gate | Shipped | Spam, unsafe content |
| Element locking | Shipped | Conflicting simultaneous edits |
| CI allowlist | Shipped | Agent touching application code |
| Anthropic spend cap | Planned (console) | Runaway API spend |
| GitHub sign-in required | Planned | Anonymous bot submissions |
| Honeypot field | Planned | Simple bot scripts |
| Human approval queue | Planned | Undesirable agent outputs reaching production |
