import type { CandidateFact, ExtractionStatus, Job, LocalNote, TranscriptStatus } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
// Mock is opt-in only — real backend is the default
const USE_MOCK = (import.meta.env.VITE_USE_MOCK_API as string | undefined) === 'true'

export interface UploadNoteResponse {
  noteId: string
  clientNoteId: string
  status: string
  isDuplicate: boolean
}

const MOCK_JOB: Job = {
  id: 'job-pilot-garden-room-001',
  title: 'Garden Room',
  roughLocationOrLabel: 'Mrs Patel – back garden',
  status: 'active',
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export async function getCurrentJob(): Promise<Job> {
  if (USE_MOCK) {
    await delay(200)
    return MOCK_JOB
  }
  const res = await fetch(`${API_BASE}/api/jobs/current`)
  if (!res.ok) throw new Error(`GET /api/jobs/current → ${res.status}`)
  return res.json() as Promise<Job>
}

// GET /api/jobs/:jobId/notes — lightweight status poll, one call per cycle.
// BE field is `id`, not `noteId`. transcript/extraction carry status only; no text here.
export interface NoteListRow {
  id: string
  clientNoteId: string
  transcript: { status: TranscriptStatus } | null
  extraction: { status: ExtractionStatus } | null
}

export async function getJobNoteStatuses(jobId: string): Promise<NoteListRow[]> {
  if (USE_MOCK) {
    await delay(300)
    return []
  }
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/notes`)
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId}/notes → ${res.status}`)
  return res.json() as Promise<NoteListRow[]>
}

// GET /api/jobs/:jobId/candidate-facts — all draft facts for the job, matched to notes by sourceNoteIds.
export async function getDraftFacts(jobId: string): Promise<CandidateFact[]> {
  if (USE_MOCK) {
    await delay(300)
    return []
  }
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/candidate-facts`)
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId}/candidate-facts → ${res.status}`)
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
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/notes/${serverNoteId}/transcript`)
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId}/notes/${serverNoteId}/transcript → ${res.status}`)
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
  const res = await fetch(`${API_BASE}/api/jobs/${note.jobId}/notes`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string }
    const err = new Error('Upload failed') as Error & { code?: string; status?: number }
    err.code = body.code
    err.status = res.status
    throw err
  }
  return res.json() as Promise<UploadNoteResponse>
}
