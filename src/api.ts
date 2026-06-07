import type { Job, LocalNote } from './types'

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
