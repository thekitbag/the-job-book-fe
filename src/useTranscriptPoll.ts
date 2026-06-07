import { useCallback, useEffect, useRef } from 'react'
import { getJobNoteStatuses, getNoteTranscript } from './api'
import { patchNote } from './db'
import type { ExtractionStatus, LocalNote, TranscriptStatus } from './types'

const POLL_INTERVAL_MS = 10_000
const TRANSCRIPT_FINAL: Set<TranscriptStatus> = new Set(['ready', 'failed'])
const EXTRACTION_FINAL: Set<ExtractionStatus> = new Set(['ready', 'failed'])

function isPollable(note: LocalNote): boolean {
  if (note.localState !== 'uploaded' || !note.serverNoteId) return false
  const transcriptDone = note.transcriptStatus !== null && TRANSCRIPT_FINAL.has(note.transcriptStatus)
  // Extraction only starts after transcript succeeds; only poll extraction if transcript is ready.
  const extractionDone = note.extractionStatus !== null && EXTRACTION_FINAL.has(note.extractionStatus)
  const needsExtractionPoll = note.transcriptStatus === 'ready' && !extractionDone
  return !transcriptDone || needsExtractionPoll
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
          const local = eligible.find(n => n.serverNoteId === row.id)
          if (!local) return

          try {
            // ── Transcript status ────────────────────────────────────────────
            if (row.transcript && row.transcript.status !== local.transcriptStatus) {
              const newStatus = row.transcript.status
              if (TRANSCRIPT_FINAL.has(newStatus)) {
                // Fetch full text and errorCode only for final states.
                const detail = await getNoteTranscript(jobId, row.id)
                await patchNote(local.clientNoteId, {
                  transcriptStatus: detail.status,
                  transcriptText: detail.text,
                  transcriptErrorCode: detail.errorCode,
                })
              } else {
                await patchNote(local.clientNoteId, { transcriptStatus: newStatus })
              }
              changed = true
            }

            // ── Extraction status ────────────────────────────────────────────
            // Only process once transcript is ready (extraction depends on it).
            if (
              local.transcriptStatus === 'ready' &&
              row.extraction &&
              row.extraction.status !== local.extractionStatus
            ) {
              await patchNote(local.clientNoteId, { extractionStatus: row.extraction.status })
              changed = true
            }
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

  // Only run while there are notes that still need status updates.
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
