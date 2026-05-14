import type { Section } from '@/lib/schemas'
import HeadingSection from './HeadingSection'
import ParagraphSection from './ParagraphSection'
import CalloutSection from './CalloutSection'
import OrderedListSection from './OrderedListSection'
import BulletListSection from './BulletListSection'
import CodeBlockSection from './CodeBlockSection'
import LinkBlockSection from './LinkBlockSection'
import QuoteSection from './QuoteSection'
import ThreeJsSection from './ThreeJsSection'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_RENDERERS: Record<Section['type'], React.ComponentType<any>> = {
  heading: HeadingSection,
  paragraph: ParagraphSection,
  callout: CalloutSection,
  'ordered-list': OrderedListSection,
  'bullet-list': BulletListSection,
  'code-block': CodeBlockSection,
  'link-block': LinkBlockSection,
  quote: QuoteSection,
  'threejs-scene': ThreeJsSection,
}
