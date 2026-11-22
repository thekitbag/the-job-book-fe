import { saveNote, stampUnownedCaptures } from './db'
import {
  canListCapture,
  captureIdentity,
  getCaptureSessionId,
  getLocalOwnerId,
} from './localOwner'
import type { LocalNote } from './types'
import type { RecordingResult } from './useRecorder'
const failed = new Map<
  string,
  { note: LocalNote; error: unknown; saving: boolean }
>()
let latestSaved: LocalNote | null = null,
  revision = 0
const listeners = new Set<() => void>()
function emit() {
  revision++
  for (const listener of listeners) listener()
}
export function subscribeCaptureSaves(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function captureSaveSnapshot() {
  return revision
}
export function getFailedCaptures() {
  return [...failed.values()].filter((f) => canListCapture(f.note))
}
export function getLatestSavedCapture() {
  return latestSaved && canListCapture(latestSaved) ? latestSaved : null
}
export function createCapturedNote(
  result: RecordingResult,
  jobId: string | null,
  identity = captureIdentity(),
): LocalNote {
  const owner =
    identity.ownerUserId === null &&
    identity.captureSessionId === getCaptureSessionId()
      ? getLocalOwnerId()
      : identity.ownerUserId
  return {
    clientNoteId: crypto.randomUUID(),
    jobId,
    ownerUserId: owner,
    captureSessionId: identity.captureSessionId,
    captureContext: jobId ? 'job' : 'home',
    capturedAt: new Date().toISOString(),
    durationMs: result.durationMs,
    mimeType: result.mimeType,
    blob: result.blob,
    sizeBytes: result.blob.size,
    localState: 'saved_local',
    uploadAttemptCount: 0,
    lastUploadAttemptAt: null,
    serverNoteId: null,
    lastErrorCode: null,
    transcriptStatus: null,
    transcriptText: null,
    transcriptErrorCode: null,
    extractionStatus: null,
  }
}
/** A failed IndexedDB write is kept in memory, never described as saved. */
export async function persistCapturedNote(note: LocalNote): Promise<boolean> {
  if (failed.get(note.clientNoteId)?.saving) return false
  latestSaved = null
  emit()
  const previous = failed.get(note.clientNoteId)
  if (previous) {
    previous.saving = true
    emit()
  }
  const owner =
    note.ownerUserId === null && note.captureSessionId === getCaptureSessionId()
      ? getLocalOwnerId()
      : note.ownerUserId
  const current = { ...note, ownerUserId: owner }
  try {
    await saveNote(current)
    // A same-session lookup can finish while IndexedDB is opening. Claim the
    // saved row too, rather than leaving that race permanently unsynchronised.
    const knownOwner = getLocalOwnerId()
    if (knownOwner && current.captureSessionId === getCaptureSessionId())
      await stampUnownedCaptures(knownOwner, current.captureSessionId).catch(
        () => {},
      )
    failed.delete(note.clientNoteId)
    latestSaved = current
    emit()
    return true
  } catch (error) {
    failed.set(note.clientNoteId, { note: current, error, saving: false })
    emit()
    return false
  }
}
export function dismissSavedCapture() {
  latestSaved = null
  emit()
}
export function _resetCapturePersistenceForTesting() {
  failed.clear()
  latestSaved = null
  revision = 0
}
