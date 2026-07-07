import type { CandidateFact, ExtractionStatus, LocalNote, TranscriptStatus } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'

export interface UploadNoteResponse {
  noteId: string
  clientNoteId: string
  status: string
  isDuplicate: boolean
}

// GET /api/jobs/:jobId/notes — lightweight status poll, one call per cycle.
// BE field is `id`, not `noteId`. Extraction status is nested inside transcript, not a separate key.
export interface NoteListRow {
  id: string
  clientNoteId: string
  transcript: { status: TranscriptStatus; extractionStatus: ExtractionStatus | null } | null
}

export async function getJobNoteStatuses(jobId: string): Promise<NoteListRow[]> {
  if (USE_MOCK) {
    await delay(300)
    return []
  }
  const res = await apiFetch(`/api/jobs/${jobId}/notes`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/notes → ${res.status}`, res.status)
  return res.json() as Promise<NoteListRow[]>
}

// GET /api/jobs/:jobId/facts — all draft facts for the job, matched to notes by sourceNoteIds.
export async function getDraftFacts(jobId: string): Promise<CandidateFact[]> {
  if (USE_MOCK) {
    await delay(300)
    return []
  }
  const res = await apiFetch(`/api/jobs/${jobId}/facts`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/facts → ${res.status}`, res.status)
  return res.json() as Promise<CandidateFact[]>
}

// GET /api/jobs/:jobId/notes/:noteId/transcript — fetched only when status is ready or failed.
export interface TranscriptResponse {
  noteId: string
  status: TranscriptStatus
  text: string | null
  errorCode: string | null
}

export async function getNoteTranscript(jobId: string, serverNoteId: string): Promise<TranscriptResponse> {
  if (USE_MOCK) {
    await delay(300)
    return { noteId: serverNoteId, status: 'waiting', text: null, errorCode: null }
  }
  const res = await apiFetch(`/api/jobs/${jobId}/notes/${serverNoteId}/transcript`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/notes/${serverNoteId}/transcript → ${res.status}`, res.status)
  return res.json() as Promise<TranscriptResponse>
}

export async function uploadNote(note: LocalNote): Promise<UploadNoteResponse> {
  if (USE_MOCK) {
    await delay(1000 + Math.random() * 500)
    return {
      noteId: `srv-${note.clientNoteId}`,
      clientNoteId: note.clientNoteId,
      status: 'uploaded',
      isDuplicate: false,
    }
  }
  const ext = note.mimeType.split('/')[1]?.split(';')[0] ?? 'webm'
  const form = new FormData()
  form.append('clientNoteId', note.clientNoteId)
  form.append('capturedAt', note.capturedAt)
  form.append('durationMs', String(note.durationMs))
  form.append('mimeType', note.mimeType)
  form.append('audio', note.blob, `note.${ext}`)
  const res = await apiFetch(`/api/jobs/${note.jobId}/notes`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string }
    const err = new ApiError('Upload failed', res.status) as ApiError & { code?: string }
    err.code = body.code
    throw err
  }
  return res.json() as Promise<UploadNoteResponse>
}
