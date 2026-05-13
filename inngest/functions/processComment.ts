import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import { inngest } from '@/inngest/client'
import { supabase } from '@/lib/supabase'
import { commitAndOpenPR } from '@/lib/github'
import {
  SectionsFileSchema,
  ThemeTokensSchema,
  ModerationResultSchema,
  UpdateSectionsTool,
  UpdateThemeTool,
} from '@/lib/schemas'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Read once at module load — stable reference docs injected into every generate-patch call.
// system-reference.md is the agent's factual ground truth about this system.
const systemReference = readFileSync(
  join(process.cwd(), 'docs/system-reference.md'),
  'utf8'
)

export const processComment = inngest.createFunction(
  {
    id: 'process-comment',
    retries: 2,
    triggers: [{ event: 'comment/submitted' }],
    onFailure: async ({ event, step }: { event: { data: { event: { data: { comment_id: string } }; error: { message: string } } }; step: any }) => {
      const commentId = event.data.event.data.comment_id
      await step.run('mark-failed', async () => {
        await supabase
          .from('comments')
          .update({ status: 'failed', reasoning: `Pipeline failed: ${event.data.error.message}` })
          .eq('id', commentId)
      })
    },
  },
  async ({ event, step }: { event: { data: { comment_id: string } }; step: any }) => {
    const commentId = event.data.comment_id

    // Step 1: Load comment
    const comment = await step.run('load-comment', async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('id', commentId)
        .single()
      if (error) throw new Error(`Failed to load comment: ${error.message}`)
      return data
    })

    // Step 1b: Kill switch check — halt before any API spend
    await step.run('check-kill-switch', async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'kill_switch')
        .single()
      if (data?.value === 'true') {
        await supabase
          .from('comments')
          .update({ status: 'failed', reasoning: 'Pipeline halted by kill switch.' })
          .eq('id', commentId)
        throw new Error('Kill switch is active — pipeline halted.')
      }
    })

    // Step 2: Moderation — cheap pass with Haiku
    const moderation = await step.run('moderate', async () => {
      await supabase.from('comments').update({ status: 'moderating' }).eq('id', commentId)

      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:
          'You moderate visitor suggestions for a self-editing website about an agentic workflow system. ' +
          'The site explains how an AI agent applies visitor suggestions through real GitHub pull requests. ' +
          'Content about AI agents, pipelines, moderation, safety, code, pull requests, and technical ' +
          'concepts is fully on-topic for this site — do not reject it as off-topic. ' +
          'Vague or unclear suggestions (e.g. "explain more", "add details") are safe — the generation ' +
          'step will interpret them. Only reject suggestions that are clearly harmful. ' +
          "Classify as 'safe' (any reasonable content, copy, or structural suggestion), " +
          "'unsafe' (slurs, threats, personal attacks, illegal content, spam), or " +
          "'off-topic' (completely unrelated to websites, writing, or design — e.g. asking for stock tips). " +
          'When in doubt, classify as safe. ' +
          'Respond with JSON only: {"verdict": "...", "reason": "..."}',
        messages: [{ role: 'user', content: comment.text }],
      })

      const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
      return ModerationResultSchema.parse(JSON.parse(cleaned))
    })

    if (moderation.verdict !== 'safe') {
      await step.run('mark-rejected', async () => {
        await supabase
          .from('comments')
          .update({ status: 'rejected', reasoning: moderation.reason })
          .eq('id', commentId)
      })
      return { rejected: true, reason: moderation.reason }
    }

    // Step 3: Generate structured patch with Sonnet
    const patch = await step.run('generate-patch', async () => {
      await supabase.from('comments').update({ status: 'generating' }).eq('id', commentId)

      // Read current file state fresh at generation time — not at module load.
      // This ensures the agent works from the latest deployed content.
      const currentSections = readFileSync(join(process.cwd(), 'content/sections.json'), 'utf8')
      const currentTheme = readFileSync(join(process.cwd(), 'theme/tokens.json'), 'utf8')

      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: [
          'You apply visitor suggestions to a marketing site by calling the appropriate tool.',
          '',
          'Use update_sections for any change to page content or structure — rewriting text,',
          'splitting, merging, reordering, adding, removing, or hiding sections.',
          'Use update_theme only for color changes (accent color).',
          '',
          `The visitor is targeting element: ${comment.edit_id}.`,
          `Current sections: ${currentSections}`,
          `Current theme: ${currentTheme}`,
          '',
          '---',
          'SYSTEM REFERENCE — factual ground truth about this site.',
          'Use this when writing or rewriting content about the system.',
          'Do not invent facts not present here.',
          '---',
          systemReference,
        ].join('\n'),
        tools: [
          {
            name: UpdateSectionsTool.name,
            description: UpdateSectionsTool.description,
            input_schema: UpdateSectionsTool.input_schema as Anthropic.Tool['input_schema'],
          },
          {
            name: UpdateThemeTool.name,
            description: UpdateThemeTool.description,
            input_schema: UpdateThemeTool.input_schema as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: comment.text }],
      })

      const toolUse = res.content.find((c) => c.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('No tool use in Anthropic response — model returned text instead of a tool call')
      }

      return { name: toolUse.name, input: toolUse.input as Record<string, unknown> }
    })

    // Step 4: Validate patch against the relevant Zod schema
    await step.run('validate-patch', async () => {
      if (patch.name === 'update_sections') {
        SectionsFileSchema.parse({ sections: patch.input.sections })
      } else if (patch.name === 'update_theme') {
        const currentTheme = JSON.parse(
          readFileSync(join(process.cwd(), 'theme/tokens.json'), 'utf8')
        )
        ThemeTokensSchema.parse({ ...currentTheme, ...patch.input })
      } else {
        throw new Error(`Unknown tool name: ${patch.name}`)
      }
    })

    // Step 5: Commit + open PR + auto-merge
    const prUrl = await step.run('create-pr', async () => {
      return await commitAndOpenPR({
        commentId,
        commentText: comment.text,
        editId: comment.edit_id,
        toolName: patch.name,
        patch: patch.input,
      })
    })

    // Step 6: Mark merged
    await step.run('mark-merged', async () => {
      const layer = patch.name === 'update_sections' ? 'content' : 'theme'
      const resolvedEditId = patch.name === 'update_theme' ? 'theme.accent' : comment.edit_id

      await supabase
        .from('comments')
        .update({
          status: 'merged',
          patch,
          pr_url: prUrl,
          resolved_edit_id: resolvedEditId,
          reasoning: `Routed to ${layer} layer. Target: ${comment.edit_id}.`,
        })
        .eq('id', commentId)
    })

    return { merged: true, pr_url: prUrl }
  }
)
