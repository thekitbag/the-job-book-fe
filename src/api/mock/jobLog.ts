import type { JobLogEntry, JobLogResponse, LocalNote } from '../../types'
import { mockSectionsFor } from './state'
import { mockGetJobPhotos } from './photos'
const AT = '2026-11-21T12:00:00.000Z'
const uploadedNotes = new Map<string, LocalNote>()
export function mockRecordUploadedNote(note: LocalNote): void {
  uploadedNotes.set(note.clientNoteId, note)
}
export function resetMockJobLog(): void {
  uploadedNotes.clear()
}
export function mockJobLog(jobId: string): JobLogResponse {
  const entries: JobLogEntry[] = [...uploadedNotes.values()]
    .filter((n) => n.jobId === jobId)
    .map((n) => ({
      kind: 'voice_note',
      id: `srv-${n.clientNoteId}`,
      noteId: `srv-${n.clientNoteId}`,
      at: n.capturedAt,
      durationMs: n.durationMs,
      transcriptStatus: 'pending',
      text: null,
      linkedPhotoIds: [],
    }))
  if (jobId === 'job-pilot-garden-room-001')
    entries.push(
      {
        kind: 'voice_note',
        id: 'log-voice',
        noteId: 'mock-note-001',
        at: AT,
        durationMs: 11000,
        transcriptStatus: 'completed',
        text: 'Bought 8 bags of hardcore from Jewson, five pounds each.',
        linkedPhotoIds: [],
      },
      {
        kind: 'voice_note',
        id: 'log-only-price',
        noteId: 'mock-note-only-price',
        at: AT,
        durationMs: 4000,
        transcriptStatus: 'completed',
        text: 'Skip hire, £250.',
        linkedPhotoIds: [],
      },
      {
        kind: 'voice_note',
        id: 'log-failed',
        noteId: 'mock-note-failed',
        at: AT,
        durationMs: 9000,
        transcriptStatus: 'failed',
        text: null,
        linkedPhotoIds: [],
      },
      {
        kind: 'voice_note',
        id: 'log-pending',
        noteId: 'mock-note-pending',
        at: AT,
        durationMs: 6000,
        transcriptStatus: 'pending',
        text: null,
        linkedPhotoIds: [],
      },
      {
        kind: 'photo',
        id: 'log-legacy-image',
        photoId: 'legacy-image',
        at: AT,
        fileKind: 'IMAGE',
        fileUrl:
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="140"><rect width="300" height="140" fill="#eee7db"/><text x="30" y="70">Delivery slip</text></svg>',
          ),
        descriptor: 'Delivery slip',
        linkedNoteId: null,
      },
      {
        kind: 'photo',
        id: 'log-legacy-file',
        photoId: 'legacy-file',
        at: AT,
        fileKind: 'PDF',
        fileUrl: '/api/jobs/' + jobId + '/receipts/legacy-file/file',
        descriptor: 'Site document',
        linkedNoteId: null,
      },
    )
  for (const item of mockSectionsFor(jobId).flatMap((s) => s.items)) {
    if (item.isManual && !item.memoryType.endsWith('_material') && item.memoryType !== 'labour')
      entries.push({
        kind: 'typed_note',
        id: item.id,
        memoryItemId: item.id,
        at: item.happenedAt ?? item.createdAt,
        text: item.summary,
      })
    else if (item.source && !entries.some((e) => e.kind === 'voice_note' && e.noteId === item.source!.noteId))
      entries.push({
        kind: 'voice_note',
        id: item.source.noteId,
        noteId: item.source.noteId,
        at: item.source.capturedAt,
        durationMs: null,
        transcriptStatus: item.source.transcriptText ? 'completed' : 'pending',
        text: item.source.transcriptText,
        linkedPhotoIds: [],
      })
  }
  for (const photo of mockGetJobPhotos(jobId).photos)
    entries.push({
      kind: 'photo',
      id: photo.id,
      photoId: photo.id,
      at: photo.createdAt,
      fileKind: 'IMAGE',
      fileUrl: photo.imageUrl,
      descriptor: photo.descriptor,
      linkedNoteId: photo.linkedNoteId,
    })
  return { entries: entries.sort((a, b) => b.at.localeCompare(a.at)) }
}
