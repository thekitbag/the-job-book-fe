// Authenticated account — replaces the single shared pilot passcode identity.
// Backend always includes `role` (defaults to PILOT).
export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'PILOT' | 'INTERNAL'
}

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
  status: 'planning' | 'started' | 'finished' | 'archived'
  roughLocationOrLabel: string | null
  createdAt: string
  updatedAt: string
}

// All statuses are editable through PATCH /api/jobs/:jobId — archived is an
// archive action (not a delete), so the frontend must confirm before applying it.
export type EditableJobStatus = 'planning' | 'started' | 'finished' | 'archived'

export type FactType =
  | 'ordered_material'
  | 'used_material'
  | 'leftover_material'
  | 'supplier_delivery_note'
  | 'customer_change'
  | 'watch_out'
  | 'labour'
  | 'general_note'
  | 'unclear'

export type ConfidenceLabel = 'high' | 'medium' | 'low'

export type CostQualifier = 'each' | 'total' | 'approx' | 'unknown' | 'per_hour'
/** @deprecated Legacy API field; never shown or written by the builder UI. */
export type LabourBudgetTreatment = 'counts_toward_budget' | 'hours_only'

// ── Review queue types ────────────────────────────────────────────────────────

// Trusted memory must be a concrete type — unclear items must be corrected or
// dismissed. 'returned_material' is a memory type but deliberately not a
// FactType: returns are recorded by Mike through the return action, never
// inferred from a voice note ("I'm going to take these back" is not a refund).
// 'budget_cost' is a general trusted job cost (labour cost, plant, hire,
// subcontractor, or any non-material cost) — Budget owns all cost; Labour is
// hours-only. See labour-hours-budget-costs-paid-undo spec.
export type MemoryType = Exclude<FactType, 'unclear'> | 'returned_material' | 'budget_cost'

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
  // Labour-specific fields (only meaningful for memoryType 'labour').
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  // Review-queue labour enrichment: the exact-name-matched person's id + the
  // budget treatment that will be persisted on confirm (correctable), plus the
  // inherited person/treatment for display. Absent on non-labour drafts and on
  // older backends without people enrichment.
  labourPersonId?: string | null
  labourBudgetEnabled?: boolean | null
  inheritedLabourPerson?: LabourPerson | null
  inheritedBudgetTreatment?: LabourBudgetTreatment | null
  // Effective event day (ISO DateTime; local noon for date-only). Labour drafts
  // carry the spoken/derived day; corrections may change it.
  happenedAt?: string | null
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
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  happenedAt?: string | null
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
  // Active labour people for the owner (additive) — used to resolve a corrected
  // person name back to an id when confirming a labour draft.
  labourPeople?: LabourPerson[]
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
  // Labour drafts only: the person to link and whether the entry counts toward
  // Budget. Omitted → backend applies the same safe defaults as direct-add.
  labourPersonId?: string | null
  labourBudgetEnabled?: boolean | null
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
  // Labour-specific fields (only meaningful for memoryType 'labour').
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  // The lightweight labour person this entry is linked to, if any.
  labourPersonId?: string | null
  // Whether this labour entry can contribute to Budget when it has trusted
  // cost. false = hours-only. Absent on older rows (treated as legacy — the
  // pre-people behaviour is preserved so migrated Budget totals don't shift).
  labourBudgetEnabled?: boolean | null
  // The budget category this trusted item is assigned to, if any (zero or one).
  // Present on memory-view items so Job memory can show/edit assignment inline.
  budgetCategoryId?: string | null
  // Effective event date (direct-add). Display date preference:
  // happenedAt ?? source.capturedAt ?? createdAt.
  happenedAt?: string | null
  // ── Returned materials (memoryType 'returned_material') ──────────────────
  // Money back, deliberately NOT costAmount/totalCostAmount: those mean money
  // out for a bought/labour line, and overloading them would make a refund
  // read as ordinary positive spend.
  refundAmount?: string | null
  refundCurrency?: string | null
  // The Left over item this was returned from, when the return went through the
  // Left over action. Traceability only — a plain id, not a loaded relation.
  returnedFromMemoryItemId?: string | null
  // true for items added directly (not voice-extracted). Optional until backend ships it.
  isManual?: boolean
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
// Labour money summary (additive). Mirrors the known-spend-clarity shape but
// for labour: rows that contribute, and excluded rows with a labour reason.
export interface LabourSpendRow {
  memoryItemId: string
  itemLabel: string
  labourHours: string | null
  labourPerson: string | null
  labourTask: string | null
  lineTotalAmount: string
  lineTotalCurrency: string
  lineTotalLabel: string
}
export type LabourExclusionReason = 'no_rate_or_cost' | 'cost_worth_checking'
export interface LabourExcludedRow {
  memoryItemId: string
  itemLabel: string
  labourHours: string | null
  labourPerson: string | null
  labourTask: string | null
  reason: LabourExclusionReason
}
export interface LabourCostSummary {
  knownSpendAmount: string | null
  knownSpendCurrency: string | null
  knownSpendLabel: string | null
  includedMemoryItemIds: string[]
  rows: LabourSpendRow[]
  excludedRows: LabourExcludedRow[]
}
export interface TotalKnownCost {
  knownSpendAmount: string | null
  knownSpendCurrency: string | null
  knownSpendLabel: string | null
  includedMemoryItemIds: string[]
}
// Trusted money out before refunds — the figure totalKnownCost was until
// returned materials landed. Shown as the "Bought and labour" line so a net
// total can never drop without saying why.
export interface GrossKnownCost {
  amount: string | null
  currency: string | null
  label: string | null
}
// One trusted refund from a returned material. Never a spend row: it is money
// back, and the Spend lens renders it as a signed reduction.
export interface ReturnedRefundRow {
  memoryItemId: string
  itemLabel: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  refundAmount: string
  refundCurrency: 'GBP'
  refundLabel: string // e.g. "£80 refund"
  happenedAt: string | null
}
export interface RefundsSummary {
  knownRefundAmount: string | null
  knownRefundCurrency: 'GBP' | null
  knownRefundLabel: string | null // e.g. "£80 refunded"
  rows: ReturnedRefundRow[]
}
export interface CostSummary {
  orderedMaterials: OrderedCostSummary
  // Additive: present once the backend supports labour money.
  labour?: LabourCostSummary
  // Bought + labour trusted monetary cost, NET of trusted refunds since
  // returned materials. Drives the spend hero.
  totalKnownCost?: TotalKnownCost
  // Additive (returned materials): gross (pre-refund) and the refunds that
  // take it down to totalKnownCost. Absent on older backends → no refunds
  // exist, so the hero shows the total with no breakdown.
  grossKnownCost?: GrossKnownCost
  refunds?: RefundsSummary
}

// ── Labour daily view (Labour Tracking V2) ──────────────────────────────────
// Backend-authoritative daily labour summary on memory-view. Days are UK local
// calendar days from happenedAt; hour totals are safe totals (strict positive
// decimal hours, no unresolved flags) — never guesses.

export interface LabourDayItem {
  memoryItemId: string
  labourPerson: string | null
  labourTask: string | null
  labourHours: string | null
  hoursLabel: string | null
  happenedAt: string | null
  includedInHourTotal: boolean
  worthChecking: boolean
  lineTotalAmount: string | null
  lineTotalCurrency: string | null
  lineTotalLabel: string | null
}

export interface LabourDaySummary {
  date: string // YYYY-MM-DD in UK local day
  totalHours: string | null
  totalLabel: string | null // e.g. "10h day total"
  items: LabourDayItem[]
}

export interface LabourHoursSummary {
  totalHours: string | null
  totalLabel: string | null // e.g. "24h job total"
  days: LabourDaySummary[]
}

// ── Labour people (scoped to the current job) ────────────────────────────────

export interface LabourPerson {
  id: string
  name: string
  defaultHourlyRateAmount: string | null
  defaultHourlyRateCurrency: 'GBP' | null
  /** @deprecated Compatibility only. */
  defaultBudgetTreatment?: LabourBudgetTreatment
  createdAt: string
  updatedAt: string
}

// A person plus this job's stats — returned by the job-scoped list so a person
// with no entries on this job can still be selected for a new one.
export interface LabourPersonWithJobStats extends LabourPerson {
  // True for the account owner's own person row (shown as "· you").
  isSelf?: boolean
  jobHours: string | null
  jobHoursLabel: string | null
  jobLabourCostAmount?: string | null
  jobLabourCostCurrency?: 'GBP' | null
  jobLabourCostLabel?: string | null
  /** @deprecated pre-correction response aliases. */
  jobBudgetCostAmount?: string | null
  jobBudgetCostCurrency?: 'GBP' | null
  jobBudgetCostLabel?: string | null
  hasEntriesWithoutRate: boolean
}

export interface LabourPeopleResponse {
  jobId: string
  people: LabourPersonWithJobStats[]
}

export interface CreateLabourPersonRequest {
  name: string
  defaultHourlyRateAmount?: string | null
  defaultHourlyRateCurrency?: 'GBP' | null
}

// PATCH — omitted fields preserve; null rate clears the default rate/currency.
export interface PatchLabourPersonRequest {
  name?: string
  defaultHourlyRateAmount?: string | null
  defaultHourlyRateCurrency?: 'GBP' | null
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
  // Additive: distinguishes bought vs labour contributions in a category.
  memoryType?: string
  itemLabel: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  lineTotalAmount: string
  lineTotalCurrency: string
  lineTotalLabel: string
  // Authoritative paid state for this source row. Optional keeps the frontend
  // compatible with an older backend during the coordinated rollout.
  paymentState?: 'paid' | 'not_paid' | null
  paidMoneyEventId?: string | null
  paidAt?: string | null
  eligibleForPaymentState?: boolean
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
  paymentState?: 'paid' | 'not_paid' | 'some_paid' | null
  paidAmount?: string | null
  paidCurrency?: 'GBP' | null
  paidLabel?: string | null
  notPaidAmount?: string | null
  notPaidCurrency?: 'GBP' | null
  notPaidLabel?: string | null
  paymentStateReason?: 'eligible_items' | 'missing_price_present' | 'no_eligible_items' | null
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
  // Authoritative job-level payment context from budget-summary. Optional
  // during the additive rollout; absence means omit the masthead line rather
  // than joining category and Money rows in the frontend.
  notPaidAmount?: string | null
  notPaidCurrency?: 'GBP' | null
  notPaidLabel?: string | null
  allKnownCostsPaid?: boolean
  hasKnownPayableCosts?: boolean
  hasMissingPriceAttention?: boolean
}

// System labour spend group (Labour Tracking V2). Present even when Mike has
// not created a Labour budget category; rows are every safe trusted labour
// monetary row, once. If an active category named "labour" exists it is exposed
// as budgetCategory and its budget drives budget/remaining.
export interface LabourSpendSummary {
  knownSpendAmount: string | null
  knownSpendCurrency: string | null
  knownSpendLabel: string | null
  budgetCategory: BudgetCategory | null
  budgetAmount: string | null
  budgetCurrency: string | null
  budgetLabel: string | null
  remainingAmount: string | null
  remainingLabel: string | null
  overBudget: boolean
  // The Labour system group is rendered as a Budget category in the frontend.
  // Backends may return these directly; the older-response fallback derives
  // them from authoritative row payment states.
  paymentState?: 'paid' | 'not_paid' | 'some_paid' | null
  paidAmount?: string | null
  paidCurrency?: 'GBP' | null
  paidLabel?: string | null
  notPaidAmount?: string | null
  notPaidCurrency?: 'GBP' | null
  notPaidLabel?: string | null
  paymentStateReason?: 'eligible_items' | 'missing_price_present' | 'no_eligible_items' | null
  rows: BudgetSpendRow[] // memoryType === 'labour'
}

export interface BudgetSummaryResponse {
  jobId: string
  generatedAt: string
  categories: BudgetCategorySummary[]
  uncategorized: UncategorizedSpendSummary
  totals: BudgetSummaryTotals
  // Additive: absent on older backends → frontend falls back to deriving labour
  // rows from categories/uncategorized.
  labour?: LabourSpendSummary
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
  // Additive: authoritative daily labour summary (Labour Tracking V2).
  labourHoursSummary?: LabourHoursSummary
}

// ── Workspace Overview derivations (frontend-only) ────────────────────────────
// Compact summaries the current-job Overview shows. Derived from trusted
// memory-view sections only — pending drafts are never included.

export interface LabourTodaySummary {
  // Sum of strict-numeric labourHours on labour items dated today (local day).
  totalHours: number
  hasHours: boolean
  // Per-person hour split, e.g. [{ person: 'Mike', hours: 4 }].
  perPerson: { person: string; hours: number }[]
}

export type LatestActivityType = 'bought' | 'used' | 'returned' | 'labour' | 'note' | 'photo' | 'payment'

export interface LatestActivityItem {
  memoryItemId: string
  type: LatestActivityType
  typeLabel: string // 'Bought' | 'Used' | 'Labour' | 'Note'
  headline: string
  // Right-aligned money label when the item carries a trusted/shown cost.
  costLabel: string | null
  // ISO effective timestamp (source.capturedAt ?? createdAt) for age display.
  effectiveAt: string
}

// Request body for POST /api/jobs/:jobId/memory-items — create a trusted manual
// memory item directly (no audio/transcription/extraction/review). The section
// the user is in chooses memoryType; there is no generic "add record".
export interface CreateMemoryItemRequest {
  memoryType: MemoryType
  summary?: string | null
  happenedAt?: string | null // ISO date/time; date-only from FE is fine
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
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  // Link a new labour entry to a labour person; when provided and rate/treatment
  // are omitted, the backend applies that person's defaults.
  labourPersonId?: string | null
  // Whether the entry counts toward Budget when trusted. Omitted → the person's
  // default, or hours-only when no person/default is available.
  labourBudgetEnabled?: boolean | null
  budgetCategoryId?: string | null
  // Record an eligible trusted positive source cost as already paid on create,
  // atomically adding one linked Money out. Currently used by bought material
  // and labour source-entry flows.
  markPaid?: boolean
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
  // The backend treats presence of this key as explicit: a value sets the line
  // total, null clears it. OMIT the key to let the backend derive it (e.g. unit
  // cost = quantity × costAmount). Not sent → unchanged/derived, not cleared.
  totalCostAmount?: string | null
  // Labour-specific fields (sent when memoryType is 'labour').
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  // Re-link (or unlink, with null) the entry's labour person. Omitted preserves.
  labourPersonId?: string | null
  // Change future Budget inclusion for this entry. Omitted preserves.
  labourBudgetEnabled?: boolean | null
  // Effective event day. Present sets/clears the value (local-noon ISO for a
  // date-only edit); OMIT the key to preserve the existing value.
  happenedAt?: string | null
  // Clears (resolved) or keeps (still_unsure) memory_items.unresolvedFlags.
  // Omitted preserves existing flags (backwards compatible).
  uncertaintyResolution?: UncertaintyResolution
  // Assign/clear the item's budget category. Omitted leaves it unchanged.
  budgetCategoryId?: string | null
}

// ── Returned materials ────────────────────────────────────────────────────────
// POST /api/jobs/:jobId/memory-items/:memoryItemId/return — move all or part of
// a Left over item to Returned. A dedicated operation, not a client-side split:
// creating the returned item and reducing the leftover must be one transaction.
// Returning is not deleting — the original purchase history stays intact.

export interface ReturnMaterialRequest {
  quantity: string
  // Defaults to the source leftover's unit when omitted.
  unit?: string | null
  supplierName?: string | null
  // Omitted/null → returned, but no trusted refund: it does not reduce spend.
  refundAmount?: string | null
  refundCurrency?: 'GBP' | null
  happenedAt?: string | null // ISO datetime or YYYY-MM-DD
}

export interface ReturnMaterialResponse {
  returnedItem: MemoryViewItem
  // null on a full return — the leftover left the active record entirely.
  remainingLeftoverItem: MemoryViewItem | null
}

// ── Job photos ────────────────────────────────────────────────────────────────
// A job photo is supporting job context — not a memory item, spend item, or
// extraction source. Receipt photos are evidence only: uploading one never
// creates candidate facts, memory items, review decisions, or spend changes.

export interface JobPhotoLinkedNote {
  id: string
  capturedAt: string
}

export interface JobPhotoLinkedMemoryItem {
  id: string
  memoryType: string
  summary: string
}

export interface JobPhoto {
  id: string
  jobId: string
  descriptor: string | null
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  createdAt: string
  updatedAt: string
  linkedNoteId: string | null
  linkedMemoryItemId: string | null
  linkedNote: JobPhotoLinkedNote | null
  linkedMemoryItem: JobPhotoLinkedMemoryItem | null
  // Authenticated backend route (e.g. /api/jobs/:jobId/photos/:photoId/file).
  // Never a public object-storage URL.
  imageUrl: string
}

export interface JobPhotosResponse {
  jobId: string
  photos: JobPhoto[]
}

// Multipart upload fields for POST /api/jobs/:jobId/photos. At most one link
// target; descriptor is trimmed, blank → null, max 120 chars.
export interface UploadJobPhotoRequest {
  file: File
  descriptor?: string | null
  linkedNoteId?: string | null
  linkedMemoryItemId?: string | null
}

// PATCH /api/jobs/:jobId/photos/:photoId — omitted fields preserve existing
// values; null clears. At most one link target set after patch.
export interface PatchJobPhotoRequest {
  descriptor?: string | null
  linkedNoteId?: string | null
  linkedMemoryItemId?: string | null
}

// ── Founder Support Mode (internal, read-only) ───────────────────────────────
// Deliberate /api/internal/support/... READ endpoints gated on role INTERNAL.
// Support mode never swaps the session user and has no write routes; normal
// APIs stay owner-scoped to the signed-in user.

export interface SupportUser {
  id: string
  email: string
  name: string | null
  role: 'PILOT' | 'INTERNAL'
  createdAt: string
  updatedAt: string
  jobCount: number
  lastActivityAt: string | null
}

export interface SupportUsersResponse {
  users: SupportUser[]
}

export interface SupportJob {
  id: string
  ownerUserId: string
  title: string
  jobType: string | null
  status: string
  roughLocationOrLabel: string | null
  createdAt: string
  updatedAt: string
  counts?: {
    notes: number
    memoryItems: number
    reviewItems: number
    photos: number
  }
}

export interface SupportUserJobsResponse {
  user: SupportUser
  jobs: SupportJob[]
}

// ── Customer payments (money in — deliberately separate from spend) ──────────

// GET /api/jobs/:jobId/payments — summary plus active history, newest first.
export interface JobPaymentsResponse {
  jobId: string
  generatedAt: string

  customerTotalAmount: string | null
  customerTotalCurrency: 'GBP' | null
  customerTotalLabel: string | null

  totalPaidAmount: string | null
  totalPaidCurrency: 'GBP' | null
  totalPaidLabel: string | null

  stillOwedAmount: string | null
  stillOwedCurrency: 'GBP' | null
  stillOwedLabel: string | null

  overpaid: boolean
  overpaidAmount: string | null
  overpaidLabel: string | null

  payments: JobPayment[]
}

export interface JobPayment {
  id: string
  jobId: string
  amount: string
  currency: 'GBP'
  amountLabel: string
  paidAt: string
  note: string | null
  reference: string | null
  createdAt: string
  updatedAt: string
}

// PATCH /api/jobs/:jobId/payments/customer-total — null clears the total.
export interface PatchCustomerTotalRequest {
  customerTotalAmount: string | null
  customerTotalCurrency?: 'GBP'
}

// POST /api/jobs/:jobId/payments
export interface CreateJobPaymentRequest {
  amount: string
  currency?: 'GBP'
  paidAt: string // ISO datetime or YYYY-MM-DD
  note?: string | null
  reference?: string | null
}

// PATCH /api/jobs/:jobId/payments/:paymentId — omitted preserves, null clears.
export interface PatchJobPaymentRequest {
  amount?: string
  currency?: 'GBP'
  paidAt?: string
  note?: string | null
  reference?: string | null
}

// ── Money (actual movement — in and out) ─────────────────────────────────────
// The unified Money read model. Budget tracks committed/allocated cost; Money
// tracks what has actually moved. Existing customer payments project in here as
// money-in rows without any physical migration.

export type MoneyDirection = 'in' | 'out'
// customer_payment / refund → in; cost_paid → out.
export type MoneyKind = 'customer_payment' | 'refund' | 'cost_paid'

export interface MoneyRow {
  id: string
  jobId: string
  direction: MoneyDirection
  kind: MoneyKind
  amount: string
  currency: 'GBP'
  amountLabel: string // "+£1000" / "-£336" — signed, direction-aware
  occurredAt: string
  note: string | null
  reference: string | null
  // Links a money-out / refund row back to the memory item that caused it.
  sourceMemoryItemId: string | null
  sourceItemLabel: string | null
  sourceMemoryType: string | null
  // Current Budget category context is resolved from the source at read time,
  // so recategorising the source updates Money without another movement.
  sourceBudgetCategoryId?: string | null
  sourceBudgetCategoryName?: string | null
  editable: boolean
  removable: boolean
  createdAt: string
  updatedAt: string
}

// GET /api/jobs/:jobId/money — combined totals + one history list, newest first.
export interface JobMoneyResponse {
  jobId: string
  generatedAt: string

  customerTotalAmount: string | null
  customerTotalCurrency: 'GBP' | null
  customerTotalLabel: string | null

  moneyInAmount: string | null
  moneyInCurrency: 'GBP' | null
  moneyInLabel: string | null // e.g. "£4000 received"

  moneyOutAmount: string | null
  moneyOutCurrency: 'GBP' | null
  moneyOutLabel: string | null // e.g. "£1124 paid out"

  stillOwedAmount: string | null
  stillOwedCurrency: 'GBP' | null
  stillOwedLabel: string | null

  overpaid: boolean
  overpaidAmount: string | null
  overpaidLabel: string | null

  rows: MoneyRow[]
}

// POST /api/jobs/:jobId/money/out — mark a trusted Budget cost item as paid.
// The amount is derived server-side from the trusted Budget line total; the
// frontend never sends it (v1 is full-amount only).
export interface MarkMoneyOutRequest {
  sourceMemoryItemId: string
  occurredAt?: string | null
  note?: string | null
  reference?: string | null
}
