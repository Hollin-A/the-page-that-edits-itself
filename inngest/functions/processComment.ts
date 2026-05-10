import { inngest } from '@/inngest/client'

// Placeholder — full pipeline implemented in Phase 4
export const processComment = inngest.createFunction(
  { id: 'process-comment', retries: 2, triggers: [{ event: 'comment/submitted' }] },
  async ({ event }: { event: { data: { comment_id: string } } }) => {
    console.log('[inngest] comment/submitted received:', event.data)
    return { received: true }
  }
)
