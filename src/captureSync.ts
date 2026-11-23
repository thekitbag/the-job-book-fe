import * as api from './api'
import { getNote, getPhoto, patchNote, patchPhoto } from './db'
import { canSyncCapture, getLocalOwnerId } from './localOwner'
import { announceCaptureChange } from './captureEvents'
import { mimeTypeFamily, track } from './analytics'
import type { LocalNote, LocalPhoto } from './types'
const code = (error: unknown) => (error as { code?: string })?.code
export const status = (error: unknown) =>
  (error as { status?: number })?.status ?? 0
const missingJob = (error: unknown) =>
  code(error) === 'JOB_NOT_FILEABLE' ||
  (status(error) === 404 && code(error) === 'JOB_NOT_FOUND')

/** Patch only response fields. A non-null server job always wins; a null job
 * preserves the choice made while the request was in flight so it can file. */
export async function syncNote(
  id: string,
  alive: () => boolean,
): Promise<void> {
  for (let round = 0; round < 4 && alive(); round++) {
    let note = await getNote(id)
    if (!note || !canSyncCapture(note) || !alive()) return
    if (!note.ownerUserId) {
      if (!note.jobId) return
      const sent = note
      const result = await api.uploadNote(note)
      if (!alive()) return
      await patchNote(id, {
        localState: 'uploaded',
        serverNoteId: result.noteId,
        serverJobId: sent.jobId,
        lastErrorCode: null,
      })
      announceCaptureChange()
      return
    }
    try {
      if (!note.serverNoteId) {
        track('note_upload_started', {
          ...(note.jobId ? { job_id: note.jobId } : {}),
          mime_type_family: mimeTypeFamily(note.mimeType),
        })
        const result = await api.uploadCaptureNote(note)
        if (!alive()) return
        await patchNote(id, {
          serverNoteId: result.id,
          serverJobId: result.jobId,
          ...(result.jobId ? { jobId: result.jobId } : {}),
          lastErrorCode: null,
        })
      }
      note = await getNote(id)
      if (!note || !alive()) return
      if (note.jobId && note.jobId !== note.serverJobId) {
        let actual: string | null
        try {
          actual = (await api.fileCaptureNote(note.serverNoteId!, note.jobId))
            .jobId
        } catch (error) {
          if (code(error) !== 'NOTE_ALREADY_FILED') throw error
          actual = (await api.getCaptureDraft(note.serverNoteId!)).jobId
        }
        if (!alive()) return
        await patchNote(id, {
          jobId: actual,
          serverJobId: actual,
          lastErrorCode: null,
        })
      }
      if (!alive()) return
      await patchNote(id, { localState: 'uploaded', lastErrorCode: null })
      announceCaptureChange()
      track('note_upload_succeeded', {
        ...(note.jobId ? { job_id: note.jobId } : {}),
        mime_type_family: mimeTypeFamily(note.mimeType),
      })
      return
    } catch (error) {
      if (!alive()) return
      const latest = await getNote(id)
      if (missingJob(error) && latest?.ownerUserId === getLocalOwnerId()) {
        if (latest.jobId === note?.jobId)
          await patchNote(id, {
            jobId: null,
            localState: 'uploading',
            lastErrorCode: 'JOB_NOT_FILEABLE',
          })
        continue
      }
      throw error
    }
  }
  throw new Error('The recording changed while saving. Try again.')
}
export async function syncPhoto(
  id: string,
  alive: () => boolean,
): Promise<void> {
  for (let round = 0; round < 4 && alive(); round++) {
    let photo = await getPhoto(id)
    if (!photo || !photo.ownerUserId || !canSyncCapture(photo) || !alive())
      return
    try {
      if (!photo.serverPhotoId) {
        const result = await api.uploadCapturePhoto(photo)
        if (!alive()) return
        await patchPhoto(id, {
          serverPhotoId: result.id,
          serverJobId: result.jobId,
          ...(result.jobId ? { jobId: result.jobId } : {}),
          lastErrorCode: null,
        })
      }
      photo = await getPhoto(id)
      if (!photo || !alive()) return
      if (photo.jobId && photo.jobId !== photo.serverJobId) {
        let actual: string | null
        try {
          actual = (
            await api.fileCapturePhoto(photo.serverPhotoId!, photo.jobId)
          ).jobId
        } catch (error) {
          if (code(error) !== 'PHOTO_ALREADY_FILED') throw error
          // This is an idempotent lookup, not a move or a new photo. The same bytes
          // and clientPhotoId go back without a job. Removed photos stop retrying.
          const latest = await getPhoto(id)
          if (!latest || !alive()) return
          actual = (await api.uploadCapturePhoto({ ...latest, jobId: null }))
            .jobId
        }
        if (!alive()) return
        await patchPhoto(id, {
          jobId: actual,
          serverJobId: actual,
          lastErrorCode: null,
        })
      }
      await patchPhoto(id, { localState: 'uploaded', lastErrorCode: null })
      announceCaptureChange()
      return
    } catch (error) {
      if (!alive()) return
      const latest = await getPhoto(id)
      if (missingJob(error) && latest?.ownerUserId === getLocalOwnerId()) {
        if (latest.jobId === photo?.jobId)
          await patchPhoto(id, {
            jobId: null,
            localState: 'uploading',
            lastErrorCode: 'JOB_NOT_FILEABLE',
          })
        continue
      }
      throw error
    }
  }
  throw new Error('The photo changed while saving. Try again.')
}
export function terminal(error: unknown) {
  const s = status(error)
  return s >= 400 && s < 500 && ![401, 408, 429].includes(s)
}
export function needsSync(item: LocalNote | LocalPhoto) {
  return (
    item.localState === 'saved_local' ||
    item.localState === 'upload_failed' ||
    (item.localState === 'uploaded' &&
      item.serverJobId !== undefined &&
      item.jobId !== null &&
      item.jobId !== item.serverJobId)
  )
}
