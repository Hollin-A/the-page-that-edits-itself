import Anthropic from '@anthropic-ai/sdk'
import { NonRetriableError } from 'inngest'
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
    triggers: [
      { event: 'comment/submitted' },
      { event: 'comment/approved' },
    ],
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
  async ({ event, step }: { event: { name: string; data: { comment_id: string } }; step: any }) => {
    const commentId = event.data.comment_id
    const isApproval = event.name === 'comment/approved'

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

    // Step 2: Moderation — skip for approvals (already moderated on first pass)
    if (!isApproval) {
    const moderation = await step.run('moderate', async () => {
      await supabase.from('comments').update({ status: 'moderating' }).eq('id', commentId)

      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:
          'You moderate visitor suggestions for a self-editing website about an agentic workflow system. ' +
          'The site has text sections (headings, paragraphs, lists, callouts, code blocks) AND a live 3D scene rendered with Three.js/WebGL. ' +
          'Suggestions about the 3D scene are fully on-topic: changing geometry (sphere, icosahedron, torus, box, cone, etc.), ' +
          'material properties (colour, wireframe, metalness, roughness, opacity), ' +
          'lighting (colours, intensity, position), animation (rotation speed, floating), ' +
          'or adding/removing objects in the scene. ' +
          'Content about AI agents, pipelines, moderation, safety, code, pull requests, and technical ' +
          'concepts is fully on-topic — do not reject it as off-topic. ' +
          'Vague or unclear suggestions (e.g. "explain more", "add details", "make it look cooler") are safe — the generation ' +
          'step will interpret them. Only reject suggestions that are clearly harmful. ' +
          "Classify as 'safe' (any reasonable content, copy, structural, or visual suggestion), " +
          "'unsafe' (slurs, threats, personal attacks, illegal content, spam), or " +
          "'off-topic' (completely unrelated to websites, writing, design, or 3D visuals — e.g. asking for stock tips). " +
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
    } // end !isApproval moderation block

    // Step 2b: Classify scope — section-level or global?
    // Uses Haiku to determine if the suggestion targets the clicked element only,
    // or explicitly intends a page-wide change. Result gates how much context
    // the generate-patch step exposes to the model.
    const scope = await step.run('classify-scope', async () => {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system:
          'Classify the scope of a visitor suggestion for a web page. ' +
          'Reply "section" if the suggestion targets a specific element ' +
          '(e.g. "make this punchier", "rewrite this", "add more detail here", "make this more technical"). ' +
          'Reply "global" only if the suggestion explicitly targets the whole page or multiple sections ' +
          '(e.g. "make the whole site more formal", "reorder everything", "add a new section about X"). ' +
          'When in doubt, reply "section". Reply with a single word only.',
        messages: [{ role: 'user', content: comment.text }],
      })
      const raw = res.content[0].type === 'text' ? res.content[0].text.trim().toLowerCase() : ''
      return raw === 'global' ? 'global' : 'section'
    })

    // Step 3: Generate structured patch with Sonnet
    const patch = await step.run('generate-patch', async () => {
      await supabase.from('comments').update({ status: 'generating' }).eq('id', commentId)

      // Read current file state fresh at generation time — not at module load.
      // This ensures the agent works from the latest deployed content.
      const currentSectionsRaw = readFileSync(join(process.cwd(), 'content/sections.json'), 'utf8')
      const currentTheme = readFileSync(join(process.cwd(), 'theme/tokens.json'), 'utf8')

      // Build sections context based on classified scope.
      // section-scope: clearly mark the target section vs read-only context sections.
      // global-scope: pass all sections without distinction.
      let sectionsContext: string
      if (scope === 'section') {
        const parsed = JSON.parse(currentSectionsRaw) as { sections: Array<{ id: string }> }
        const target = parsed.sections.find((s) => s.id === comment.edit_id)
        const context = parsed.sections.filter((s) => s.id !== comment.edit_id)
        if (target) {
          sectionsContext = [
            'TARGET SECTION — this is the element the visitor clicked and wants to change:',
            JSON.stringify(target, null, 2),
            '',
            'CONTEXT SECTIONS — present for structural awareness only.',
            'Do NOT modify these unless the suggestion explicitly asks to change them.',
            'Return them exactly as-is in your sections array:',
            JSON.stringify(context, null, 2),
          ].join('\n')
        } else {
          // edit_id doesn't map to a section (e.g. a new-section request or theme target)
          sectionsContext = `Current sections: ${currentSectionsRaw}`
        }
      } else {
        // Global scope — treat all sections as editable
        sectionsContext = `Current sections: ${currentSectionsRaw}`
      }

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
          sectionsContext,
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

    // Step 4b: Hold check — skip for approvals (owner already reviewed)
    if (!isApproval) {
      await step.run('check-hold', async () => {
        const { data: requireApprovalRow } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'require_approval')
          .single()

        if (requireApprovalRow?.value === 'true') {
          await supabase
            .from('comments')
            .update({
              status: 'held',
              patch,
              reasoning: 'Held for owner review. Patch generated against current content.',
            })
            .eq('id', commentId)
          throw new NonRetriableError('Comment held for owner review.')
        }
      })
    }

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
