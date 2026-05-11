'use client'

import { SessionProvider } from 'next-auth/react'
import XRayProvider from './XRayProvider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <XRayProvider>{children}</XRayProvider>
    </SessionProvider>
  )
}
