import { useCallback, useEffect, useRef } from 'react'
import {
  getNote,
  getPendingNotes,
  patchNote,
  resetInterruptedUploads,
  subscribeLocalCaptures,
} from './db'
import { uploadNote as apiUploadNote } from './api'
import { ApiError } from './api/client'
import {
  canSyncCapture,
  getCaptureSessionId,
  isCurrentCaptureSession,
  subscribeLocalOwner,
} from './localOwner'
import { mimeTypeFamily, safeErrorKind, track } from './analytics'
import type { LocalNote } from './types'
const MAX_ATTEMPTS = 5
const pending = (n: LocalNote) =>
  n.localState === 'saved_local' || n.localState === 'upload_failed'

/** The single engine is mounted by CaptureSyncProvider above the app screens. */
export function useSync(onNotesChanged: () => void, enabled = true) {
  const inFlight = useRef(new Set<string>())
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const onChangedRef = useRef(onNotesChanged)
  onChangedRef.current = onNotesChanged
  const notify = useCallback(() => {
    void Promise.resolve(onChangedRef.current()).catch(() => {})
  }, [])
  const uploadOne = useCallback(
    async (id: string) => {
      if (!enabledRef.current || !navigator.onLine || inFlight.current.has(id))
        return
      inFlight.current.add(id)
      const session = getCaptureSessionId()
      let sent: LocalNote | undefined
      try {
        let fresh = await getNote(id)
        if (
          !fresh ||
          !pending(fresh) ||
          !fresh.jobId ||
          !canSyncCapture(fresh) ||
          !isCurrentCaptureSession(session) ||
          !enabledRef.current
        )
          return
        await patchNote(id, {
          localState: 'uploading',
          lastUploadAttemptAt: new Date().toISOString(),
        })
        notify()
        // A picker/save may have changed the row while the transaction waited.
        fresh = await getNote(id)
        if (
          !fresh ||
          !canSyncCapture(fresh) ||
          !isCurrentCaptureSession(session) ||
          !enabledRef.current
        )
          return
        if (!fresh.jobId) {
          await patchNote(id, { localState: 'saved_local' })
          return
        }
        sent = fresh
        track('note_upload_started', {
          job_id: sent.jobId,
          mime_type_family: mimeTypeFamily(sent.mimeType),
        })
        const { noteId } = await apiUploadNote(sent)
        // Never merge a pre-request object back into storage. Only patch the
        // upload fields of the row that is there now, retaining its job choice.
        const latest = await getNote(id)
        if (
          !latest ||
          !isCurrentCaptureSession(session) ||
          !canSyncCapture(latest) ||
          !enabledRef.current
        )
          return
        await patchNote(id, {
          localState: 'uploaded',
          serverNoteId: noteId,
          serverJobId: sent.jobId,
          lastErrorCode: null,
        })
        track('note_upload_succeeded', {
          job_id: sent.jobId,
          mime_type_family: mimeTypeFamily(sent.mimeType),
        })
      } catch (error) {
        if (!sent || !isCurrentCaptureSession(session) || !enabledRef.current)
          return
        try {
          const latest = await getNote(id)
          if (!latest || !canSyncCapture(latest)) return
          const status = error instanceof ApiError ? error.status : 0
          const terminal =
            status >= 400 &&
            status < 500 &&
            status !== 408 &&
            status !== 429 &&
            status !== 401
          const count = terminal
            ? latest.uploadAttemptCount
            : latest.uploadAttemptCount + 1
          const code =
            (error as { code?: string })?.code ??
            (error instanceof Error ? error.message : 'UNKNOWN')
          await patchNote(id, {
            localState:
              terminal || count >= MAX_ATTEMPTS
                ? 'upload_needs_attention'
                : 'upload_failed',
            uploadAttemptCount: count,
            lastUploadAttemptAt: new Date().toISOString(),
            lastErrorCode: code,
          })
          track('note_upload_failed', {
            job_id: sent.jobId,
            error_kind: safeErrorKind(code),
          })
        } catch {
          /* Storage failure is never treated as a network attempt. The blob remains on the phone. */
        }
      } finally {
        inFlight.current.delete(id)
        notify()
      }
    },
    [notify],
  )
  const syncAll = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.onLine ||
      !enabledRef.current
    )
      return
    try {
      const notes = await getPendingNotes()
      await Promise.all(
        notes
          .filter((n) => n.jobId !== null && canSyncCapture(n))
          .map((n) => uploadOne(n.clientNoteId)),
      )
    } catch {
      /* Saving/listing surfaces storage failures; background sync must not reject unhandled. */
    }
  }, [uploadOne])
  const retryNote = useCallback(
    async (id: string) => {
      const note = await getNote(id)
      if (!note || !canSyncCapture(note) || !enabledRef.current) return
      await patchNote(id, {
        localState: 'saved_local',
        uploadAttemptCount: 0,
        lastErrorCode: null,
      })
      notify()
      await uploadOne(id)
    },
    [notify, uploadOne],
  )
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const resume = async () => {
      try {
        await resetInterruptedUploads(inFlight.current)
        if (alive) {
          notify()
          await syncAll()
        }
      } catch {
        /* Do not block capture on opening storage. */
      }
    }
    void resume()
    const online = () => {
      void resume()
    }
    const foreground = () => {
      if (document.visibilityState === 'visible') void resume()
    }
    const unsubscribeOwner = subscribeLocalOwner(() => {
      void resume()
    })
    const unsubscribeCaptures = subscribeLocalCaptures((change) => {
      if (
        change.kind === 'saved' ||
        change.kind === 'ownership' ||
        change.jobChanged
      )
        void syncAll()
    })
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      alive = false
      unsubscribeOwner()
      unsubscribeCaptures()
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [enabled, notify, syncAll])
  return { syncAll, retryNote }
}
