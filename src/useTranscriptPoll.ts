import { useCallback, useEffect, useRef } from 'react'
import { getNoteTranscript } from './api'
import { patchNote } from './db'
import type { LocalNote, TranscriptStatus } from './types'

const POLL_INTERVAL_MS = 10_000
const FINAL: Set<TranscriptStatus> = new Set(['ready', 'failed'])

function isPollable(note: LocalNote): note is LocalNote & { serverNoteId: string } {
  return (
    note.localState === 'uploaded' &&
    note.serverNoteId !== null &&
    (note.transcriptStatus === null || !FINAL.has(note.transcriptStatus))
  )
}

export function useTranscriptPoll(
  notes: LocalNote[],
  jobId: string,
  onChanged: () => void,
): { refreshNow: () => void } {
  const notesRef = useRef(notes)
  notesRef.current = notes
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  const polling = useRef(false)

  const pollOnce = useCallback(async () => {
    if (polling.current) return
    const eligible = notesRef.current.filter(isPollable)
    if (eligible.length === 0) return
    polling.current = true
    try {
      let changed = false
      await Promise.all(
        eligible.map(async (note) => {
          try {
            const result = await getNoteTranscript(jobId, note.serverNoteId)
            if (
              result.status !== note.transcriptStatus ||
              result.text !== note.transcriptText ||
              result.errorCode !== note.transcriptErrorCode
            ) {
              await patchNote(note.clientNoteId, {
                transcriptStatus: result.status,
                transcriptText: result.text,
                transcriptErrorCode: result.errorCode,
              })
              changed = true
            }
          } catch {
            // swallow per-note errors — will retry on next interval
          }
        }),
      )
      if (changed) onChangedRef.current()
    } finally {
      polling.current = false
    }
  }, [jobId])

  // Only run while there are notes that still need a transcript.
  // Triggers on initial notes load and whenever new pollable notes appear.
  const hasEligible = notes.some(isPollable)

  useEffect(() => {
    if (!hasEligible) return
    pollOnce()
    const id = setInterval(pollOnce, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [hasEligible, pollOnce])

  return { refreshNow: pollOnce }
}
