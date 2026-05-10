import { z } from 'zod'

// --- File schemas ---
// These validate the shape of the editable JSON files.
// Also used to validate the LLM's output before any commit happens.

export const HeroContentSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().min(1).max(200),
})

export const ThemeTokensSchema = z.object({
  accent: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color e.g. #C8704D'),
})

// --- Anthropic tool definitions ---
// Derived from the same schemas above — the LLM calls one of these tools
// to emit a structured patch. The tool name determines which file gets updated.

export const UpdateContentTool = {
  name: 'update_content',
  description: 'Update one or more fields in content/hero.json',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'New hero title (max 120 chars)',
      },
      subtitle: {
        type: 'string',
        description: 'New hero subtitle (max 200 chars)',
      },
    },
  },
}

export const UpdateThemeTool = {
  name: 'update_theme',
  description: 'Update one or more fields in theme/tokens.json',
  input_schema: {
    type: 'object' as const,
    properties: {
      accent: {
        type: 'string',
        pattern: '^#[0-9A-Fa-f]{6}$',
        description: 'New accent color as a 6-digit hex e.g. #C8704D',
      },
    },
  },
}

// --- Moderation schema ---
// Shape of the response from the cheap moderation pass (Claude Haiku).

export const ModerationResultSchema = z.object({
  verdict: z.enum(['safe', 'unsafe', 'off-topic']),
  reason: z.string(),
})

// --- Comment schema ---
// Shape of a row in the comments table.

export const CommentSchema = z.object({
  id: z.string().uuid(),
  edit_id: z.string(),
  text: z.string().min(1).max(500),
  status: z.enum(['queued', 'moderating', 'generating', 'merged', 'rejected']),
  ip_hash: z.string(),
  reasoning: z.string().nullable(),
  patch: z.record(z.string(), z.unknown()).nullable(),
  pr_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type HeroContent = z.infer<typeof HeroContentSchema>
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>
export type ModerationResult = z.infer<typeof ModerationResultSchema>
export type Comment = z.infer<typeof CommentSchema>
