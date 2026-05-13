import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
const owner = process.env.GITHUB_OWNER!
const repo = process.env.GITHUB_REPO!

export async function commitAndOpenPR(input: {
  commentId: string
  commentText: string
  editId: string
  toolName: string
  patch: Record<string, unknown>
}): Promise<string> {
  const branch = `agent/${input.commentId.slice(0, 8)}`
  const filePathMap: Record<string, string> = {
    update_sections: 'content/sections.json',
    update_theme: 'theme/tokens.json',
  }
  const filePath = filePathMap[input.toolName]
  if (!filePath) throw new Error(`Unknown tool name: ${input.toolName}`)

  // Get main branch SHA
  const { data: mainRef } = await octokit.git.getRef({
    owner,
    repo,
    ref: 'heads/main',
  })

  // Delete branch if it already exists (makes the step safe to retry)
  await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` }).catch(() => {})

  // Create agent branch
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: mainRef.object.sha,
  })

  // Get current file content + SHA (needed for the update call)
  const { data: file } = await octokit.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: branch,
  })

  if (!('content' in file)) throw new Error(`${filePath} is not a file`)

  // Build the new file content:
  // - update_sections: patch IS the complete new file (agent returns full array)
  // - update_theme: merge current file with partial patch
  let updated: unknown
  if (input.toolName === 'update_sections') {
    updated = { sections: input.patch.sections }
  } else {
    const current = JSON.parse(Buffer.from(file.content, 'base64').toString())
    updated = { ...current, ...input.patch }
  }

  // Commit the patch
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    branch,
    message: `agent(${input.editId}): ${input.commentText.slice(0, 60)}`,
    content: Buffer.from(JSON.stringify(updated, null, 2) + '\n').toString('base64'),
    sha: file.sha,
  })

  // Open PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: `agent(${input.editId}): ${input.commentText.slice(0, 60)}`,
    head: branch,
    base: 'main',
    body: `**Suggestion:** ${input.commentText}\n**Target:** \`${input.editId}\`\n**Layer:** ${input.toolName === 'update_sections' ? 'content' : 'theme'}`,
  })

  // Enable auto-merge — GitHub merges once all required checks pass
  await octokit.graphql(
    `mutation EnableAutoMerge($id: ID!) {
      enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) {
        pullRequest { number }
      }
    }`,
    { id: pr.node_id }
  )

  return pr.html_url
}
