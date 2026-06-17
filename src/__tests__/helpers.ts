import type { CandidateFact, LocalNote } from '../types'

let seq = 0

export function makeNote(overrides: Partial<LocalNote> = {}): LocalNote {
  const id = `note-${++seq}-${Math.random().toString(36).slice(2, 6)}`
  return {
    clientNoteId: id,
    jobId: 'job-test-001',
    capturedAt: new Date().toISOString(),
    durationMs: 10_000,
    mimeType: 'audio/webm;codecs=opus',
    blob: new Blob(['fake-audio'], { type: 'audio/webm' }),
    sizeBytes: 10,
    localState: 'saved_local',
    uploadAttemptCount: 0,
    lastUploadAttemptAt: null,
    serverNoteId: null,
    lastErrorCode: null,
    transcriptStatus: null,
    transcriptText: null,
    transcriptErrorCode: null,
    extractionStatus: null,
    ...overrides,
  }
}

let factSeq = 0

export function makeFact(overrides: Partial<CandidateFact> = {}): CandidateFact {
  const id = `fact-${++factSeq}`
  return {
    id,
    jobId: 'job-test-001',
    sourceNoteIds: ['srv-001'],
    sourceTranscriptIds: [],
    factType: 'used_material',
    status: 'draft',
    summary: 'Used 3 bags of cement',
    materialName: 'cement',
    quantity: '3',
    unit: 'bags',
    supplierName: null,
    deliveryTiming: null,
    locationOrUse: null,
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    totalCostAmount: null,
    confidenceLabel: 'high',
    confidenceReason: null,
    uncertaintyFlags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}
