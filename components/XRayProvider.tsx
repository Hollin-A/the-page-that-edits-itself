'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { Comment } from '@/lib/schemas'
import XRayPill from './XRayPill'
import XRaySidebar from './XRaySidebar'
import ActivityPanel from './ActivityPanel'

type XRayContextValue = {
  active: boolean
  focusedId: string | null
  comments: Comment[]
  lockedEditIds: Set<string>
  activate: (focusId?: string) => void
  deactivate: () => void
  toggle: () => void
  panelOpen: boolean
  openPanel: () => void
  closePanel: () => void
}

const XRayContext = createContext<XRayContextValue>({
  active: false,
  focusedId: null,
  comments: [],
  lockedEditIds: new Set(),
  activate: () => {},
  deactivate: () => {},
  toggle: () => {},
  panelOpen: false,
  openPanel: () => {},
  closePanel: () => {},
})

export const useXRay = () => useContext(XRayContext)

export default function XRayProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const supabase = useRef(supabaseBrowser)

  // Shared Supabase subscription — consumed by ActivityFeed and XRaySidebar
  useEffect(() => {
    const client = supabase.current

    client
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setComments(data as Comment[])
      })

    const channel = client
      .channel('xray-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        const updated = payload.new as Comment
        setComments((prev) => {
          const idx = prev.findIndex((c) => c.id === updated.id)
          if (idx !== -1) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          return [updated, ...prev].slice(0, 20)
        })
      })
      .subscribe()

    return () => { client.removeChannel(channel) }
  }, [])

  // Read ?xray=<edit-id> on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const param = params.get('xray')
    if (param) {
      setActive(true)
      setFocusedId(param)
    }
  }, [])

  // ⌘. / Ctrl+. toggle, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        setActive((v) => {
          if (v) setFocusedId(null)
          return !v
        })
      }
      if (e.key === 'Escape' && active) {
        setActive(false)
        setFocusedId(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active])

  const lockedEditIds = useMemo(() => {
    const cutoff = Date.now() - 30 * 60 * 1000
    return new Set(
      comments
        .filter((c) =>
          ['queued', 'moderating', 'generating'].includes(c.status) &&
          new Date(c.updated_at).getTime() > cutoff
        )
        .map((c) => c.edit_id)
    )
  }, [comments])

  const activate = (focusId?: string) => {
    setActive(true)
    setFocusedId(focusId ?? null)
    setPanelOpen(false)
  }

  const deactivate = () => {
    setActive(false)
    setFocusedId(null)
  }

  const toggle = () => {
    setActive((v) => {
      if (v) setFocusedId(null)
      else setPanelOpen(false)
      return !v
    })
  }

  const openPanel = () => setPanelOpen(true)
  const closePanel = () => setPanelOpen(false)

  return (
    <XRayContext.Provider value={{ active, focusedId, comments, lockedEditIds, activate, deactivate, toggle, panelOpen, openPanel, closePanel }}>
      {children}
      <XRayPill />
      {panelOpen && <ActivityPanel />}
      <XRaySidebar />
    </XRayContext.Provider>
  )
}
