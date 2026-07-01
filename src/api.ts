import type { AlreadyRememberedItem, BudgetCategory, BudgetSummaryResponse, CandidateFact, ConfidenceLabel, CreateBudgetCategoryRequest, ExtractionStatus, FactType, InspectionData, Job, JobType, LocalNote, MemoryItemEdit, MemoryType, MemoryViewItem, MemoryViewResponse, MemoryViewSection, PatchBudgetCategoryRequest, QueueDecision, QueueDecisionResponse, QueueItem, ReviewDecision, ReviewDecisionResponse, ReviewDraftSection, ReviewQueue, TranscriptStatus } from './types'
import { deriveBudgetSummary, deriveCostSummary, deriveLabourSummary, deriveTotalKnownCost, MEMORY_TYPE_TO_SECTION_KEY, SECTION_FULL_LABELS, SECTION_ORDER, suggestBudgetCategory } from './memoryScan'

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
  {
    id: 'queue-item-mock-003',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'Watch out',
    timeLabel: 'Today',
    summary: 'Watch out — uneven floor near back door',
    proposedMemory: {
      memoryType: 'watch_out' as MemoryType,
      summary: 'Watch out — uneven floor near back door',
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
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-004'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-004',
        noteId: 'mock-note-003',
        transcriptId: 'mock-trans-003',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Mind the uneven floor by the back door.',
      },
    ],
  },
  // Bought/ordered draft whose material exactly matches a seeded category
  // ('timber') → a material-name category suggestion during review.
  {
    id: 'queue-item-mock-004',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Ordered 6 lengths of timber from Travis Perkins at £20 each',
    proposedMemory: {
      memoryType: 'ordered_material' as MemoryType,
      summary: 'Ordered 6 lengths of timber from Travis Perkins at £20 each',
      materialName: 'timber',
      quantity: '6',
      unit: 'lengths',
      supplierName: 'Travis Perkins',
      deliveryTiming: null,
      locationOrUse: null,
      costAmount: '20',
      costCurrency: 'GBP',
      costQualifier: 'each',
      totalCostAmount: null,
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-005'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-005',
        noteId: 'mock-note-004',
        transcriptId: 'mock-trans-004',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Got six lengths of timber from Travis Perkins, twenty quid each.',
      },
    ],
  },
  // Labour draft — hours only, no cost (can be remembered without a cost).
  {
    id: 'queue-item-mock-005',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Spent 6 hours fitting the cladding',
    proposedMemory: {
      memoryType: 'labour' as MemoryType,
      summary: 'Spent 6 hours fitting the cladding',
      materialName: null, quantity: null, unit: null, supplierName: null,
      deliveryTiming: null, locationOrUse: null,
      costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
      labourHours: '6', labourPerson: null, labourTask: 'fitting cladding',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-006'],
    sourceContext: [
      { candidateFactId: 'mock-fact-006', noteId: 'mock-note-005', transcriptId: 'mock-trans-005', capturedAt: new Date().toISOString(), transcriptText: 'Spent about six hours fitting the cladding today.' },
    ],
  },
  // Labour draft — rated (hours × £/hour). Suggests the active 'labour' category.
  {
    id: 'queue-item-mock-006',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Tom did 8 hours on electrics at £35 an hour',
    proposedMemory: {
      memoryType: 'labour' as MemoryType,
      summary: 'Tom did 8 hours on electrics at £35 an hour',
      materialName: null, quantity: null, unit: null, supplierName: null,
      deliveryTiming: null, locationOrUse: null,
      costAmount: '35', costCurrency: 'GBP', costQualifier: 'per_hour', totalCostAmount: '280',
      labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-007'],
    sourceContext: [
      { candidateFactId: 'mock-fact-007', noteId: 'mock-note-006', transcriptId: 'mock-trans-006', capturedAt: new Date().toISOString(), transcriptText: 'Tom did eight hours on the electrics at thirty-five an hour.' },
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
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    totalCostAmount: null,
    uncertaintyFlags: [],
    // A remembered item that already carries a category (set in the seed job).
    budgetCategoryId: 'cat-cladding',
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
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    totalCostAmount: null,
    uncertaintyFlags: [],
  },
]

// GET /api/jobs/:jobId/review-queue — all unresolved draft items for the job.
export async function getReviewQueue(jobId: string): Promise<ReviewQueue> {
  if (USE_MOCK) {
    await delay(500)
    const budgetCategories = mockBudgetCategoriesFor(jobId).filter(c => !c.isArchived)
    // Compute a response-time category suggestion for bought/ordered + labour drafts.
    const enrich = (item: QueueItem): QueueItem => {
      const t = item.proposedMemory.memoryType
      if (t !== 'ordered_material' && t !== 'labour') return item
      const suggestion = suggestBudgetCategory(item.proposedMemory, budgetCategories)
      return {
        ...item,
        proposedMemory: {
          ...item.proposedMemory,
          budgetCategoryId: suggestion?.budgetCategoryId ?? null,
          budgetCategorySuggestion: suggestion,
        },
      }
    }
    return {
      jobId,
      generatedAt: new Date().toISOString(),
      budgetCategories,
      sections: [
        { key: 'ordered_materials', label: 'Ordered materials', items: [enrich(MOCK_QUEUE_ITEMS[0]), enrich(MOCK_QUEUE_ITEMS[3])] },
        { key: 'labour', label: 'Labour', items: [enrich(MOCK_QUEUE_ITEMS[4]), enrich(MOCK_QUEUE_ITEMS[5])] },
        { key: 'used_materials', label: 'Used materials', items: [MOCK_QUEUE_ITEMS[1]] },
        { key: 'leftovers', label: 'Leftovers', items: [] },
        { key: 'watch_outs', label: 'Watch outs', items: [MOCK_QUEUE_ITEMS[2]] },
      ],
      alreadyRemembered: MOCK_REMEMBERED.map(m => ({ ...m })),
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
    return mockSubmitQueueDecision(jobId, decision)
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
    return mockMemoryView(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-view`)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`GET memory-view → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewResponse>
}

// PATCH /api/jobs/:jobId/memory-items/:memoryItemId — correct trusted memory in
// place. Returns the updated normalized memory item (memory-view item shape).
// Never creates a queue item, draft fact, or review decision.
export async function updateMemoryItem(
  jobId: string,
  memoryItemId: string,
  edit: MemoryItemEdit,
): Promise<MemoryViewItem> {
  if (USE_MOCK) {
    await delay(300)
    return mockUpdateMemoryItem(jobId, memoryItemId, edit)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edit),
  })
  if (res.status === 400) throw new ApiError('Invalid memory edit', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok) throw new ApiError(`PATCH memory-item → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewItem>
}

// POST /api/jobs/:jobId/memory-items/:memoryItemId/verify — mark a Worth-checking
// item as right: clears unresolvedFlags without touching structured fields or
// source candidate facts. Returns the normalized memory item.
export async function verifyMemoryItem(
  jobId: string,
  memoryItemId: string,
): Promise<{ uncertaintyFlags: string[] }> {
  if (USE_MOCK) {
    await delay(250)
    mockVerifyMemoryItem(jobId, memoryItemId)
    return { uncertaintyFlags: [] }
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}/verify`, {
    method: 'POST',
  })
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok) throw new ApiError(`POST verify memory-item → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewItem>
}

// ── Budget categories & summary ─────────────────────────────────────────────

// GET /api/jobs/:jobId/budget-categories — active categories only.
export async function getBudgetCategories(jobId: string): Promise<BudgetCategory[]> {
  if (USE_MOCK) {
    await delay(200)
    return mockBudgetCategoriesFor(jobId).filter(c => !c.isArchived).map(c => ({ ...c }))
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-categories`)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`GET budget-categories → ${res.status}`, res.status)
  return res.json() as Promise<BudgetCategory[]>
}

// POST /api/jobs/:jobId/budget-categories — create a category.
export async function createBudgetCategory(jobId: string, req: CreateBudgetCategoryRequest): Promise<BudgetCategory> {
  if (USE_MOCK) {
    await delay(250)
    return mockCreateBudgetCategory(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (res.status === 400) throw new ApiError('Invalid category', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`POST budget-category → ${res.status}`, res.status)
  return res.json() as Promise<BudgetCategory>
}

// PATCH /api/jobs/:jobId/budget-categories/:categoryId — edit or archive.
export async function patchBudgetCategory(jobId: string, categoryId: string, req: PatchBudgetCategoryRequest): Promise<BudgetCategory> {
  if (USE_MOCK) {
    await delay(250)
    return mockPatchBudgetCategory(jobId, categoryId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-categories/${categoryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (res.status === 400) throw new ApiError('Invalid category', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Category not found', 404)
  if (!res.ok) throw new ApiError(`PATCH budget-category → ${res.status}`, res.status)
  return res.json() as Promise<BudgetCategory>
}

// GET /api/jobs/:jobId/budget-summary — backend-authoritative spend by category.
export async function getBudgetSummary(jobId: string): Promise<BudgetSummaryResponse> {
  if (USE_MOCK) {
    await delay(400)
    return mockBudgetSummary(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-summary`)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`GET budget-summary → ${res.status}`, res.status)
  return res.json() as Promise<BudgetSummaryResponse>
}

// PATCH /api/jobs/:jobId/memory-items/:memoryItemId — assign/clear category only.
export async function assignMemoryItemCategory(
  jobId: string,
  memoryItemId: string,
  budgetCategoryId: string | null,
): Promise<MemoryViewItem> {
  if (USE_MOCK) {
    await delay(250)
    return mockAssignMemoryItemCategory(jobId, memoryItemId, budgetCategoryId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budgetCategoryId }),
  })
  if (res.status === 400) throw new ApiError('Invalid category assignment', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok) throw new ApiError(`PATCH memory-item category → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewItem>
}

// Canonical seed for the stateful mock memory-view. The bought/ordered section
// deliberately spans the five Known-spend cases the pilot fix must distinguish:
//  - hardcore: an included cost item (£40)
//  - plasterboard ×2: a trusted money-total row, consolidated to £1200
//  - timber: a no-cost item (No cost remembered)
//  - insulation: an approximate, untrusted cost (Cost worth checking)
//  - membrane ×2: a consolidated quantity row with no trusted cost
function buildMockSections(): MemoryViewSection[] {
  return [
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
          // Two plasterboard rows in the same unit → safe like-for-like total (24 sheets)
          {
            id: 'mem-view-004',
            memoryType: 'ordered_material',
            summary: 'Ordered 12 sheets of plasterboard from Jewson',
            materialName: 'plasterboard',
            quantity: '12',
            unit: 'sheets',
            supplierName: 'Jewson',
            deliveryTiming: 'Tuesday',
            locationOrUse: null,
            costAmount: '50',
            costCurrency: 'GBP',
            costQualifier: 'each' as const,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-004',
            reviewDecisionId: 'decision-004',
            createdAt: '2026-06-13T09:30:00.000Z',
            updatedAt: '2026-06-13T09:30:00.000Z',
            source: null,
          },
          {
            id: 'mem-view-005',
            memoryType: 'ordered_material',
            summary: 'Ordered 12 more sheets of plasterboard',
            materialName: 'plasterboard',
            quantity: '12',
            unit: 'sheets',
            supplierName: 'Jewson',
            deliveryTiming: 'Thursday',
            locationOrUse: null,
            costAmount: '50',
            costCurrency: 'GBP',
            costQualifier: 'each' as const,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-005',
            reviewDecisionId: 'decision-005',
            createdAt: '2026-06-13T09:35:00.000Z',
            updatedAt: '2026-06-13T09:35:00.000Z',
            source: null,
          },
          // Different unit (lengths) → must stay separate from the sheets total
          {
            id: 'mem-view-006',
            memoryType: 'ordered_material',
            summary: 'Ordered 6 lengths of timber',
            materialName: 'timber',
            quantity: '6',
            unit: 'lengths',
            supplierName: 'Travis Perkins',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: null,
            // Genuinely currency-null: adding a cost must default the currency to
            // GBP so the line can count towards Known spend.
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-006',
            reviewDecisionId: 'decision-006',
            createdAt: '2026-06-13T09:40:00.000Z',
            updatedAt: '2026-06-13T09:40:00.000Z',
            source: null,
          },
          // Has a remembered cost, but only as an approximate basis → not safe to
          // total, so it is excluded as "Cost worth checking". No uncertaintyFlags,
          // so it does NOT appear in the scan "Worth checking" roll-up.
          {
            id: 'mem-view-009',
            memoryType: 'ordered_material',
            summary: 'Ordered 4 packs of insulation, roughly £120',
            materialName: 'insulation',
            quantity: '4',
            unit: 'packs',
            supplierName: 'Jewson',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: '120',
            costCurrency: 'GBP',
            costQualifier: 'approx' as const,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-009',
            reviewDecisionId: 'decision-009',
            createdAt: '2026-06-13T09:42:00.000Z',
            updatedAt: '2026-06-13T09:42:00.000Z',
            source: null,
          },
          // Two like-for-like membrane rows with no cost → consolidate to a single
          // quantity row (10 rolls total) that carries no money, and both are
          // excluded from Known spend as "No cost remembered".
          {
            id: 'mem-view-010',
            memoryType: 'ordered_material',
            summary: 'Ordered 5 rolls of DPM membrane',
            materialName: 'membrane',
            quantity: '5',
            unit: 'rolls',
            supplierName: 'Travis Perkins',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: null,
            costCurrency: 'GBP',
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-010',
            reviewDecisionId: 'decision-010',
            createdAt: '2026-06-13T09:44:00.000Z',
            updatedAt: '2026-06-13T09:44:00.000Z',
            source: null,
          },
          {
            id: 'mem-view-011',
            memoryType: 'ordered_material',
            summary: 'Ordered 5 more rolls of DPM membrane',
            materialName: 'membrane',
            quantity: '5',
            unit: 'rolls',
            supplierName: 'Travis Perkins',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: null,
            costCurrency: 'GBP',
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-011',
            reviewDecisionId: 'decision-011',
            createdAt: '2026-06-13T09:45:00.000Z',
            updatedAt: '2026-06-13T09:45:00.000Z',
            source: null,
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
      {
        key: 'labour',
        label: 'Labour',
        items: [
          // Hours-only labour: remembered, but no monetary cost → not counted.
          {
            id: 'mem-labour-1',
            memoryType: 'labour',
            summary: 'Spent 6 hours fitting the cladding',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
            labourHours: '6', labourPerson: null, labourTask: 'fitting cladding',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l1', reviewDecisionId: 'decision-l1',
            createdAt: '2026-06-13T11:10:00.000Z', updatedAt: '2026-06-13T11:10:00.000Z',
            source: {
              candidateFactId: 'fact-l1', noteId: 'note-l1', transcriptId: 'trans-l1',
              capturedAt: '2026-06-13T11:05:00.000Z',
              transcriptText: 'Spent about six hours fitting the cladding today.',
            },
          },
          // Rated labour: hours × per-hour rate → safe £280 (assigned to a category).
          {
            id: 'mem-labour-2',
            memoryType: 'labour',
            summary: 'Tom did 8 hours on electrics at £35 an hour',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: '35', costCurrency: 'GBP', costQualifier: 'per_hour', totalCostAmount: '280',
            labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l2', reviewDecisionId: 'decision-l2',
            createdAt: '2026-06-13T11:15:00.000Z', updatedAt: '2026-06-13T11:15:00.000Z',
            source: null,
          },
          // Explicit labour total → safe £600.
          {
            id: 'mem-labour-3',
            memoryType: 'labour',
            summary: 'Labour on the roof came to £600',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: '600', costCurrency: 'GBP', costQualifier: 'total', totalCostAmount: '600',
            labourHours: null, labourPerson: null, labourTask: 'roof',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l3', reviewDecisionId: 'decision-l3',
            createdAt: '2026-06-13T11:20:00.000Z', updatedAt: '2026-06-13T11:20:00.000Z',
            source: null,
          },
        ],
      },
      {
        key: 'leftovers',
        label: 'Leftovers',
        items: [
          // Leftover with uncertainty → never consolidated, surfaced in Worth checking
          {
            id: 'mem-view-007',
            memoryType: 'leftover_material',
            summary: 'Roughly half a bag of sand left over',
            materialName: 'sand',
            quantity: 'about half',
            unit: 'bag',
            supplierName: null,
            deliveryTiming: null,
            locationOrUse: 'in the van',
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: ['approximate_quantity'],
            sourceCandidateFactId: 'fact-007',
            reviewDecisionId: 'decision-007',
            createdAt: '2026-06-13T10:30:00.000Z',
            updatedAt: '2026-06-13T10:30:00.000Z',
            source: null,
          },
        ],
      },
      {
        key: 'supplier_delivery_notes',
        label: 'Supplier delivery notes',
        items: [
          {
            id: 'mem-view-008',
            memoryType: 'supplier_delivery_note',
            summary: 'Jewson said the next delivery slips to Friday',
            materialName: null,
            quantity: null,
            unit: null,
            supplierName: 'Jewson',
            deliveryTiming: 'Friday',
            locationOrUse: null,
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-008',
            reviewDecisionId: 'decision-008',
            createdAt: '2026-06-13T10:45:00.000Z',
            updatedAt: '2026-06-13T10:45:00.000Z',
            source: null,
          },
        ],
      },
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
    ]
}

// Per-job mutable memory state so a post-edit refetch reflects the edit, the way
// a real backend would. Module-level, so it resets on every full page load
// (each Playwright test starts with page.goto) — no cross-test leakage.
let mockMemoryByJob: Map<string, MemoryViewSection[]> | null = null

// Rebase the fixture's fixed dates onto the current day so the workspace
// Overview renders meaningfully: labour is dated today (so "Labour today" has
// hours), everything else is spread over the last week (so "Latest on this job"
// shows varied ages). Cost amounts/qualifiers/flags are untouched, so the
// known-spend cases the fixture encodes still hold.
function rebaseMockDates(sections: MemoryViewSection[]): void {
  const dayMs = 86_400_000
  const now = Date.now()
  let nonLabourIdx = 0
  for (const s of sections) {
    for (const item of s.items) {
      const daysAgo = item.memoryType === 'labour' ? 0 : (nonLabourIdx++ % 7)
      // Small per-item offset keeps same-day items in a stable newest-first order.
      const iso = new Date(now - daysAgo * dayMs - item.id.length * 60_000).toISOString()
      item.createdAt = iso
      item.updatedAt = iso
      if (item.source) item.source = { ...item.source, capturedAt: iso }
    }
  }
}

function mockSectionsFor(jobId: string): MemoryViewSection[] {
  if (!mockMemoryByJob) mockMemoryByJob = new Map()
  if (!mockMemoryByJob.has(jobId)) {
    const sections = buildMockSections()
    rebaseMockDates(sections)
    mockMemoryByJob.set(jobId, sections)
  }
  return mockMemoryByJob.get(jobId)!
}

// Test seam: drop any accumulated mock edits.
export function _resetMockMemoryForTesting(): void {
  mockMemoryByJob = null
  mockBudgetByJob = null
}

function findMockItem(sections: MemoryViewSection[], id: string): MemoryViewItem | undefined {
  for (const s of sections) {
    const found = s.items.find(it => it.id === id)
    if (found) return found
  }
  return undefined
}

function mockMemoryView(jobId: string): MemoryViewResponse {
  const job = MOCK_JOBS.find(j => j.id === jobId) ?? MOCK_JOBS[0]
  const sections = mockSectionsFor(jobId)
  return {
    job,
    generatedAt: new Date().toISOString(),
    // Deep-ish copy so callers cannot mutate the stored fixture in place.
    sections: sections.map(s => ({ ...s, items: s.items.map(it => ({ ...it })) })),
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
    // Authoritative known spend, derived from current state so an edit changes it.
    costSummary: {
      orderedMaterials: deriveCostSummary(sections),
      labour: deriveLabourSummary(sections),
      totalKnownCost: deriveTotalKnownCost(sections),
    },
  }
}

function mockUpdateMemoryItem(jobId: string, memoryItemId: string, edit: MemoryItemEdit): MemoryViewItem {
  const sections = mockSectionsFor(jobId)
  const existing = findMockItem(sections, memoryItemId)
  const now = new Date().toISOString()
  const updated: MemoryViewItem = {
    id: memoryItemId,
    memoryType: edit.memoryType,
    summary: edit.summary ?? existing?.summary ?? '',
    materialName: edit.materialName,
    quantity: edit.quantity,
    unit: edit.unit,
    supplierName: edit.supplierName,
    deliveryTiming: edit.deliveryTiming,
    locationOrUse: edit.locationOrUse,
    costAmount: edit.costAmount,
    costCurrency: edit.costCurrency,
    costQualifier: edit.costQualifier,
    totalCostAmount: edit.totalCostAmount,
    // Labour fields only meaningful for labour; cleared otherwise.
    labourHours: edit.memoryType === 'labour' ? (edit.labourHours ?? null) : null,
    labourPerson: edit.memoryType === 'labour' ? (edit.labourPerson ?? null) : null,
    labourTask: edit.memoryType === 'labour' ? (edit.labourTask ?? null) : null,
    // A Fix-memory save also resolves any worth-checking flags.
    uncertaintyFlags: [],
    // Preserve the existing category unless this edit explicitly changes it.
    budgetCategoryId: edit.budgetCategoryId !== undefined ? edit.budgetCategoryId : (existing?.budgetCategoryId ?? null),
    sourceCandidateFactId: existing?.sourceCandidateFactId ?? null,
    reviewDecisionId: existing?.reviewDecisionId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    source: existing?.source ?? null,
  }
  // Remove from its current section, then re-home by the (possibly new) type.
  for (const s of sections) s.items = s.items.filter(it => it.id !== memoryItemId)
  const targetKey = MEMORY_TYPE_TO_SECTION_KEY[updated.memoryType] ?? updated.memoryType
  let target = sections.find(s => s.key === targetKey)
  if (!target) {
    target = { key: targetKey, label: SECTION_FULL_LABELS[targetKey] ?? targetKey, items: [] }
    sections.push(target)
    sections.sort((a, b) =>
      ((SECTION_ORDER.indexOf(a.key) + 1) || 99) - ((SECTION_ORDER.indexOf(b.key) + 1) || 99))
  }
  target.items.unshift(updated)
  return { ...updated }
}

function mockVerifyMemoryItem(jobId: string, memoryItemId: string): void {
  const item = findMockItem(mockSectionsFor(jobId), memoryItemId)
  if (item) item.uncertaintyFlags = []
}

// ── Stateful mock: budget categories ────────────────────────────────────────
// Resets on every full page load (module re-init), so Playwright tests that
// start with page.goto get a clean fixture with no cross-test leakage.

const MOCK_BUDGET_SEED_JOB = 'job-pilot-garden-room-001'
let mockBudgetByJob: Map<string, BudgetCategory[]> | null = null
let mockCategorySeq = 0

function mockBudgetCategoriesFor(jobId: string): BudgetCategory[] {
  if (!mockBudgetByJob) mockBudgetByJob = new Map()
  if (!mockBudgetByJob.has(jobId)) {
    const now = '2026-06-28T08:00:00.000Z'
    if (jobId === MOCK_BUDGET_SEED_JOB) {
      // timber (budget, no spend), cladding (budget + spend), electrics (no
      // budget), labour (budget + labour spend).
      mockBudgetByJob.set(jobId, [
        { id: 'cat-timber', jobId, name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: now, updatedAt: now },
        { id: 'cat-cladding', jobId, name: 'cladding', budgetAmount: '2000', budgetCurrency: 'GBP', sortOrder: 1, isArchived: false, createdAt: now, updatedAt: now },
        { id: 'cat-electrics', jobId, name: 'electrics', budgetAmount: null, budgetCurrency: null, sortOrder: 2, isArchived: false, createdAt: now, updatedAt: now },
        { id: 'cat-labour', jobId, name: 'labour', budgetAmount: '1500', budgetCurrency: 'GBP', sortOrder: 3, isArchived: false, createdAt: now, updatedAt: now },
      ])
      // Seed safe assigned items: plasterboard (£1200) → cladding, and the rated
      // labour (Tom, £280) → labour. Leaves hardcore (£40) and the £600 roof
      // labour safe-but-uncategorised, and the rest excluded.
      const sections = mockSectionsFor(jobId)
      for (const s of sections) for (const it of s.items) {
        if (it.id === 'mem-view-004' || it.id === 'mem-view-005') it.budgetCategoryId = 'cat-cladding'
        if (it.id === 'mem-labour-2') it.budgetCategoryId = 'cat-labour'
      }
    } else {
      mockBudgetByJob.set(jobId, []) // a job with no budget categories
    }
  }
  return mockBudgetByJob.get(jobId)!
}

function mockCreateBudgetCategory(jobId: string, req: CreateBudgetCategoryRequest): BudgetCategory {
  const cats = mockBudgetCategoriesFor(jobId)
  const name = (req.name ?? '').trim()
  if (!name) throw new ApiError('Category name is required', 400)
  const now = new Date().toISOString()
  const hasBudget = req.budgetAmount != null && req.budgetAmount !== ''
  const created: BudgetCategory = {
    id: `cat-new-${++mockCategorySeq}`,
    jobId,
    name,
    budgetAmount: hasBudget ? req.budgetAmount! : null,
    budgetCurrency: hasBudget ? (req.budgetCurrency ?? 'GBP') : null,
    sortOrder: req.sortOrder ?? cats.length,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  }
  cats.push(created)
  return { ...created }
}

function mockPatchBudgetCategory(jobId: string, categoryId: string, req: PatchBudgetCategoryRequest): BudgetCategory {
  const cats = mockBudgetCategoriesFor(jobId)
  const cat = cats.find(c => c.id === categoryId)
  if (!cat) throw new ApiError('Category not found', 404)
  if (req.name !== undefined) {
    const name = req.name.trim()
    if (!name) throw new ApiError('Category name is required', 400)
    cat.name = name
  }
  if (req.budgetAmount !== undefined) {
    const hasBudget = req.budgetAmount != null && req.budgetAmount !== ''
    cat.budgetAmount = hasBudget ? req.budgetAmount : null
    cat.budgetCurrency = hasBudget ? (req.budgetCurrency ?? cat.budgetCurrency ?? 'GBP') : null
  }
  if (req.sortOrder !== undefined) cat.sortOrder = req.sortOrder
  if (req.isArchived) {
    cat.isArchived = true
    // Archiving clears existing assignments so the spend moves to Uncategorised.
    const sections = mockSectionsFor(jobId)
    for (const s of sections) for (const it of s.items) {
      if (it.budgetCategoryId === categoryId) it.budgetCategoryId = null
    }
  }
  cat.updatedAt = new Date().toISOString()
  return { ...cat }
}

function mockBudgetSummary(jobId: string): BudgetSummaryResponse {
  return deriveBudgetSummary(jobId, mockSectionsFor(jobId), mockBudgetCategoriesFor(jobId))
}

function mockAssignMemoryItemCategory(jobId: string, memoryItemId: string, budgetCategoryId: string | null): MemoryViewItem {
  const item = findMockItem(mockSectionsFor(jobId), memoryItemId)
  if (!item) throw new ApiError('Memory item not found', 404)
  if (budgetCategoryId) {
    const cat = mockBudgetCategoriesFor(jobId).find(c => c.id === budgetCategoryId)
    if (!cat || cat.isArchived) throw new ApiError('Invalid category assignment', 400)
  }
  item.budgetCategoryId = budgetCategoryId
  item.updatedAt = new Date().toISOString()
  return { ...item }
}

// Confirming/correcting a review item creates trusted memory (like the backend),
// carrying the selected category, so Job memory / budget reflect it immediately.
function mockSubmitQueueDecision(jobId: string, decision: QueueDecision): QueueDecisionResponse {
  const statusMap = { confirm: 'confirmed', correct: 'corrected', dismiss: 'dismissed' } as const
  if (decision.action === 'dismiss') {
    return { queueItemId: decision.queueItemId, action: 'dismiss', status: 'dismissed', sourceCandidateFactIds: [] }
  }

  const source = decision.corrected
    ?? MOCK_QUEUE_ITEMS.find(i => i.id === decision.queueItemId)?.proposedMemory
  const memoryItemId = `mem-${decision.queueItemId}`
  if (source) {
    const now = new Date().toISOString()
    const isLabour = source.memoryType === 'labour'
    const canCategorise = source.memoryType === 'ordered_material' || isLabour
    const category = canCategorise ? (decision.budgetCategoryId ?? decision.corrected?.budgetCategoryId ?? null) : null
    const queueItem = MOCK_QUEUE_ITEMS.find(i => i.id === decision.queueItemId)
    const keepFlags = decision.uncertaintyResolution === 'still_unsure' ? (queueItem?.uncertaintyFlags ?? []) : []
    const item: MemoryViewItem = {
      id: memoryItemId,
      memoryType: source.memoryType,
      summary: source.summary,
      materialName: source.materialName,
      quantity: source.quantity,
      unit: source.unit,
      supplierName: source.supplierName,
      deliveryTiming: source.deliveryTiming,
      locationOrUse: source.locationOrUse,
      costAmount: source.costAmount,
      costCurrency: source.costCurrency,
      costQualifier: source.costQualifier,
      totalCostAmount: source.totalCostAmount,
      labourHours: isLabour ? (source.labourHours ?? null) : null,
      labourPerson: isLabour ? (source.labourPerson ?? null) : null,
      labourTask: isLabour ? (source.labourTask ?? null) : null,
      uncertaintyFlags: keepFlags,
      budgetCategoryId: category,
      sourceCandidateFactId: null,
      reviewDecisionId: null,
      createdAt: now,
      updatedAt: now,
      source: null,
    }
    const sections = mockSectionsFor(jobId)
    const targetKey = MEMORY_TYPE_TO_SECTION_KEY[item.memoryType] ?? item.memoryType
    let target = sections.find(s => s.key === targetKey)
    if (!target) {
      target = { key: targetKey, label: SECTION_FULL_LABELS[targetKey] ?? targetKey, items: [] }
      sections.push(target)
      sections.sort((a, b) =>
        ((SECTION_ORDER.indexOf(a.key) + 1) || 99) - ((SECTION_ORDER.indexOf(b.key) + 1) || 99))
    }
    // Replace any prior decision for the same queue item (idempotent re-confirm).
    for (const s of sections) s.items = s.items.filter(it => it.id !== memoryItemId)
    target.items.unshift(item)
  }

  return {
    queueItemId: decision.queueItemId,
    action: decision.action,
    status: statusMap[decision.action],
    memoryItemId,
    sourceCandidateFactIds: [],
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
