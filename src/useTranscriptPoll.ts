import { useCallback, useEffect, useRef } from 'react'
import { getJobNoteStatuses, getNoteTranscript } from './api'
import { patchNote } from './db'
import type { LocalNote, TranscriptStatus } from './types'

const POLL_INTERVAL_MS = 10_000
const FINAL: Set<TranscriptStatus> = new Set(['ready', 'failed'])

function isPollable(note: LocalNote): boolean {
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
      // One list call for lightweight status across all notes.
      // BE field is `id`, not `noteId`.
      const rows = await getJobNoteStatuses(jobId)
      let changed = false

      await Promise.all(
        rows.map(async (row) => {
          if (!row.transcript) return
          const local = eligible.find(n => n.serverNoteId === row.id)
          if (!local) return

          const newStatus = row.transcript.status
          if (newStatus === local.transcriptStatus) return

          try {
            if (FINAL.has(newStatus)) {
              // Fetch full text and errorCode only when the note has reached a final state.
              const detail = await getNoteTranscript(jobId, row.id)
              await patchNote(local.clientNoteId, {
                transcriptStatus: detail.status,
                transcriptText: detail.text,
                transcriptErrorCode: detail.errorCode,
              })
            } else {
              // waiting / transcribing — status-only update, no text call needed.
              await patchNote(local.clientNoteId, { transcriptStatus: newStatus })
            }
            changed = true
          } catch {
            // swallow per-note errors — will retry on next interval
          }
        }),
      )

      if (changed) onChangedRef.current()
    } catch {
      // swallow list-fetch errors — will retry on next interval
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
