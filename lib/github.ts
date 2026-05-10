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
  const filePath =
    input.toolName === 'update_content'
      ? 'content/hero.json'
      : 'theme/tokens.json'

  // Get main branch SHA
  const { data: mainRef } = await octokit.git.getRef({
    owner,
    repo,
    ref: 'heads/main',
  })

  // Create agent branch
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: mainRef.object.sha,
  })

  // Get current file content
  const { data: file } = await octokit.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: branch,
  })

  if (!('content' in file)) throw new Error(`${filePath} is not a file`)

  const current = JSON.parse(Buffer.from(file.content, 'base64').toString())
  const updated = { ...current, ...input.patch }

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
    body: `**Suggestion:** ${input.commentText}\n**Target:** \`${input.editId}\`\n**Layer:** ${input.toolName === 'update_content' ? 'content' : 'theme'}`,
  })

  // Auto-merge
  await octokit.pulls.merge({
    owner,
    repo,
    pull_number: pr.number,
    merge_method: 'squash',
  })

  return pr.html_url
}
