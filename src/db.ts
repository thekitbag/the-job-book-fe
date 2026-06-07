import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LocalNote, LocalNoteState } from './types'

interface JobBookDB extends DBSchema {
  notes: {
    key: string
    value: LocalNote
    indexes: { 'by-jobId': string }
  }
}

let dbPromise: Promise<IDBPDatabase<JobBookDB>> | null = null

function getDb(): Promise<IDBPDatabase<JobBookDB>> {
  if (!dbPromise) {
    dbPromise = openDB<JobBookDB>('job-book', 1, {
      upgrade(db) {
        const store = db.createObjectStore('notes', { keyPath: 'clientNoteId' })
        store.createIndex('by-jobId', 'jobId')
      },
    })
  }
  return dbPromise
}

export async function saveNote(note: LocalNote): Promise<void> {
  const db = await getDb()
  await db.put('notes', note)
}

export async function getNotesForJob(jobId: string): Promise<LocalNote[]> {
  const db = await getDb()
  return db.getAllFromIndex('notes', 'by-jobId', jobId)
}

export async function getAllNotes(): Promise<LocalNote[]> {
  const db = await getDb()
  return db.getAll('notes')
}

export async function getPendingNotes(): Promise<LocalNote[]> {
  const all = await getAllNotes()
  return all.filter(n => n.localState === 'saved_local' || n.localState === 'upload_failed')
}

export async function patchNote(
  clientNoteId: string,
  patch: Partial<Omit<LocalNote, 'clientNoteId'>>,
): Promise<void> {
  const db = await getDb()
  const note = await db.get('notes', clientNoteId)
  if (note) await db.put('notes', { ...note, ...patch })
}

// Lets tests give each test case a fresh IndexedDB without module re-imports.
export function _resetDbForTesting(): void {
  dbPromise = null
}

// On startup, any note stuck in 'uploading' had its upload interrupted by a page close.
// Reset those back to 'saved_local' so the sync loop retries them.
export async function resetInterruptedUploads(): Promise<number> {
  const db = await getDb()
  const all = await db.getAll('notes')
  const stuck = all.filter(n => n.localState === 'uploading')
  await Promise.all(
    stuck.map(n => db.put('notes', { ...n, localState: 'saved_local' as LocalNoteState })),
  )
  return stuck.length
}
