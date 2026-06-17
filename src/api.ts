import type { AlreadyRememberedItem, CandidateFact, ConfidenceLabel, ExtractionStatus, FactType, InspectionData, Job, JobType, LocalNote, MemoryType, MemoryViewResponse, QueueDecision, QueueDecisionResponse, QueueItem, ReviewDecision, ReviewDecisionResponse, ReviewDraftSection, ReviewQueue, TranscriptStatus } from './types'

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

const MOCK_JOBS: Job[] = [
  {
    id: 'job-pilot-garden-room-001',
    title: 'Garden Room',
    jobType: 'garden_room',
    roughLocationOrLabel: 'Mrs Patel – back garden',
    status: 'active',
    createdAt: '2026-06-01T08:00:00Z',
    updatedAt: '2026-06-10T09:00:00Z',
  },
  {
    id: 'job-pilot-extension-002',
    title: 'Kitchen Extension',
    jobType: 'extension',
    roughLocationOrLabel: null,
    status: 'active',
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-06-08T14:00:00Z',
  },
]

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
    return MOCK_JOBS[0]
  }
  const res = await apiFetch('/api/jobs/current')
  if (!res.ok) throw new ApiError(`GET /api/jobs/current → ${res.status}`, res.status)
  return res.json() as Promise<Job>
}

// GET /api/jobs — returns Mike's jobs, active/recent first.
export async function getJobs(): Promise<Job[]> {
  if (USE_MOCK) {
    await delay(300)
    return MOCK_JOBS
  }
  const res = await apiFetch('/api/jobs')
  if (!res.ok) throw new ApiError(`GET /api/jobs → ${res.status}`, res.status)
  return res.json() as Promise<Job[]>
}

// POST /api/jobs — create a lightweight job. Requires network.
export async function createJob(title: string, jobType?: JobType): Promise<Job> {
  if (USE_MOCK) {
    await delay(500)
    const newJob: Job = {
      id: `job-mock-${Date.now()}`,
      title: title.trim(),
      jobType: jobType ?? 'other',
      roughLocationOrLabel: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    MOCK_JOBS.unshift(newJob)
    return newJob
  }
  const res = await apiFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim(), jobType }),
  })
  if (!res.ok) throw new ApiError(`POST /api/jobs → ${res.status}`, res.status)
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

const MOCK_QUEUE_ITEMS: QueueItem[] = [
  {
    id: 'queue-item-mock-001',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
    proposedMemory: {
      memoryType: 'ordered_material' as MemoryType,
      summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
      materialName: 'hardcore',
      quantity: '8',
      unit: 'bags',
      supplierName: 'Jewson',
      deliveryTiming: null,
      locationOrUse: null,
      costAmount: '5',
      costCurrency: 'GBP',
      costQualifier: 'each',
      totalCostAmount: '40',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-001'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-001',
        noteId: 'mock-note-001',
        transcriptId: 'mock-trans-001',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Bought 8 bags of hardcore from Jewson, five pounds each.',
      },
    ],
  },
  {
    id: 'queue-item-mock-002',
    kind: 'duplicate_group',
    status: 'draft',
    reviewLabel: 'Looks like the same item',
    timeLabel: 'Today',
    summary: 'Used OSB boards on the back wall',
    proposedMemory: {
      memoryType: 'used_material' as MemoryType,
      summary: 'Used OSB boards on the back wall',
      materialName: 'OSB',
      quantity: null,
      unit: 'boards',
      supplierName: null,
      deliveryTiming: null,
      locationOrUse: 'back wall',
      costAmount: null,
      costCurrency: null,
      costQualifier: null,
      totalCostAmount: null,
    },
    confidenceLabel: 'medium',
    uncertaintyFlags: ['uncertain_quantity'],
    sourceCandidateFactIds: ['mock-fact-002', 'mock-fact-003'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-002',
        noteId: 'mock-note-001',
        transcriptId: 'mock-trans-001',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Used six OSB boards on the back wall.',
      },
      {
        candidateFactId: 'mock-fact-003',
        noteId: 'mock-note-002',
        transcriptId: 'mock-trans-002',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Put some OSB on the back wall earlier.',
      },
    ],
  },
]

const MOCK_REMEMBERED: AlreadyRememberedItem[] = [
  {
    memoryItemId: 'mem-mock-001',
    summary: 'Ordered scaffolding from TCS',
    memoryType: 'ordered_material',
    timeLabel: 'Yesterday',
    supplierName: 'TCS',
    deliveryTiming: 'Friday morning',
    materialName: 'scaffolding',
    quantity: null,
    unit: null,
    locationOrUse: null,
  },
  {
    memoryItemId: 'mem-mock-002',
    summary: 'Watch out — uneven floor near back door',
    memoryType: 'watch_out',
    timeLabel: 'Earlier',
    materialName: null,
    quantity: null,
    unit: null,
    supplierName: null,
    deliveryTiming: null,
    locationOrUse: 'near back door',
  },
]

// GET /api/jobs/:jobId/review-queue — all unresolved draft items for the job.
export async function getReviewQueue(jobId: string): Promise<ReviewQueue> {
  if (USE_MOCK) {
    await delay(500)
    return {
      jobId,
      generatedAt: new Date().toISOString(),
      sections: [
        { key: 'ordered_materials', label: 'Ordered materials', items: [MOCK_QUEUE_ITEMS[0]] },
        { key: 'used_materials', label: 'Used materials', items: [MOCK_QUEUE_ITEMS[1]] },
      ],
      alreadyRemembered: MOCK_REMEMBERED,
    }
  }
  const res = await apiFetch(`/api/jobs/${jobId}/review-queue`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/review-queue → ${res.status}`, res.status)
  return res.json() as Promise<ReviewQueue>
}

// POST /api/jobs/:jobId/review-queue-decisions — confirm, correct, or dismiss.
export async function submitQueueDecision(
  jobId: string,
  decision: QueueDecision,
): Promise<QueueDecisionResponse> {
  if (USE_MOCK) {
    await delay(300)
    const statusMap = { confirm: 'confirmed', correct: 'corrected', dismiss: 'dismissed' } as const
    return {
      queueItemId: decision.queueItemId,
      action: decision.action,
      status: statusMap[decision.action],
      memoryItemId: decision.action !== 'dismiss' ? `mem-${decision.queueItemId}` : undefined,
      sourceCandidateFactIds: [],
    }
  }
  const res = await apiFetch(`/api/jobs/${jobId}/review-queue-decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
  })
  if (!res.ok) throw new ApiError(`POST /api/jobs/${jobId}/review-queue-decisions → ${res.status}`, res.status)
  return res.json() as Promise<QueueDecisionResponse>
}

// GET /api/internal/pilot/jobs/:jobId/inspection
// Requires X-Internal-Inspection-Key header plus an authenticated session.
export async function getInspectionData(jobId: string, inspectionKey: string): Promise<InspectionData> {
  if (USE_MOCK) {
    await delay(600)
    return MOCK_INSPECTION_DATA(jobId)
  }
  const res = await apiFetch(`/api/internal/pilot/jobs/${jobId}/inspection`, {
    headers: { 'X-Internal-Inspection-Key': inspectionKey },
  })
  if (res.status === 401) throw new ApiError('Invalid or missing inspection key', 401)
  if (!res.ok) throw new ApiError(`GET inspection → ${res.status}`, res.status)
  return res.json() as Promise<InspectionData>
}

function MOCK_INSPECTION_DATA(jobId: string): InspectionData {
  return {
    job: MOCK_JOBS.find(j => j.id === jobId) ?? MOCK_JOBS[0],
    generatedAt: new Date().toISOString(),
    notesByDay: [
      {
        localDate: '2026-06-11',
        notes: [
          {
            id: 'note-inspect-001',
            clientNoteId: 'client-note-001',
            capturedAt: '2026-06-11T09:15:00.000Z',
            uploadedAt: '2026-06-11T09:15:08.000Z',
            serverStatus: 'transcribed',
            mimeType: 'audio/webm;codecs=opus',
            durationMs: 18000,
            sizeBytes: 240000,
            audioStored: true,
            transcript: {
              id: 'trans-inspect-001',
              status: 'ready',
              text: 'Ordered 12 sheets of plasterboard from Jewson, coming tomorrow morning.',
              language: 'en',
              provider: 'openai',
              model: 'whisper-1',
              errorCode: null,
              extractionStatus: 'ready',
              extractionErrorCode: null,
            },
            candidateFacts: [
              {
                id: 'fact-inspect-001',
                factType: 'ordered_material',
                status: 'confirmed',
                summary: 'Ordered 12 sheets of plasterboard from Jewson',
                materialName: 'plasterboard',
                quantity: '12',
                unit: 'sheets',
                supplierName: 'Jewson',
                deliveryTiming: 'tomorrow morning',
                locationOrUse: null,
                confidenceLabel: 'high',
                uncertaintyFlags: [],
                reviewState: 'confirmed',
                reviewDecisionIds: ['decision-001'],
                memoryItemIds: ['memory-001'],
              },
            ],
          },
          {
            id: 'note-inspect-002',
            clientNoteId: 'client-note-002',
            capturedAt: '2026-06-11T11:30:00.000Z',
            uploadedAt: '2026-06-11T11:30:05.000Z',
            serverStatus: 'transcribed',
            mimeType: 'audio/webm;codecs=opus',
            durationMs: 9000,
            sizeBytes: 120000,
            audioStored: true,
            transcript: {
              id: 'trans-inspect-002',
              status: 'ready',
              text: 'Watch out for the uneven floor near the back door.',
              language: 'en',
              provider: 'openai',
              model: 'whisper-1',
              errorCode: null,
              extractionStatus: 'ready',
              extractionErrorCode: null,
            },
            candidateFacts: [
              {
                id: 'fact-inspect-002',
                factType: 'watch_out',
                status: 'draft',
                summary: 'Uneven floor near back door',
                materialName: null,
                quantity: null,
                unit: null,
                supplierName: null,
                deliveryTiming: null,
                locationOrUse: 'near back door',
                confidenceLabel: 'medium',
                uncertaintyFlags: [],
                reviewState: 'waiting',
                reviewDecisionIds: [],
                memoryItemIds: [],
              },
            ],
          },
        ],
      },
      {
        localDate: '2026-06-10',
        notes: [
          {
            id: 'note-inspect-003',
            clientNoteId: 'client-note-003',
            capturedAt: '2026-06-10T14:00:00.000Z',
            uploadedAt: '2026-06-10T14:00:12.000Z',
            serverStatus: 'transcribed',
            mimeType: 'audio/webm;codecs=opus',
            durationMs: 5000,
            sizeBytes: 65000,
            audioStored: false,
            transcript: {
              id: 'trans-inspect-003',
              status: 'failed',
              text: null,
              language: null,
              provider: 'openai',
              model: 'whisper-1',
              errorCode: 'TRANSCRIPTION_FAILED',
              extractionStatus: null,
              extractionErrorCode: null,
            },
            candidateFacts: [],
          },
        ],
      },
    ],
    queue: {
      sections: [
        {
          key: 'watch_outs',
          label: 'Watch outs',
          items: [
            {
              id: 'queue-item-inspect-001',
              kind: 'single',
              status: 'draft',
              reviewLabel: 'Watch out',
              summary: 'Uneven floor near back door',
            },
          ],
        },
      ],
    },
    reviewDecisions: [
      {
        id: 'decision-001',
        action: 'queue_confirm',
        candidateFactId: null,
        sourceCandidateFactIds: ['fact-inspect-001'],
        sectionKey: null,
        reason: null,
        createdAt: '2026-06-11T09:25:00.000Z',
      },
    ],
    memoryItems: [
      {
        id: 'memory-001',
        memoryType: 'ordered_material',
        summary: 'Ordered 12 sheets of plasterboard from Jewson',
        sourceCandidateFactId: 'fact-inspect-001',
        reviewDecisionId: 'decision-001',
        createdAt: '2026-06-11T09:25:00.000Z',
      },
    ],
    possibleMisses: [],
  }
}

// GET /api/jobs/:jobId/memory-view — trusted memory for the job, grouped by section.
export async function getMemoryView(jobId: string): Promise<MemoryViewResponse> {
  if (USE_MOCK) {
    await delay(500)
    return MOCK_MEMORY_VIEW(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-view`)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`GET memory-view → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewResponse>
}

function MOCK_MEMORY_VIEW(jobId: string): MemoryViewResponse {
  const job = MOCK_JOBS.find(j => j.id === jobId) ?? MOCK_JOBS[0]
  return {
    job,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        key: 'ordered_materials',
        label: 'Ordered materials',
        items: [
          {
            id: 'mem-view-001',
            memoryType: 'ordered_material',
            summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
            materialName: 'hardcore',
            quantity: '8',
            unit: 'bags',
            supplierName: 'Jewson',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: '5',
            costCurrency: 'GBP',
            costQualifier: 'each' as const,
            totalCostAmount: '40',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-001',
            reviewDecisionId: 'decision-001',
            createdAt: '2026-06-13T09:25:00.000Z',
            updatedAt: '2026-06-13T09:25:00.000Z',
            source: {
              candidateFactId: 'fact-001',
              noteId: 'note-001',
              transcriptId: 'trans-001',
              capturedAt: '2026-06-13T09:15:00.000Z',
              transcriptText: 'Bought 8 bags of hardcore from Jewson, five pounds each.',
            },
          },
        ],
      },
      {
        key: 'used_materials',
        label: 'Used materials',
        items: [
          {
            id: 'mem-view-002',
            memoryType: 'used_material',
            summary: 'Used OSB boards on the back wall',
            materialName: 'OSB',
            quantity: null,
            unit: null,
            supplierName: null,
            deliveryTiming: null,
            locationOrUse: 'back wall',
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-002',
            reviewDecisionId: 'decision-002',
            createdAt: '2026-06-13T10:00:00.000Z',
            updatedAt: '2026-06-13T10:00:00.000Z',
            source: null,
          },
        ],
      },
      { key: 'leftovers', label: 'Leftovers', items: [] },
      { key: 'supplier_delivery_notes', label: 'Supplier delivery notes', items: [] },
      { key: 'customer_changes', label: 'Customer changes', items: [] },
      {
        key: 'watch_outs',
        label: 'Watch outs',
        items: [
          {
            id: 'mem-view-003',
            memoryType: 'watch_out',
            summary: 'Uneven floor near back door',
            materialName: null,
            quantity: null,
            unit: null,
            supplierName: null,
            deliveryTiming: null,
            locationOrUse: 'near back door',
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-003',
            reviewDecisionId: 'decision-003',
            createdAt: '2026-06-13T11:00:00.000Z',
            updatedAt: '2026-06-13T11:00:00.000Z',
            source: {
              candidateFactId: 'fact-003',
              noteId: 'note-002',
              transcriptId: 'trans-002',
              capturedAt: '2026-06-13T10:50:00.000Z',
              transcriptText: 'Watch out for the uneven floor near the back door, nearly tripped earlier.',
            },
          },
        ],
      },
    ],
    stillToCheck: {
      count: 2,
      items: [
        {
          id: 'queue-item-stc-001',
          sectionKey: 'unclear_items',
          summary: 'Something about extra cable in the workshop',
          kind: 'unclear_prompt',
          timeLabel: 'Today',
        },
      ],
    },
  }
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
