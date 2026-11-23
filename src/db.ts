import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LocalNote, LocalPhoto } from './types'
import {
  canListCapture,
  canSyncCapture,
  getCaptureSessionId,
  getLocalOwnerId,
} from './localOwner'

interface JobBookDB extends DBSchema {
  notes: { key: string; value: LocalNote; indexes: { 'by-jobId': string } }
  photos: { key: string; value: LocalPhoto }
}
export class CaptureStorageError extends Error {
  readonly code = 'STORAGE_BLOCKED'
  constructor() {
    super(
      'Another open Job Book page is holding the recording store. Close that page and try saving again.',
    )
    this.name = 'CaptureStorageError'
  }
}
export interface LocalCaptureChange {
  kind: 'saved' | 'updated' | 'ownership'
  clientNoteId?: string
  jobChanged?: boolean
}
const listeners = new Set<(change: LocalCaptureChange) => void>()
export function subscribeLocalCaptures(
  listener: (change: LocalCaptureChange) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function notify(change: LocalCaptureChange) {
  for (const listener of listeners) listener(change)
}
let dbPromise: Promise<IDBPDatabase<JobBookDB>> | null = null
let upgradeBlocked = false
function getDb(): Promise<IDBPDatabase<JobBookDB>> {
  if (upgradeBlocked) return Promise.reject(new CaptureStorageError())
  if (dbPromise) return dbPromise
  let abandoned = false
  let rejectBlocked!: (reason: Error) => void
  const blocked = new Promise<never>((_resolve, reject) => {
    rejectBlocked = reject
  })
  const opening = openDB<JobBookDB>('job-book', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore('notes', { keyPath: 'clientNoteId' })
        store.createIndex('by-jobId', 'jobId')
      }
      if (oldVersion < 2)
        db.createObjectStore('photos', { keyPath: 'clientPhotoId' })
    },
    blocked() {
      upgradeBlocked = true
      abandoned = true
      rejectBlocked(new CaptureStorageError())
    },
    blocking(_old, _next, event) {
      ;(event.target as IDBDatabase).close()
      if (dbPromise === attempt) dbPromise = null
    },
    terminated() {
      if (dbPromise === attempt) dbPromise = null
    },
  })
    .then((db) => {
      if (abandoned) {
        db.close()
        throw new CaptureStorageError()
      }
      return db
    })
    .finally(() => {
      upgradeBlocked = false
    })
  const attempt = Promise.race([opening, blocked]).catch((error: unknown) => {
    abandoned = true
    if (dbPromise === attempt) dbPromise = null
    throw error
  })
  dbPromise = attempt
  return attempt
}
export async function saveNote(note: LocalNote): Promise<void> {
  const db = await getDb()
  await db.put('notes', note)
  notify({ kind: 'saved', clientNoteId: note.clientNoteId })
}
export async function getNote(id: string): Promise<LocalNote | undefined> {
  const db = await getDb()
  const note = await db.get('notes', id)
  return note && canListCapture(note) ? note : undefined
}
export async function getNotesForJob(
  jobId: string | null,
): Promise<LocalNote[]> {
  const db = await getDb()
  // null is not an IndexedDB key, so unfiled notes cannot use by-jobId.
  const notes =
    jobId === null
      ? (await db.getAll('notes')).filter((n) => n.jobId === null)
      : await db.getAllFromIndex('notes', 'by-jobId', jobId)
  return notes.filter(canListCapture)
}
export async function getAllNotes(): Promise<LocalNote[]> {
  const db = await getDb()
  return (await db.getAll('notes')).filter(canListCapture)
}
export async function getPendingNotes(): Promise<LocalNote[]> {
  return (await getAllNotes()).filter(
    (n) =>
      n.localState === 'saved_local' ||
      n.localState === 'upload_failed' ||
      (n.localState === 'uploaded' &&
        n.serverJobId !== undefined &&
        n.jobId !== null &&
        n.jobId !== n.serverJobId),
  )
}
export async function patchNote(
  id: string,
  patch: Partial<Omit<LocalNote, 'clientNoteId'>>,
): Promise<void> {
  const session = getCaptureSessionId()
  const db = await getDb(),
    tx = db.transaction('notes', 'readwrite')
  const note = await tx.store.get(id)
  if (note && session === getCaptureSessionId() && canListCapture(note))
    await tx.store.put({ ...note, ...patch })
  await tx.done
  if (note && canListCapture(note))
    notify({ kind: 'updated', clientNoteId: id, jobChanged: 'jobId' in patch })
}
export async function savePhoto(photo: LocalPhoto): Promise<void> {
  const db = await getDb()
  await db.put('photos', photo)
  notify({ kind: 'saved' })
}
export async function getAllPhotos(): Promise<LocalPhoto[]> {
  const db = await getDb()
  return (await db.getAll('photos')).filter(canListCapture)
}
export async function getPhoto(id: string): Promise<LocalPhoto | undefined> {
  return (await getAllPhotos()).find((p) => p.clientPhotoId === id)
}
export async function patchPhoto(
  id: string,
  patch: Partial<Omit<LocalPhoto, 'clientPhotoId'>>,
): Promise<void> {
  const session = getCaptureSessionId(),
    db = await getDb(),
    tx = db.transaction('photos', 'readwrite'),
    photo = await tx.store.get(id)
  if (photo && session === getCaptureSessionId() && canListCapture(photo))
    await tx.store.put({ ...photo, ...patch })
  await tx.done
  if (photo) notify({ kind: 'updated', jobChanged: 'jobId' in patch })
}
export async function getPendingPhotos(): Promise<LocalPhoto[]> {
  return (await getAllPhotos()).filter(
    (p) =>
      canSyncCapture(p) &&
      (p.localState === 'saved_local' ||
        p.localState === 'upload_failed' ||
        (p.localState === 'uploaded' &&
          p.serverJobId !== undefined &&
          p.jobId !== null &&
          p.jobId !== p.serverJobId)),
  )
}
export async function getUnmatchedNotes(): Promise<LocalNote[]> {
  const db = await getDb()
  return (await db.getAll('notes')).filter(
    (n) =>
      !n.ownerUserId &&
      n.jobId === null &&
      n.captureSessionId !== getCaptureSessionId(),
  )
}
export async function claimUnmatchedNote(id: string): Promise<void> {
  const owner = getLocalOwnerId(),
    session = getCaptureSessionId()
  if (!owner) return
  const db = await getDb(),
    tx = db.transaction('notes', 'readwrite'),
    note = await tx.store.get(id)
  if (
    note &&
    !note.ownerUserId &&
    note.jobId === null &&
    getLocalOwnerId() === owner &&
    getCaptureSessionId() === session
  )
    await tx.store.put({
      ...note,
      ownerUserId: owner,
      captureSessionId: session,
    })
  await tx.done
  notify({ kind: 'ownership' })
}
export async function stampUnownedCaptures(
  ownerId: string,
  sessionId: string,
): Promise<void> {
  const db = await getDb()
  if (getCaptureSessionId() !== sessionId || getLocalOwnerId() !== ownerId)
    return
  const tx = db.transaction(['notes', 'photos'], 'readwrite')
  for (const storeName of ['notes', 'photos'] as const) {
    let cursor = await tx.objectStore(storeName).openCursor()
    while (cursor) {
      if (
        getCaptureSessionId() !== sessionId ||
        getLocalOwnerId() !== ownerId
      ) {
        tx.abort()
        await tx.done.catch(() => {})
        return
      }
      const item = cursor.value
      if (item.ownerUserId === null && item.captureSessionId === sessionId)
        await cursor.update({ ...item, ownerUserId: ownerId })
      cursor = await cursor.continue()
    }
  }
  await tx.done
  notify({ kind: 'ownership' })
}
export async function resetInterruptedUploads(
  skipIds: ReadonlySet<string> = new Set(),
): Promise<number> {
  const db = await getDb(),
    tx = db.transaction(['notes', 'photos'], 'readwrite')
  let count = 0,
    cursor = await tx.objectStore('notes').openCursor()
  while (cursor) {
    const note = cursor.value
    if (
      note.localState === 'uploading' &&
      canListCapture(note) &&
      !skipIds.has(note.clientNoteId)
    ) {
      await cursor.update({ ...note, localState: 'saved_local' })
      count++
    }
    cursor = await cursor.continue()
  }
  let photoCursor = await tx.objectStore('photos').openCursor()
  while (photoCursor) {
    const p = photoCursor.value
    if (
      p.localState === 'uploading' &&
      canListCapture(p) &&
      !skipIds.has('photo:' + p.clientPhotoId)
    ) {
      await photoCursor.update({ ...p, localState: 'saved_local' })
      count++
    }
    photoCursor = await photoCursor.continue()
  }
  await tx.done
  if (count) notify({ kind: 'updated' })
  return count
}
export function _resetDbForTesting(): void {
  const previous = dbPromise
  dbPromise = null
  upgradeBlocked = false
  void previous?.then((db) => db.close()).catch(() => {})
}
