export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'PILOT' | 'INTERNAL'
}

export type LocalNoteState =
  'saved_local' | 'uploading' | 'uploaded' | 'upload_failed' | 'upload_needs_attention'

export type TranscriptStatus = 'waiting' | 'transcribing' | 'ready' | 'failed'

export type ExtractionStatus = 'waiting' | 'extracting' | 'ready' | 'failed'

export interface LocalNote {
  clientNoteId: string
  jobId: string | null
  // Missing metadata denotes an existing v1 record; new captures always stamp it.
  ownerUserId?: string | null
  captureSessionId?: string
  captureContext?: 'job' | 'home'
  serverJobId?: string | null
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

export interface LocalPhoto {
  clientPhotoId: string
  jobId: string | null
  ownerUserId: string | null
  captureSessionId: string
  capturedAt: string
  mimeType: string
  blob: Blob
  sizeBytes: number
  localState: LocalNoteState
  uploadAttemptCount: number
  lastUploadAttemptAt: string | null
  lastErrorCode: string | null
  serverPhotoId: string | null
  serverJobId?: string | null
  captureContext?: 'home' | 'job'
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

export interface CreateJobRequest {
  title: string
  roughLocationOrLabel?: string | null
  status?: 'planning' | 'started'
}

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

export type MemoryType = Exclude<FactType, 'unclear'> | 'returned_material'

export interface ProposedMemory {
  memoryType: MemoryType
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  happenedAt?: string | null
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
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  happenedAt?: string | null
  uncertaintyFlags?: string[]
  sourceUncertaintyFlags?: string[]
}

export interface ReviewQueue {
  jobId: string
  generatedAt: string
  sections: QueueSection[]
  alreadyRemembered: AlreadyRememberedItem[]
}

export type QueueDecisionAction = 'confirm' | 'correct' | 'dismiss'

export type UncertaintyResolution = 'resolved' | 'still_unsure'

export interface QueueDecision {
  queueItemId: string
  action: QueueDecisionAction
  corrected?: ProposedMemory
  reason?: string
  uncertaintyResolution?: UncertaintyResolution
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
  memoryItemId?: string
  item?: string | null
  amount?: string | null
  supplier?: string | null
  notes?: string | null
  date?: string

  id: string
  memoryType: string
  summary: string
  materialName: string | null
  quantity: string | null
  unit: string | null
  supplierName: string | null
  deliveryTiming: string | null
  locationOrUse: string | null
  uncertaintyFlags: string[]
  sourceUncertaintyFlags?: string[]
  sourceCandidateFactId: string | null
  reviewDecisionId: string | null
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  happenedAt?: string | null
  returnedFromMemoryItemId?: string | null
  isManual?: boolean
  workshopState?: SourceWorkshopState
  workshopItemId?: string | null
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

export interface MemoryViewResponse {
  hours: HoursSummary
  job: Job
  generatedAt: string
  sections: MemoryViewSection[]
  stillToCheck: MemoryViewStillToCheck
}

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
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
}

export interface MemoryItemEdit {
  memoryType?: MemoryType
  summary?: string | null
  materialName?: string | null
  quantity?: string | null
  unit?: string | null
  supplierName?: string | null
  deliveryTiming?: string | null
  locationOrUse?: string | null
  labourHours?: string | null
  labourPerson?: string | null
  labourTask?: string | null
  happenedAt?: string | null
  uncertaintyResolution?: UncertaintyResolution
}

export interface ReturnMaterialRequest {
  quantity: string
  unit?: string | null
  supplierName?: string | null
  happenedAt?: string | null // ISO datetime or YYYY-MM-DD
}

export interface ReturnMaterialResponse {
  returnedItem: MemoryViewItem
  remainingLeftoverItem: MemoryViewItem | null
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
  imageUrl: string
}

export interface JobPhotosResponse {
  jobId: string
  photos: JobPhoto[]
}

export interface UploadJobPhotoRequest {
  file: File
  descriptor?: string | null
  linkedNoteId?: string | null
  linkedMemoryItemId?: string | null
}

export interface PatchJobPhotoRequest {
  descriptor?: string | null
  linkedNoteId?: string | null
  linkedMemoryItemId?: string | null
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

export interface JobContact {
  id: string
  jobId: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
  note: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface JobDetailsResponse {
  job: {
    id: string
    title: string
    jobType: string | null
    status: string
    roughLocationOrLabel: string | null
    siteAddress: string | null
    createdAt: string
    updatedAt: string
  }
  contacts: JobContact[]
}

export interface PatchJobDetailsRequest {
  siteAddress?: string | null
}

export interface CreateJobContactRequest {
  name: string
  role?: string | null
  phone?: string | null
  email?: string | null
  note?: string | null
}

export interface PatchJobContactRequest {
  name?: string
  role?: string | null
  phone?: string | null
  email?: string | null
  note?: string | null
}

export type SourceWorkshopState = 'not_moved' | 'in_workshop' | 'used_up' | 'wasnt_there'

export type WorkshopItemState = 'available' | 'used_up' | 'wasnt_there' | 'moved_back'

export type WorkshopItemSourceKind = 'leftover' | 'manual'

export interface WorkshopItem {
  id: string
  materialName: string
  /**
   * Free text, and left exactly as Mike said it: "about 3 sheets", "half a box",
   * "4 or 5". Never parsed, normalised, totalled or compared. null is a valid
   * answer and must never render as 0 or as a missing-data warning.
   */
  roughAmount: string | null
  sourceKind: WorkshopItemSourceKind
  state: WorkshopItemState
  enteredWorkshopAt: string
  enteredWorkshopLabel: string
  resolvedAt: string | null
  resolvedLabel: string | null
  sourceJobId: string | null
  sourceJobTitle: string | null
  sourceJobStatus: string | null
  sourceJobStatusLabel: string | null
  sourceMemoryItemId: string | null
  sourceItemLabel: string | null
  /** "Kitchen Extension" / "Added by hand" — provenance in one printable string. */
  sourceLabel?: string
}

export interface WorkshopPreviewItem {
  id: string
  materialName: string
  roughAmount: string | null
  /** The source job's name, or "Added by hand". The backend's words. */
  sourceLabel: string
}

export interface WorkshopBookHomeSummary {
  /** True in this slice even when empty: Workshop is now a usable destination. */
  showWorkshopRow: boolean
  availableCount: number
  /** "6 things" — null when empty, so an empty row can never show a 0. */
  availableLabel: string | null
  /** Up to three, in the same order as availableItems. */
  previewItems: WorkshopPreviewItem[]
}

export interface WorkshopResponse {
  generatedAt: string
  bookHome: WorkshopBookHomeSummary
  /** Only state 'available', newest enteredWorkshopAt first. */
  availableItems: WorkshopItem[]
}

export interface MoveLeftoverToWorkshopRequest {
  /** Omitted → the backend defaults to the source leftover's display amount. */
  roughAmount?: string | null
}

export interface WorkshopMoveResponse {
  workshopItem: WorkshopItem
  /** The source leftover, still in its job, now carrying its Workshop state. */
  sourceItem: MemoryViewItem
}

export interface CreateManualWorkshopItemRequest {
  materialName: string
  roughAmount?: string | null
}

export interface PatchWorkshopItemRequest {
  materialName?: string
  roughAmount?: string | null
}

export interface WorkshopActionResponse {
  workshopItem: WorkshopItem
  sourceItem: MemoryViewItem | null
}

export interface HoursSummary {
  totalHours: string
  people: { name: string; hours: string }[]
  days: {
    date: string
    totalHours: string
    entries: { memoryItemId: string; person: string; hours: string; task: string | null; isManual: boolean }[]
  }[]
}

export type JobLogEntry =
  | {
      kind: 'voice_note'
      id: string
      noteId: string
      at: string
      durationMs: number | null
      transcriptStatus: 'pending' | 'completed' | 'failed'
      text: string | null
      linkedPhotoIds: string[]
    }
  | { kind: 'typed_note'; id: string; memoryItemId: string; at: string; text: string }
  | {
      kind: 'photo'
      id: string
      photoId: string
      at: string
      fileKind: 'IMAGE' | 'PDF'
      fileUrl: string
      descriptor: string | null
      linkedNoteId: string | null
    }
export interface JobLogResponse {
  entries: JobLogEntry[]
}
