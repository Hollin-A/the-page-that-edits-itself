'use client'

import { motion, type Variants } from 'framer-motion'
import type { AnimationConfig } from '@/lib/schemas'

// ---------------------------------------------------------------------------
// Preset variants
// ---------------------------------------------------------------------------
// Each preset maps to a hidden → visible pair that Framer Motion interpolates.
// The agent selects a preset name — it never writes animation code directly.

const VARIANTS: Record<string, Variants> = {
  'fade-up': {
    hidden: { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0 },
  },
  'fade-in': {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  'slide-left': {
    hidden: { opacity: 0, x: -36 },
    visible: { opacity: 1, x: 0 },
  },
  'slide-right': {
    hidden: { opacity: 0, x: 36 },
    visible: { opacity: 1, x: 0 },
  },
  'zoom-in': {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
  },
}

interface Props {
  animation?: AnimationConfig
  children: React.ReactNode
  className?: string
}

export default function AnimatedSection({ animation, children, className }: Props) {
  const preset = animation?.preset ?? 'fade-up'

  // No animation — render children directly without a wrapper div.
  if (preset === 'none' || !VARIANTS[preset]) {
    return <>{children}</>
  }

  const duration = animation?.duration ?? 0.5
  const delay = animation?.delay ?? 0

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={VARIANTS[preset]}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      {children}
    </motion.div>
  )
}
