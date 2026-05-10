import Anthropic from '@anthropic-ai/sdk'
import { inngest } from '@/inngest/client'
import { supabase } from '@/lib/supabase'
import { commitAndOpenPR } from '@/lib/github'
import {
  HeroContentSchema,
  ThemeTokensSchema,
  ModerationResultSchema,
  UpdateContentTool,
  UpdateThemeTool,
} from '@/lib/schemas'
import contentJson from '@/content/hero.json'
import themeJson from '@/theme/tokens.json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const processComment = inngest.createFunction(
  { id: 'process-comment', retries: 2, triggers: [{ event: 'comment/submitted' }] },
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
          'Use update_theme for color or visual changes (accent color). ' +
          `Current content: ${JSON.stringify(contentJson)}. ` +
          `Current theme: ${JSON.stringify(themeJson)}. ` +
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

    // Step 6: Mark deployed
    await step.run('mark-deployed', async () => {
      const layer = patch.name === 'update_content' ? 'content' : 'theme'
      await supabase
        .from('comments')
        .update({
          status: 'deployed',
          patch,
          pr_url: prUrl,
          reasoning: `Routed to ${layer} layer. Target: ${comment.edit_id}.`,
        })
        .eq('id', commentId)
    })

    return { deployed: true, pr_url: prUrl }
  }
)
