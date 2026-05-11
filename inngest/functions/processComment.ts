import Anthropic from '@anthropic-ai/sdk'
import { inngest } from '@/inngest/client'
import { supabase } from '@/lib/supabase'
import { commitAndOpenPR } from '@/lib/github'
import {
  HeroContentSchema,
  ThemeTokensSchema,
  OverridesSchema,
  ModerationResultSchema,
  UpdateContentTool,
  UpdateThemeTool,
  UpdateOverrideTool,
} from '@/lib/schemas'
import contentJson from '@/content/hero.json'
import themeJson from '@/theme/tokens.json'
import overridesJson from '@/overrides/index.json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function resolveEditId(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'update_content') {
    const key = Object.keys(input)[0]
    return key === 'subtitle' ? 'hero.subtitle' : 'hero.title'
  }
  if (toolName === 'update_theme') return 'theme.accent'
  if (toolName === 'update_override') return 'override.typography'
  return toolName
}

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
          'You moderate suggestions for a crowd-edited marketing site. ' +
          "Classify each suggestion as 'safe' (a reasonable design or copy change), " +
          "'unsafe' (slurs, threats, personal attacks, spam), or " +
          "'off-topic' (unrelated to the site content or appearance). " +
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

      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system:
          'You apply visitor suggestions to a marketing site by calling the appropriate tool. ' +
          'Use update_content for copy changes (title, subtitle). ' +
          'Use update_theme for color changes (accent color). ' +
          'Use update_override for typography and layout changes (font size, font weight, padding). ' +
          `Current content: ${JSON.stringify(contentJson)}. ` +
          `Current theme: ${JSON.stringify(themeJson)}. ` +
          `Current overrides: ${JSON.stringify(overridesJson)}. ` +
          `The visitor is targeting element: ${comment.edit_id}.`,
        tools: [
          {
            name: UpdateContentTool.name,
            description: UpdateContentTool.description,
            input_schema: UpdateContentTool.input_schema as Anthropic.Tool['input_schema'],
          },
          {
            name: UpdateThemeTool.name,
            description: UpdateThemeTool.description,
            input_schema: UpdateThemeTool.input_schema as Anthropic.Tool['input_schema'],
          },
          {
            name: UpdateOverrideTool.name,
            description: UpdateOverrideTool.description,
            input_schema: UpdateOverrideTool.input_schema as Anthropic.Tool['input_schema'],
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
      if (patch.name === 'update_content') {
        HeroContentSchema.parse({ ...contentJson, ...patch.input })
      } else if (patch.name === 'update_theme') {
        ThemeTokensSchema.parse({ ...themeJson, ...patch.input })
      } else if (patch.name === 'update_override') {
        OverridesSchema.parse({ ...overridesJson, ...patch.input })
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
      const layerMap: Record<string, string> = {
        update_content: 'content',
        update_theme: 'theme',
        update_override: 'override',
      }
      const layer = layerMap[patch.name] ?? patch.name

      // Derive which specific element was actually written to
      const resolvedEditId = resolveEditId(patch.name, patch.input)

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
