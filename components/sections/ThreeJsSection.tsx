'use client'

import dynamic from 'next/dynamic'
import type { ThreeJsSceneSection } from '@/lib/schemas'

// Canvas uses WebGL — must not run on the server.
// The loading skeleton prevents layout shift while the bundle loads.
const ThreeJsCanvas = dynamic(() => import('./ThreeJsCanvas'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-lg bg-white/[0.02] animate-pulse"
      style={{ height: '100%' }}
    />
  ),
})

export default function ThreeJsSection(props: ThreeJsSceneSection) {
  return (
    <div
      className="w-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ height: `${props.height ?? 420}px` }}
    >
      <ThreeJsCanvas section={props} />
    </div>
  )
}
