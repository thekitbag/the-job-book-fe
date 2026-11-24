import { useCallback, useEffect, useRef } from 'react'
import {
  getNote,
  getPhoto,
  getPendingNotes,
  getPendingPhotos,
  patchNote,
  patchPhoto,
  resetInterruptedUploads,
  subscribeLocalCaptures,
} from './db'
import {
  canSyncCapture,
  getCaptureSessionId,
  isCurrentCaptureSession,
  subscribeLocalOwner,
} from './localOwner'
import { syncNote, syncPhoto, terminal, needsSync } from './captureSync'
import { safeErrorKind, track } from './analytics'
/** Exactly one production engine, mounted by CaptureSyncProvider. */
export function useSync(onNotesChanged: () => void, enabled = true) {
  const inFlight = useRef(new Set<string>()),
    enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const changed = useRef(onNotesChanged)
  changed.current = onNotesChanged
  const notify = useCallback(() => {
    void Promise.resolve(changed.current()).catch(() => {})
  }, [])
  const process = useCallback(
    async function process(kind: 'note' | 'photo', id: string): Promise<void> {
      const key = kind === 'note' ? id : 'photo:' + id
      if (!enabledRef.current || !navigator.onLine || inFlight.current.has(key))
        return
      inFlight.current.add(key)
      const boundary = getCaptureSessionId(),
        alive = () => enabledRef.current && isCurrentCaptureSession(boundary)
      const read = () => (kind === 'note' ? getNote(id) : getPhoto(id))
      const patch = (value: Parameters<typeof patchNote>[1]) =>
        kind === 'note' ? patchNote(id, value) : patchPhoto(id, value)
      let started = false,
        succeeded = false
      try {
        const item = await read()
        if (!item || !needsSync(item) || !canSyncCapture(item) || !alive())
          return
        if (kind === 'photo' && !item.ownerUserId) return
        started = true
        await patch({
          localState: 'uploading',
          lastUploadAttemptAt: new Date().toISOString(),
        })
        notify()
        await (kind === 'note' ? syncNote(id, alive) : syncPhoto(id, alive))
        succeeded = true
      } catch (error) {
        if (!started || !alive()) return
        const item = await read()
        if (!item || !canSyncCapture(item)) return
        const count = terminal(error)
          ? item.uploadAttemptCount
          : item.uploadAttemptCount + 1
        const code = (error as { code?: string })?.code ?? 'NETWORK_ERROR'
        await patch({
          localState:
            terminal(error) || count >= 5
              ? 'upload_needs_attention'
              : 'upload_failed',
          uploadAttemptCount: count,
          lastErrorCode: code,
          lastUploadAttemptAt: new Date().toISOString(),
        }).catch(() => {})
        if (kind === 'note')
          track('note_upload_failed', {
            ...(item.jobId ? { job_id: item.jobId } : {}),
            error_kind: safeErrorKind(code),
          })
      } finally {
        inFlight.current.delete(key)
        notify()
        // A last-moment choice may have arrived while the id was locked. Retry that
        // successful unfiled upload once through filing, without looping failures.
        if (succeeded && alive()) {
          const item = await read()
          if (item?.localState === 'uploaded' && needsSync(item))
            void process(kind, id)
        }
      }
    },
    [notify],
  )
  const syncAll = useCallback(async () => {
    if (!enabledRef.current || !navigator.onLine) return
    try {
      const [notes, photos] = await Promise.all([
        getPendingNotes(),
        getPendingPhotos(),
      ])
      await Promise.all([
        ...notes
          .filter(canSyncCapture)
          .map((n) => process('note', n.clientNoteId)),
        ...photos
          .filter((p) => p.ownerUserId && canSyncCapture(p))
          .map((p) => process('photo', p.clientPhotoId)),
      ])
    } catch {
      /* Capture remains available if storage cannot open. */
    }
  }, [process])
  const retry = useCallback(
    async (kind: 'note' | 'photo', id: string) => {
      const item = await (kind === 'note' ? getNote(id) : getPhoto(id))
      if (
        !item ||
        !canSyncCapture(item) ||
        !enabledRef.current ||
        (kind === 'photo' && item.lastErrorCode === 'PHOTO_NOT_FOUND')
      )
        return
      const patch = kind === 'note' ? patchNote : patchPhoto
      await patch(id, {
        localState: 'saved_local',
        uploadAttemptCount: 0,
        lastErrorCode: null,
      })
      await process(kind, id)
    },
    [process],
  )
  const retryNote = useCallback((id: string) => retry('note', id), [retry]),
    retryPhoto = useCallback((id: string) => retry('photo', id), [retry])
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
        /* Save failure UI handles storage errors. */
      }
    }
    void resume()
    const online = () => {
        void resume()
      },
      foreground = () => {
        if (document.visibilityState === 'visible') void resume()
      }
    const owner = subscribeLocalOwner(online),
      captures = subscribeLocalCaptures((change) => {
        notify()
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
      owner()
      captures()
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [enabled, notify, syncAll])
  return { syncAll, retryNote, retryPhoto }
}
