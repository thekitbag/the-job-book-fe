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

export type JobType = 'garden_room' | 'extension' | 'other'

export interface Job {
  id: string
  title: string
  jobType: JobType | string
  status: 'active' | 'completed' | 'archived'
  roughLocationOrLabel: string | null
  createdAt: string
  updatedAt: string
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

export type CostQualifier = 'each' | 'total' | 'approx' | 'unknown'

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

// A deterministic, response-time category suggestion for a review item. Never
// stored on the candidate fact — computed from the job's active categories.
export type BudgetCategorySuggestionReason = 'material_name_match' | 'summary_match'
export interface BudgetCategorySuggestion {
  budgetCategoryId: string
  categoryName: string
  reason: BudgetCategorySuggestionReason
}

export interface ProposedMemory {
  memoryType: MemoryType
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  costAmount: string | null
  costCurrency: string | null
  costQualifier: CostQualifier | null
  totalCostAmount: string | null
  // Additive: the suggested/default category for this review item (not stored on
  // the candidate fact). null when there is no strong suggestion.
  budgetCategoryId?: string | null
  budgetCategorySuggestion?: BudgetCategorySuggestion | null
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
  materialName?: string | null
  quantity?: string | null
  unit?: string | null
  supplierName?: string | null
  deliveryTiming?: string | null
  locationOrUse?: string | null
  costAmount?: string | null
  costCurrency?: string | null
  costQualifier?: CostQualifier | null
  totalCostAmount?: string | null
  uncertaintyFlags?: string[]
  sourceUncertaintyFlags?: string[]
  // The confirmed category on this remembered item, if any.
  budgetCategoryId?: string | null
}

export interface ReviewQueue {
  jobId: string
  generatedAt: string
  // Active budget categories for the job (additive). Drives review-time category
  // selection; empty/absent → no category UI is shown during review.
  budgetCategories?: BudgetCategory[]
  sections: QueueSection[]
  alreadyRemembered: AlreadyRememberedItem[]
}

export type QueueDecisionAction = 'confirm' | 'correct' | 'dismiss'

// How a Worth-checking item's unresolved state is settled when it becomes /
// stays trusted memory. 'resolved' = Mike has dealt with it (clear the flag);
// 'still_unsure' = keep it flagged.
export type UncertaintyResolution = 'resolved' | 'still_unsure'

export interface QueueDecision {
  queueItemId: string
  action: QueueDecisionAction
  corrected?: ProposedMemory
  reason?: string
  uncertaintyResolution?: UncertaintyResolution
  // Selected category to carry into the created memory item (ordered_material
  // only). null = remember with no category; omitted = backwards-compatible.
  budgetCategoryId?: string | null
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
  costAmount: string | null
  costCurrency: string | null
  costQualifier: CostQualifier | null
  totalCostAmount: string | null
  confidenceLabel: ConfidenceLabel
  confidenceReason: string | null
  uncertaintyFlags: string[]
  createdAt: string
  updatedAt: string
}

// ── Pilot inspection types ────────────────────────────────────────────────────

export type InspectionReviewState = 'waiting' | 'confirmed' | 'edited' | 'dismissed'

export interface InspectionCandidateFact {
  id: string
  factType: FactType
  status: 'draft' | 'unclear' | 'confirmed' | 'corrected' | 'rejected' | 'superseded'
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  confidenceLabel: ConfidenceLabel
  uncertaintyFlags: string[]
  reviewState: InspectionReviewState | string
  reviewDecisionIds: string[]
  memoryItemIds: string[]
}

export interface InspectionTranscript {
  id: string
  status: 'waiting' | 'transcribing' | 'ready' | 'failed'
  text: string | null
  language: string | null
  provider: string | null
  model: string | null
  errorCode: string | null
  extractionStatus: 'waiting' | 'extracting' | 'ready' | 'failed' | null
  extractionErrorCode: string | null
}

export interface InspectionNote {
  id: string
  clientNoteId: string
  capturedAt: string
  uploadedAt: string | null
  serverStatus: string
  mimeType: string
  durationMs: number | null
  sizeBytes: number
  audioStored: boolean
  transcript: InspectionTranscript | null
  candidateFacts: InspectionCandidateFact[]
}

export interface InspectionNotesByDay {
  localDate: string
  notes: InspectionNote[]
}

export interface InspectionQueueItem {
  id: string
  kind: string
  status: string
  reviewLabel: string
  timeLabel?: string
  summary: string
}

export interface InspectionQueueSection {
  key: string
  label: string
  items: InspectionQueueItem[]
}

export interface InspectionReviewDecision {
  id: string
  action: string
  candidateFactId: string | null
  sourceCandidateFactIds: string[]
  sectionKey: string | null
  reason: string | null
  createdAt: string
}

export interface InspectionMemoryItem {
  id: string
  memoryType: string
  summary: string
  sourceCandidateFactId: string | null
  reviewDecisionId: string | null
  createdAt: string
}

export interface InspectionPossibleMiss {
  noteId: string
  reason: string
  transcriptExcerpt: string
}

export interface InspectionData {
  job: Job
  generatedAt: string
  notesByDay: InspectionNotesByDay[]
  queue: { sections: InspectionQueueSection[] }
  reviewDecisions: InspectionReviewDecision[]
  memoryItems: InspectionMemoryItem[]
  possibleMisses: InspectionPossibleMiss[]
}

// ── Job memory view types (Story 11) ──────────────────────────────────────────

export interface MemoryViewSource {
  candidateFactId: string
  noteId: string
  transcriptId: string
  capturedAt: string
  transcriptText: string | null
}

export interface MemoryViewItem {
  id: string
  memoryType: string
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  costAmount: string | null
  costCurrency: string | null
  costQualifier: CostQualifier | null
  totalCostAmount: string | null
  // Actionable unresolved flags (from memory_items.unresolvedFlags). Drives
  // the "Worth checking" display; cleared when Mike resolves the item.
  uncertaintyFlags: string[]
  // Provenance: the source candidate fact's original uncertainty. Preserved
  // as evidence, not actionable. Optional until backend ships it.
  sourceUncertaintyFlags?: string[]
  sourceCandidateFactId: string | null
  reviewDecisionId: string | null
  // The budget category this trusted item is assigned to, if any (zero or one).
  // Present on memory-view items so Job memory can show/edit assignment inline.
  budgetCategoryId?: string | null
  createdAt: string
  updatedAt: string
  source: MemoryViewSource | null
}

export interface MemoryViewSection {
  key: string
  label: string
  items: MemoryViewItem[]
}

export interface MemoryViewStillToCheckItem {
  id: string
  sectionKey: string
  summary: string
  kind: string
  timeLabel?: string
}

export interface MemoryViewStillToCheck {
  count: number
  items: MemoryViewStillToCheckItem[]
}

export interface ScanViewItem {
  memoryType: string
  // Prose headline for non-material groups (supplier notes, changes, watch-outs)
  primaryText: string | null
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  costLabel: string | null
  totalCostLabel: string | null
  uncertaintyFlags: string[]
  // true when this row consolidates >1 remembered item (like-for-like total)
  consolidated: boolean
  memoryItemIds: string[]
}

export interface ScanViewSection {
  key: string
  label: string
  items: ScanViewItem[]
}

// Backend-authoritative bought/ordered cost summary (memory-view.costSummary).
export interface CostSummaryRow {
  key: string
  materialName: string
  quantity: string | null
  unit: string | null
  lineTotalAmount: string
  lineTotalCurrency: string
  lineTotalLabel: string
  memoryItemIds: string[]
}
// Why a trusted bought/ordered item is not in Known spend. Kept as an open
// union (string) so an unknown future reason from the backend never crashes the
// UI — it falls back to the safe "Cost worth checking" copy.
export type SpendExclusionReason = 'no_cost_remembered' | 'cost_worth_checking'

export interface ExcludedSpendRow {
  memoryItemId: string
  itemLabel: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  reason: SpendExclusionReason | string
}

export interface OrderedCostSummary {
  knownSpendAmount: string | null
  knownSpendCurrency: string | null
  knownSpendLabel: string | null
  includedMemoryItemIds: string[]
  missingCostCount: number
  uncertainCostCount: number
  excludedMemoryItemIds: string[]
  rows: CostSummaryRow[]
  // Additive (Known spend clarity). Absent on older backends → the UI keeps the
  // count-based explanation. Present → each excluded item is named with a reason.
  excludedRows?: ExcludedSpendRow[]
}
export interface CostSummary {
  orderedMaterials: OrderedCostSummary
}

// ── Budget categories & known spend by category ─────────────────────────────
// Backend-authoritative. The frontend never recomputes category known spend as
// confirmed truth — it renders the budget-summary response.

export interface BudgetCategory {
  id: string
  jobId: string
  name: string
  budgetAmount: string | null
  budgetCurrency: string | null
  sortOrder: number
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

// One contributing memory item under a category / uncategorised (not consolidated).
export interface BudgetSpendRow {
  memoryItemId: string
  itemLabel: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  lineTotalAmount: string
  lineTotalCurrency: string
  lineTotalLabel: string
}

export interface BudgetCategorySummary {
  category: BudgetCategory
  knownSpendAmount: string | null
  knownSpendCurrency: string | null
  knownSpendLabel: string | null
  budgetAmount: string | null
  budgetCurrency: string | null
  budgetLabel: string | null
  remainingAmount: string | null
  remainingLabel: string | null
  overBudget: boolean
  rows: BudgetSpendRow[]
}

export interface UncategorizedSpendSummary {
  knownSpendAmount: string | null
  knownSpendCurrency: string | null
  knownSpendLabel: string | null
  rows: BudgetSpendRow[]
}

export interface BudgetSummaryTotals {
  budgetAmount: string | null
  budgetCurrency: string | null
  knownSpendAmount: string | null
  knownSpendCurrency: string | null
  remainingAmount: string | null
  remainingLabel: string | null
  overBudget: boolean
}

export interface BudgetSummaryResponse {
  jobId: string
  generatedAt: string
  categories: BudgetCategorySummary[]
  uncategorized: UncategorizedSpendSummary
  totals: BudgetSummaryTotals
}

export interface CreateBudgetCategoryRequest {
  name: string
  budgetAmount?: string | null
  budgetCurrency?: string | null
  sortOrder?: number
}

export interface PatchBudgetCategoryRequest {
  name?: string
  budgetAmount?: string | null
  budgetCurrency?: string | null
  sortOrder?: number
  isArchived?: boolean
}

export interface MemoryViewResponse {
  job: Job
  generatedAt: string
  sections: MemoryViewSection[]
  stillToCheck: MemoryViewStillToCheck
  summarySections?: ScanViewSection[]
  costSummary?: CostSummary
}

// Request body for PATCH /api/jobs/:jobId/memory-items/:memoryItemId
// Corrects trusted memory in place — never creates a queue item or draft fact.
export interface MemoryItemEdit {
  memoryType: MemoryType
  summary?: string | null
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  costAmount: string | null
  costCurrency: string | null
  costQualifier: CostQualifier | null
  totalCostAmount: string | null
  // Clears (resolved) or keeps (still_unsure) memory_items.unresolvedFlags.
  // Omitted preserves existing flags (backwards compatible).
  uncertaintyResolution?: UncertaintyResolution
  // Assign/clear the item's budget category. Omitted leaves it unchanged.
  budgetCategoryId?: string | null
}
