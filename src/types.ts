export type LocalNoteState =
  | 'saved_local'
  | 'uploading'
  | 'uploaded'
  | 'upload_failed'
  | 'upload_needs_attention'

export type TranscriptStatus = 'waiting' | 'transcribing' | 'ready' | 'failed'

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
}

export interface Job {
  id: string
  title: string
  roughLocationOrLabel: string
  status: 'active' | 'completed' | 'archived'
}
