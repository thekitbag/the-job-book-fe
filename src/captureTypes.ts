export interface CaptureNote {
  id: string
  clientNoteId: string
  jobId: string | null
  filedAt: string | null
  captureContext: 'home' | 'job'
  serverStatus: string
}
export interface CapturePhoto {
  id: string
  clientPhotoId: string | null
  jobId: string | null
  filedAt: string | null
  captureContext: 'home' | 'job'
  uploadedAt: string
  fileUrl: string
}
export type CaptureDraftItem =
  | {
      queueItemId: string
      kind: 'hours'
      person: string | null
      hours: string | null
      day: string
      uncertain: boolean
    }
  | {
      queueItemId: string
      kind: 'material'
      state: 'bought' | 'used' | 'left_over' | 'returned'
      item: string | null
      amount: string | null
      supplier: string | null
      notes: string | null
      uncertain: boolean
    }
export interface CaptureDraft {
  noteId: string
  jobId: string | null
  state: 'not_filed' | 'transcribing' | 'extracting' | 'ready' | 'failed'
  transcriptText: string | null
  items: CaptureDraftItem[]
  moreToCheckCount: number
}
export interface CaptureHome {
  inProgressJobs: {
    id: string
    title: string
    lastActivityAt: string
    toCheckCount: number
  }[]
  otherJobs: { planningCount: number; finishedCount: number }
  unfiledCount: number
  lastRecordedJobId: string | null
  workshop: { availableCount: number; preview: string[] }
}
export interface UnfiledCaptures {
  notes: {
    noteId: string
    capturedAt: string
    durationMs: number | null
    transcriptStatus: 'pending' | 'completed' | 'failed'
    text: string | null
  }[]
  photos: { photoId: string; uploadedAt: string; fileUrl: string }[]
}
export type CaptureTarget = {
  kind: 'note' | 'photo'
  localId?: string
  serverId?: string
  jobId: string | null
  at: string
  context: 'home' | 'job'
  moved?: boolean
  method?: 'picker' | 'later_list' | 'new_job'
}
export type CaptureFlowState = {
  mode: 'picker' | 'saved' | 'move'
  target: CaptureTarget
}
