import { useCallback, useEffect, useRef } from 'react'
import { getAllNotes, getPendingNotes, patchNote, resetInterruptedUploads } from './db'
import { uploadNote as apiUploadNote } from './api'
import { mimeTypeFamily, safeErrorKind, track } from './analytics'
import type { LocalNote } from './types'

const MAX_ATTEMPTS = 5

export function useSync(onNotesChanged: () => void) {
  const inFlight = useRef<Set<string>>(new Set())
  // Stable ref so syncAll/uploadOne can be recreated without stale closure issues
  const onChangedRef = useRef(onNotesChanged)
  onChangedRef.current = onNotesChanged

  const uploadOne = useCallback(async (note: LocalNote) => {
    if (inFlight.current.has(note.clientNoteId)) return
    inFlight.current.add(note.clientNoteId)

    await patchNote(note.clientNoteId, {
      localState: 'uploading',
      lastUploadAttemptAt: new Date().toISOString(),
    })
    onChangedRef.current()
    track('note_upload_started', { job_id: note.jobId, mime_type_family: mimeTypeFamily(note.mimeType) })

    try {
      const { noteId } = await apiUploadNote(note)
      await patchNote(note.clientNoteId, { localState: 'uploaded', serverNoteId: noteId })
      track('note_upload_succeeded', { job_id: note.jobId, mime_type_family: mimeTypeFamily(note.mimeType) })
    } catch (err) {
      const newCount = note.uploadAttemptCount + 1
      const code = err instanceof Error ? err.message : 'UNKNOWN'
      track('note_upload_failed', { job_id: note.jobId, error_kind: safeErrorKind(code) })
      await patchNote(note.clientNoteId, {
        localState: newCount >= MAX_ATTEMPTS ? 'upload_needs_attention' : 'upload_failed',
        uploadAttemptCount: newCount,
        lastUploadAttemptAt: new Date().toISOString(),
        lastErrorCode: code,
      })
    } finally {
      inFlight.current.delete(note.clientNoteId)
      onChangedRef.current()
    }
  }, [])

  const syncAll = useCallback(() => {
    // `init` defers syncAll to a microtask; guard against the global being gone
    // if that fires after the page/test environment has torn down (offline is
    // also a no-op — nothing to send).
    if (typeof navigator === 'undefined' || !navigator.onLine) return
    getPendingNotes().then(pending => {
      pending.forEach(n => uploadOne(n))
    })
  }, [uploadOne])

  const retryNote = useCallback(async (clientNoteId: string) => {
    const all = await getAllNotes()
    const note = all.find(n => n.clientNoteId === clientNoteId)
    if (note) {
      // Reset attempt count so it doesn't immediately go to needs_attention
      await patchNote(clientNoteId, {
        localState: 'saved_local',
        uploadAttemptCount: 0,
        lastErrorCode: null,
      })
      onChangedRef.current()
      uploadOne({ ...note, localState: 'saved_local', uploadAttemptCount: 0 })
    }
  }, [uploadOne])

  useEffect(() => {
    const init = async () => {
      const reset = await resetInterruptedUploads()
      if (reset > 0) onChangedRef.current()
      syncAll()
    }
    init()
    window.addEventListener('online', syncAll)
    return () => window.removeEventListener('online', syncAll)
  }, [syncAll])

  return { syncAll, retryNote }
}
