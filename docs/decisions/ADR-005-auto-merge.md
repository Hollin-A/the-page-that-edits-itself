# ADR-005 — Auto-merge via GitHub GraphQL

## Status
Accepted

## Context

The agent pipeline needs to merge its own PRs after opening them. The initial implementation called `octokit.pulls.merge()` immediately after `octokit.pulls.create()`.

This broke when branch protection was added requiring the CI allowlist check to pass before merge. The immediate REST merge call was rejected with a 405 because required status checks had not yet completed.

## Decision

Use GitHub's `enablePullRequestAutoMerge` GraphQL mutation instead of an immediate REST merge. This queues the merge — GitHub applies it automatically once all required status checks pass.

```graphql
mutation EnableAutoMerge($id: ID!) {
  enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) {
    pullRequest { number }
  }
}
```

The PR's `node_id` (returned by the REST create call) is passed as the GraphQL ID.

## Consequences

- Agent PRs now go through CI before merging — the allowlist check is a real gate, not decorative
- The pipeline's `create-pr` step completes as soon as auto-merge is enabled, not when the merge actually happens
- This is why the comment status is set to `merged` (auto-merge enabled) rather than waiting for the actual merge event, which the pipeline has no callback for
- "Allow auto-merge" must be enabled in GitHub repository settings for this to work
