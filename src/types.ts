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

// ── Tidy-up types (Story 8) ──────────────────────────────────────────────────

export type TidyUpItemKind = 'single' | 'duplicate_group' | 'contradiction' | 'unclear_prompt'
export type TidyUpItemStatus = 'draft' | 'confirmed' | 'corrected' | 'rejected' | 'left_unconfirmed'

export interface TidyUpSourceContext {
  candidateFactId: string
  noteId: string
  transcriptId: string
  capturedAt: string
  transcriptText: string | null
}

export interface ProposedMemory {
  memoryType: FactType
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
}

export interface TidyUpItem {
  id: string
  kind: TidyUpItemKind
  status: TidyUpItemStatus
  reviewLabel: string
  summary: string
  proposedMemory: ProposedMemory
  confidenceLabel: ConfidenceLabel
  uncertaintyFlags: string[]
  sourceCandidateFactIds: string[]
  sourceContext: TidyUpSourceContext[]
}

export interface TidyUpSection {
  key: string
  label: string
  items: TidyUpItem[]
}

export interface AlreadyRememberedItem {
  memoryItemId: string
  summary: string
  memoryType: FactType
}

export interface TidyUpRun {
  id: string
  jobId: string
  localDate: string
  status: 'ready' | 'generating' | 'failed'
  createdAt?: string
  sections: TidyUpSection[]
  alreadyRemembered: AlreadyRememberedItem[]
}

export type TidyUpDecisionAction = 'confirm' | 'correct' | 'reject' | 'leave_unconfirmed'

export interface TidyUpDecision {
  tidyUpItemId: string
  action: TidyUpDecisionAction
  corrected?: ProposedMemory
  reason?: string
}

export interface TidyUpDecisionResponse {
  tidyUpItemId: string
  action: TidyUpDecisionAction
  status: TidyUpItemStatus
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
