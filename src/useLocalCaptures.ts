import { useEffect, useState } from 'react'
import {
  getAllNotes,
  getAllPhotos,
  getUnmatchedNotes,
  subscribeLocalCaptures,
} from './db'
import { getCaptureSessionId, subscribeLocalOwner } from './localOwner'
import type { LocalNote, LocalPhoto } from './types'
export function useLocalCaptures() {
  const [state, setState] = useState<{
    notes: LocalNote[]
    photos: LocalPhoto[]
    unmatched: LocalNote[]
  }>({ notes: [], photos: [], unmatched: [] })
  useEffect(() => {
    let active = true,
      version = 0
    const load = async () => {
      const request = ++version,
        boundary = getCaptureSessionId()
      try {
        const [notes, photos, unmatched] = await Promise.all([
          getAllNotes(),
          getAllPhotos(),
          getUnmatchedNotes(),
        ])
        if (active && request === version && boundary === getCaptureSessionId())
          setState({ notes, photos, unmatched })
      } catch {
        /* Save failures have their own visible retry notice. */
      }
    }
    void load()
    const a = subscribeLocalCaptures(() => {
        void load()
      }),
      b = subscribeLocalOwner(() => {
        setState({ notes: [], photos: [], unmatched: [] })
        void load()
      })
    return () => {
      active = false
      a()
      b()
    }
  }, [])
  return state
}
