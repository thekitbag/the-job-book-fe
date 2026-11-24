import { useEffect, useState } from 'react'
import {
  getAllNotes,
  getAllPhotos,
  getUnmatchedNotes,
  getUnmatchedPhotos,
  subscribeLocalCaptures,
} from './db'
import { getCaptureSessionId, subscribeLocalOwner } from './localOwner'
import type { LocalNote, LocalPhoto } from './types'
export function useLocalCaptures() {
  const [state, setState] = useState<{
    notes: LocalNote[]
    photos: LocalPhoto[]
    unmatched: LocalNote[]
    unmatchedPhotos: LocalPhoto[]
  }>({ notes: [], photos: [], unmatched: [], unmatchedPhotos: [] })
  useEffect(() => {
    let active = true,
      version = 0
    const load = async () => {
      const request = ++version,
        boundary = getCaptureSessionId()
      try {
        const [notes, photos, unmatched, unmatchedPhotos] = await Promise.all([
          getAllNotes(),
          getAllPhotos(),
          getUnmatchedNotes(),
          getUnmatchedPhotos(),
        ])
        if (active && request === version && boundary === getCaptureSessionId())
          setState({ notes, photos, unmatched, unmatchedPhotos })
      } catch {
        /* Save failures have their own visible retry notice. */
      }
    }
    void load()
    const a = subscribeLocalCaptures(() => {
        void load()
      }),
      b = subscribeLocalOwner(() => {
        setState({ notes: [], photos: [], unmatched: [], unmatchedPhotos: [] })
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
