import type { LocalNote } from '../types'

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
    ...overrides,
  }
}
