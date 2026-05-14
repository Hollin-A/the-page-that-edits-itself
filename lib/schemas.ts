import { z } from 'zod'

// ---------------------------------------------------------------------------
// Section schemas
// ---------------------------------------------------------------------------
// The page is rendered from a single ordered array of typed sections stored
// in content/sections.json. Each section has a stable id, a type literal
// that gates the rest of its shape, and a visible flag.
//
// The discriminated union is the safety mechanism: the type literal forces
// the exact field set. The validator catches bad patches before any commit.

const SectionBaseSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'id must be lowercase kebab-case e.g. intro-paragraph'),
  visible: z.boolean().default(true),
})

const HeadingSchema = SectionBaseSchema.extend({
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1).max(160),
})

const ParagraphSchema = SectionBaseSchema.extend({
  type: z.literal('paragraph'),
  text: z.string().min(1).max(800),
})

const CalloutSchema = SectionBaseSchema.extend({
  type: z.literal('callout'),
  tone: z.enum(['info', 'warn', 'success']),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
})

const OrderedListSchema = SectionBaseSchema.extend({
  type: z.literal('ordered-list'),
  items: z.array(z.string().min(1).max(200)).min(1).max(20),
})

const BulletListSchema = SectionBaseSchema.extend({
  type: z.literal('bullet-list'),
  items: z.array(z.string().min(1).max(200)).min(1).max(20),
})

const CodeBlockSchema = SectionBaseSchema.extend({
  type: z.literal('code-block'),
  language: z.string().min(1).max(50),
  code: z.string().min(1).max(5000),
})

const LinkBlockSchema = SectionBaseSchema.extend({
  type: z.literal('link-block'),
  text: z.string().min(1).max(200),
  href: z.string().url('href must be a valid URL'),
})

const QuoteSchema = SectionBaseSchema.extend({
  type: z.literal('quote'),
  text: z.string().min(1).max(500),
  attribution: z.string().min(1).max(120),
})

// ---------------------------------------------------------------------------
// Three.js scene schema
// ---------------------------------------------------------------------------
// Declarative JSON description of a WebGL scene rendered by React Three Fiber.
// The agent edits this config — it never writes JS/shader code.

const ThreeJsLightSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('AmbientLight'),
    intensity: z.number().min(0).max(5),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  }),
  z.object({
    type: z.literal('PointLight'),
    intensity: z.number().min(0).max(10),
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  }),
  z.object({
    type: z.literal('DirectionalLight'),
    intensity: z.number().min(0).max(10),
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  }),
])

const ThreeJsObjectSchema = z.object({
  id: z.string().min(1).max(50),
  geometry: z.object({
    type: z.enum(['Box', 'Sphere', 'Torus', 'TorusKnot', 'Icosahedron',
      'Octahedron', 'Cone', 'Cylinder', 'Dodecahedron', 'Tetrahedron']),
    params: z.array(z.number()).max(6).optional(),
  }),
  material: z.object({
    type: z.enum(['MeshStandardMaterial', 'MeshPhysicalMaterial',
      'MeshNormalMaterial', 'MeshBasicMaterial']),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    wireframe: z.boolean().optional(),
    roughness: z.number().min(0).max(1).optional(),
    metalness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    transparent: z.boolean().optional(),
  }),
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  scale: z.number().positive().optional(),
  animation: z.object({
    rotate: z.tuple([z.number(), z.number(), z.number()]).optional(),
    float: z.object({
      amplitude: z.number().min(0).max(2),
      speed: z.number().min(0).max(10),
    }).optional(),
  }).optional(),
})

const ThreeJsSceneSchema = SectionBaseSchema.extend({
  type: z.literal('threejs-scene'),
  height: z.number().min(100).max(800).default(420),
  camera: z.object({
    fov: z.number().min(10).max(120).optional(),
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  }).optional(),
  lights: z.array(ThreeJsLightSchema).min(1).max(6),
  objects: z.array(ThreeJsObjectSchema).min(1).max(8),
})

export const SectionSchema = z.discriminatedUnion('type', [
  HeadingSchema,
  ParagraphSchema,
  CalloutSchema,
  OrderedListSchema,
  BulletListSchema,
  CodeBlockSchema,
  LinkBlockSchema,
  QuoteSchema,
  ThreeJsSceneSchema,
])

export const SectionsFileSchema = z.object({
  sections: z.array(SectionSchema).min(1).max(50),
})

// ---------------------------------------------------------------------------
// Theme schema
// ---------------------------------------------------------------------------

export const ThemeTokensSchema = z.object({
  accent: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color e.g. #C8704D'),
})

// ---------------------------------------------------------------------------
// Anthropic tool definitions
// ---------------------------------------------------------------------------
// The agent calls one of these tools to emit a structured patch.
// UpdateSectionsTool returns the complete sections array — never a diff.
// UpdateThemeTool is unchanged from v1.

export const UpdateSectionsTool = {
  name: 'update_sections',
  description:
    'Modify the page by returning a new sections array. Use this for ANY change to ' +
    'page content or structure — rewriting text, splitting a section into multiple, ' +
    'merging sections, reordering, adding new sections, removing sections, changing ' +
    'a section type, or hiding/showing a section.\n\n' +
    'IMPORTANT: Always return the COMPLETE sections array, not just the changed parts. ' +
    'Preserve unchanged sections exactly as they are. ' +
    'Generate stable lowercase kebab-case ids for any new sections (e.g. "safety-callout").\n\n' +
    'Available section types and their fields:\n' +
    '- heading: level (1|2|3), text (max 160)\n' +
    '- paragraph: text (max 800)\n' +
    '- callout: tone ("info"|"warn"|"success"), title (max 120), body (max 500)\n' +
    '- ordered-list: items[] (each max 200, up to 20 items)\n' +
    '- bullet-list: items[] (each max 200, up to 20 items)\n' +
    '- code-block: language, code (max 5000)\n' +
    '- link-block: text (max 200), href (valid URL)\n' +
    '- quote: text (max 500), attribution (max 120)\n' +
    '- threejs-scene: height (px, 100-800), camera {fov, position[x,y,z]}, lights[], objects[]\n' +
    '  Each object: id, geometry {type, params[]}, material {type, color, wireframe, roughness, metalness}, position[x,y,z], scale, animation {rotate[x,y,z], float {amplitude, speed}}\n' +
    '  Geometry types: Box, Sphere, Torus, TorusKnot, Icosahedron, Octahedron, Cone, Cylinder, Dodecahedron, Tetrahedron\n' +
    '  Material types: MeshStandardMaterial, MeshPhysicalMaterial, MeshNormalMaterial, MeshBasicMaterial\n' +
    '  Light types: AmbientLight {intensity, color}, PointLight {intensity, position, color}, DirectionalLight {intensity, position, color}',
  input_schema: {
    type: 'object' as const,
    properties: {
      sections: {
        type: 'array',
        description:
          'The complete new sections array. Every section must have id, type, and visible. ' +
          'The type field determines which other fields are required.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable lowercase kebab-case identifier e.g. "intro-heading"',
            },
            type: {
              type: 'string',
              enum: [
                'heading',
                'paragraph',
                'callout',
                'ordered-list',
                'bullet-list',
                'code-block',
                'link-block',
                'quote',
              ],
            },
            visible: {
              type: 'boolean',
              description: 'Whether the section is rendered on the page. Defaults to true.',
            },
          },
          required: ['id', 'type'],
        },
      },
    },
    required: ['sections'],
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

// ---------------------------------------------------------------------------
// Moderation schema
// ---------------------------------------------------------------------------
// Shape of the response from the cheap moderation pass (Claude Haiku).

export const ModerationResultSchema = z.object({
  verdict: z.enum(['safe', 'unsafe', 'off-topic']),
  reason: z.string(),
})

// ---------------------------------------------------------------------------
// Comment schema
// ---------------------------------------------------------------------------
// Shape of a row in the comments table.

export const CommentSchema = z.object({
  id: z.string().uuid(),
  edit_id: z.string(),
  text: z.string().min(1).max(500),
  status: z.enum(['queued', 'moderating', 'generating', 'merged', 'deployed', 'rejected', 'failed', 'held']),
  ip_hash: z.string(),
  reasoning: z.string().nullable(),
  patch: z.record(z.string(), z.unknown()).nullable(),
  pr_url: z.string().nullable(),
  resolved_edit_id: z.string().nullable(),
  user_id: z.string().nullable(),
  user_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Section = z.infer<typeof SectionSchema>
export type SectionsFile = z.infer<typeof SectionsFileSchema>
export type HeadingSection = z.infer<typeof HeadingSchema>
export type ParagraphSection = z.infer<typeof ParagraphSchema>
export type CalloutSection = z.infer<typeof CalloutSchema>
export type OrderedListSection = z.infer<typeof OrderedListSchema>
export type BulletListSection = z.infer<typeof BulletListSchema>
export type CodeBlockSection = z.infer<typeof CodeBlockSchema>
export type LinkBlockSection = z.infer<typeof LinkBlockSchema>
export type QuoteSection = z.infer<typeof QuoteSchema>
export type ThreeJsSceneSection = z.infer<typeof ThreeJsSceneSchema>
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>
export type ModerationResult = z.infer<typeof ModerationResultSchema>
export type Comment = z.infer<typeof CommentSchema>
