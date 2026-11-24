import { apiFetch, ApiError, USE_MOCK } from './client'
import type { LocalNote, LocalPhoto } from '../types'
import type {
  CaptureDraft,
  CaptureHome,
  CaptureNote,
  CapturePhoto,
  UnfiledCaptures,
} from '../captureTypes'
import { announceCaptureChange } from '../captureEvents'
import * as mock from './mock/capture'
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: string
      message?: string
    }
    throw Object.assign(
      new ApiError(body.message ?? 'Could not save this change', res.status),
      { code: body.code },
    )
  }
  return res.json() as Promise<T>
}
const post = (body: object): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export async function getCaptureHome(): Promise<CaptureHome> {
  return USE_MOCK ? mock.home() : json('/api/home')
}
export async function getUnfiledCaptures(): Promise<UnfiledCaptures> {
  return USE_MOCK ? mock.unfiled() : json('/api/unfiled')
}
export async function uploadCaptureNote(note: LocalNote): Promise<CaptureNote> {
  if (USE_MOCK) return mock.uploadNote(note)
  const form = new FormData()
  form.set(
    'audio',
    note.blob,
    'note.' + (note.mimeType.split('/')[1]?.split(';')[0] ?? 'webm'),
  )
  form.set('clientNoteId', note.clientNoteId)
  form.set('capturedAt', note.capturedAt)
  form.set('durationMs', String(note.durationMs))
  form.set('mimeType', note.mimeType)
  form.set('captureContext', note.captureContext ?? 'job')
  if (note.jobId) form.set('jobId', note.jobId)
  return (
    await json<{ note: CaptureNote }>('/api/notes', {
      method: 'POST',
      body: form,
    })
  ).note
}
export async function fileCaptureNote(
  id: string,
  jobId: string,
): Promise<CaptureNote> {
  const result = USE_MOCK
    ? await mock.fileNote(id, jobId)
    : (
        await json<{ note: CaptureNote }>(
          `/api/notes/${id}/file`,
          post({ jobId }),
        )
      ).note
  announceCaptureChange()
  return result
}
export async function moveCaptureNote(
  id: string,
  jobId: string,
): Promise<CaptureNote> {
  const result = USE_MOCK
    ? await mock.moveNote(id, jobId)
    : (
        await json<{ note: CaptureNote }>(
          `/api/notes/${id}/move`,
          post({ jobId }),
        )
      ).note
  announceCaptureChange()
  return result
}
export async function uploadCapturePhoto(
  photo: LocalPhoto,
): Promise<CapturePhoto> {
  if (USE_MOCK) return mock.uploadPhoto(photo)
  const form = new FormData()
  form.set('file', photo.blob, 'photo')
  form.set('clientPhotoId', photo.clientPhotoId)
  form.set('captureContext', photo.captureContext ?? 'home')
  if (photo.jobId) form.set('jobId', photo.jobId)
  return (
    await json<{ photo: CapturePhoto }>('/api/photos', {
      method: 'POST',
      body: form,
    })
  ).photo
}
export async function fileCapturePhoto(
  id: string,
  jobId: string,
): Promise<CapturePhoto> {
  const result = USE_MOCK
    ? await mock.filePhoto(id, jobId)
    : (
        await json<{ photo: CapturePhoto }>(
          `/api/photos/${id}/file`,
          post({ jobId }),
        )
      ).photo
  announceCaptureChange()
  return result
}
export async function moveCapturePhoto(
  id: string,
  jobId: string,
): Promise<CapturePhoto> {
  const result = USE_MOCK
    ? await mock.movePhoto(id, jobId)
    : (
        await json<{ photo: CapturePhoto }>(
          `/api/photos/${id}/move`,
          post({ jobId }),
        )
      ).photo
  announceCaptureChange()
  return result
}
export async function getCaptureDraft(id: string): Promise<CaptureDraft> {
  return USE_MOCK ? mock.draft(id) : json(`/api/notes/${id}/draft`)
}
export async function confirmCaptureDraft(
  id: string,
  queueItemIds: string[],
): Promise<{ confirmed: string[]; alreadyDecided: string[] }> {
  const result = USE_MOCK
    ? await mock.looksRight(id, queueItemIds)
    : await json<{ confirmed: string[]; alreadyDecided: string[] }>(
        `/api/notes/${id}/looks-right`,
        post({ queueItemIds }),
      )
  announceCaptureChange()
  return result
}
