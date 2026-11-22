export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'PILOT' | 'INTERNAL'
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

export type LabourBudgetTreatment = 'counts_toward_budget' | 'hours_only'

export type MemoryType = Exclude<FactType, 'unclear'> | 'returned_material' | 'budget_cost'

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
  // ── Workshop (availability memory) ───────────────────────────────────────
  // A confirmed leftover keeps living here, on its own job, and gains a current
  // Workshop state. These are additive read-model fields owned by the backend:
  // absent on an older API, which simply means no Workshop has been offered yet.
  //
  // Deliberately NOT a second copy of the material: the amount below travels
  // with the linked Workshop item, so the source row and the Workshop row can
  // never state two different rough amounts for the same physical stuff.
  workshopState?: SourceWorkshopState
  workshopItemId?: string | null
  // The linked Workshop item's current rough wording. Preferred over
  // quantity/unit for display while the material is linked: the source row and
  // the Workshop row state one current amount between them, and this is it.
  // The recorded quantity is left intact underneath — the leftover is still the
  // memory it always was.
  workshopRoughAmount?: string | null
  workshopEnteredAt?: string | null
  workshopEnteredLabel?: string | null
  workshopResolvedAt?: string | null
  workshopResolvedLabel?: string | null
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

export interface GrossKnownCost {
  amount: string | null
  currency: string | null
  label: string | null
}

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

export type MoneyDirection = 'in' | 'out'

export type MoneyKind = 'customer_payment' | 'refund' | 'cost_paid' | 'supplier_account_payment'

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
  // Set on supplier_account_payment rows only: the aggregate payment this job's
  // allocation belongs to, the account it paid, and the source costs it covered.
  // The linked child paid markers never appear as separate rows — the allocation
  // IS the job's visible money-out for that payment, so nothing double-counts.
  supplierAccountPaymentId?: string | null
  supplierName?: string | null
  sourceMemoryItemIds?: string[]
  allocationSourceLabels?: string[]
  editable: boolean
  removable: boolean
  createdAt: string
  updatedAt: string
}

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

export type SourceWorkshopState = 'not_moved' | 'in_workshop' | 'used_up' | 'wasnt_there'
