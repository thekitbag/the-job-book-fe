import type { CandidateFact, ConfidenceLabel, ExtractionStatus, FactType, Job, LocalNote, ReviewDecision, ReviewDecisionResponse, ReviewDraftSection, TranscriptStatus } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
// Mock is opt-in only — real backend is the default
const USE_MOCK = (import.meta.env.VITE_USE_MOCK_API as string | undefined) === 'true'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

// All real-mode API calls go through apiFetch so credentials are always included.
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: 'include' })
}

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

// POST /api/auth/pilot-login — exchange passcode for a session cookie.
export async function pilotLogin(passcode: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    if (passcode !== 'demo') throw new ApiError('Wrong passcode', 401)
    return
  }
  const res = await apiFetch('/api/auth/pilot-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  })
  if (res.status === 401) throw new ApiError('Wrong passcode', 401)
  if (!res.ok) throw new ApiError(`POST /api/auth/pilot-login → ${res.status}`, res.status)
}

export async function getCurrentJob(): Promise<Job> {
  if (USE_MOCK) {
    await delay(200)
    return MOCK_JOB
  }
  const res = await apiFetch('/api/jobs/current')
  if (!res.ok) throw new ApiError(`GET /api/jobs/current → ${res.status}`, res.status)
  return res.json() as Promise<Job>
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

// Raw BE response types for /api/jobs/:jobId/review-draft — mapped before returning to callers.
interface RawReviewItem {
  candidateFact: {
    id: string
    factType: FactType
    status: 'draft' | 'unclear'
    summary: string
    confidenceLabel: ConfidenceLabel
    confidenceReason: string | null
    uncertaintyFlags: string[]
    materialName: string | null
    quantity: string | null
    unit: string | null
    supplierName: string | null
    deliveryTiming: string | null
    locationOrUse: string | null
  }
  source: {
    transcriptText: string | null
    noteId: string
    transcriptId: string
  } | null
}

interface RawReviewGroup {
  key: string
  label: string
  items: RawReviewItem[]
}

interface RawReviewDraftResponse {
  jobId: string
  groups: RawReviewGroup[]
}

function mapReviewDraft(raw: RawReviewDraftResponse): ReviewDraftSection[] {
  return raw.groups.map(group => ({
    key: group.key,
    label: group.label,
    items: group.items.map(item => ({
      id: item.candidateFact.id,
      factType: item.candidateFact.factType,
      status: item.candidateFact.status,
      summary: item.candidateFact.summary,
      confidenceLabel: item.candidateFact.confidenceLabel,
      confidenceReason: item.candidateFact.confidenceReason,
      uncertaintyFlags: item.candidateFact.uncertaintyFlags,
      materialName: item.candidateFact.materialName,
      quantity: item.candidateFact.quantity,
      unit: item.candidateFact.unit,
      supplierName: item.candidateFact.supplierName,
      deliveryTiming: item.candidateFact.deliveryTiming,
      locationOrUse: item.candidateFact.locationOrUse,
      sourceTranscript: item.source?.transcriptText ?? null,
      sourceNoteIds: item.source ? [item.source.noteId] : [],
    })),
  }))
}

// GET /api/jobs/:jobId/review-draft — grouped draft facts ready for Mike to confirm/edit/reject.
export async function getReviewDraft(jobId: string): Promise<ReviewDraftSection[]> {
  if (USE_MOCK) {
    await delay(400)
    return mapReviewDraft({
      jobId,
      groups: [
        {
          key: 'ordered_material',
          label: 'Ordered materials',
          items: [
            {
              candidateFact: {
                id: 'mock-fact-001',
                factType: 'ordered_material',
                status: 'draft',
                summary: 'Ordered 12 sheets of plasterboard from Jewson',
                confidenceLabel: 'high',
                confidenceReason: null,
                uncertaintyFlags: [],
                materialName: 'plasterboard',
                quantity: '12',
                unit: 'sheets',
                supplierName: 'Jewson',
                deliveryTiming: 'tomorrow morning',
                locationOrUse: null,
              },
              source: {
                transcriptText: 'Ordered another 12 sheets of plasterboard from Jewson, coming tomorrow morning.',
                noteId: 'mock-note-001',
                transcriptId: 'mock-trans-001',
              },
            },
          ],
        },
        {
          key: 'unclear',
          label: 'Unclear items',
          items: [
            {
              candidateFact: {
                id: 'mock-fact-002',
                factType: 'unclear',
                status: 'unclear',
                summary: 'Possibly around 3 insulation packs left',
                confidenceLabel: 'low',
                confidenceReason: null,
                uncertaintyFlags: ['approximate_quantity'],
                materialName: 'insulation',
                quantity: '3',
                unit: 'packs',
                supplierName: null,
                deliveryTiming: null,
                locationOrUse: null,
              },
              source: {
                transcriptText: 'Probably got three insulation packs left.',
                noteId: 'mock-note-001',
                transcriptId: 'mock-trans-001',
              },
            },
          ],
        },
      ],
    })
  }
  const res = await apiFetch(`/api/jobs/${jobId}/review-draft`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/review-draft → ${res.status}`, res.status)
  const raw = await res.json() as RawReviewDraftResponse
  return mapReviewDraft(raw)
}

// POST /api/jobs/:jobId/review-decisions — submit a single review action.
// Returns { confirmed, skipped } for confirm_section; empty object for other actions.
export async function submitReviewDecision(jobId: string, decision: ReviewDecision): Promise<ReviewDecisionResponse> {
  if (USE_MOCK) {
    await delay(300)
    return {}
  }
  const res = await apiFetch(`/api/jobs/${jobId}/review-decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
  })
  if (!res.ok) throw new ApiError(`POST /api/jobs/${jobId}/review-decisions → ${res.status}`, res.status)
  return res.json() as Promise<ReviewDecisionResponse>
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
