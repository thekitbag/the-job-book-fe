export type LocalNoteState =
  | 'saved_local'
  | 'uploading'
  | 'uploaded'
  | 'upload_failed'
  | 'upload_needs_attention'

export type TranscriptStatus = 'waiting' | 'transcribing' | 'ready' | 'failed'
export type ExtractionStatus = 'waiting' | 'extracting' | 'ready' | 'failed'

export interface LocalNote {
  clientNoteId: string
  jobId: string
  capturedAt: string
  durationMs: number
  mimeType: string
  blob: Blob
  sizeBytes: number
  localState: LocalNoteState
  uploadAttemptCount: number
  lastUploadAttemptAt: string | null
  serverNoteId: string | null
  lastErrorCode: string | null
  transcriptStatus: TranscriptStatus | null
  transcriptText: string | null
  transcriptErrorCode: string | null
  extractionStatus: ExtractionStatus | null
}

export interface Job {
  id: string
  title: string
  roughLocationOrLabel: string
  status: 'active' | 'completed' | 'archived'
}

export type FactType =
  | 'ordered_material'
  | 'used_material'
  | 'leftover_material'
  | 'supplier_delivery_note'
  | 'customer_change'
  | 'watch_out'
  | 'unclear'

export type ConfidenceLabel = 'high' | 'medium' | 'low'

// ── Review types (Story 7) ───────────────────────────────────────────────────

export type ReviewDecisionAction = 'confirm' | 'correct' | 'reject' | 'confirm_section' | 'add_missing'

export interface CorrectionFields {
  summary?: string
  materialName?: string | null
  quantity?: string | null
  unit?: string | null
  supplierName?: string | null
  deliveryTiming?: string | null
  locationOrUse?: string | null
}

export interface ReviewDecision {
  action: ReviewDecisionAction
  candidateFactId?: string
  sectionKey?: string
  candidateFactIds?: string[]
  corrected?: CorrectionFields
  memoryType?: FactType
  memory?: CorrectionFields
}

export interface ReviewDecisionResponse {
  confirmed?: Array<{ candidateFactId: string; memoryItemId: string }>
  skipped?: Array<{ candidateFactId: string; reason: string }>
}

export interface ReviewDraftItem {
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
  sourceTranscript: string | null
  sourceNoteIds: string[]
}

export interface ReviewDraftSection {
  key: string
  label: string
  items: ReviewDraftItem[]
}

// ── Review queue types ────────────────────────────────────────────────────────

// Trusted memory must be a concrete type — unclear items must be corrected or dismissed.
export type MemoryType = Exclude<FactType, 'unclear'>

export interface ProposedMemory {
  memoryType: MemoryType
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
}

export type QueueItemKind = 'single' | 'duplicate_group' | 'contradiction' | 'unclear_prompt'
export type QueueItemStatus = 'draft' | 'confirmed' | 'corrected' | 'dismissed'

export interface QueueSourceContext {
  candidateFactId: string
  noteId: string
  transcriptId: string
  capturedAt: string
  transcriptText: string | null
}

export interface QueueItem {
  id: string
  kind: QueueItemKind
  status: QueueItemStatus
  reviewLabel: string
  timeLabel?: string
  summary: string
  proposedMemory: ProposedMemory
  confidenceLabel: ConfidenceLabel
  uncertaintyFlags: string[]
  sourceCandidateFactIds: string[]
  sourceContext: QueueSourceContext[]
}

export interface QueueSection {
  key: string
  label: string
  items: QueueItem[]
}

export interface AlreadyRememberedItem {
  memoryItemId: string
  summary: string
  memoryType: MemoryType
  timeLabel?: string
}

export interface ReviewQueue {
  jobId: string
  generatedAt: string
  sections: QueueSection[]
  alreadyRemembered: AlreadyRememberedItem[]
}

export type QueueDecisionAction = 'confirm' | 'correct' | 'dismiss'

export interface QueueDecision {
  queueItemId: string
  action: QueueDecisionAction
  corrected?: ProposedMemory
  reason?: string
}

export interface QueueDecisionResponse {
  queueItemId: string
  action: QueueDecisionAction
  status: QueueItemStatus
  memoryItemId?: string
  sourceCandidateFactIds: string[]
}

export interface CandidateFact {
  id: string
  jobId: string
  sourceNoteIds: string[]
  sourceTranscriptIds: string[]
  factType: FactType
  status: 'draft' | 'confirmed' | 'corrected' | 'rejected' | 'superseded' | 'unclear'
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  confidenceLabel: ConfidenceLabel
  confidenceReason: string | null
  uncertaintyFlags: string[]
  createdAt: string
  updatedAt: string
}
