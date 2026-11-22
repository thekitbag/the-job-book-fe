import { describe, expect, it } from 'vitest'
import { openDB } from 'idb'
import { Blob as NodeBlob } from 'node:buffer'
import {
  getAllNotes,
  getNotesForJob,
  patchNote,
  saveNote,
  savePhoto,
  getAllPhotos,
} from '../db'
import { captureIdentity } from '../localOwner'
import { makeNote } from './helpers'

describe('capture database foundation', () => {
  it('upgrades an actual v1 database without losing an unsent note, blob or state', async () => {
    const note = makeNote({
      blob: new NodeBlob(['unsent audio']) as unknown as Blob,
      localState: 'upload_failed',
      uploadAttemptCount: 2,
    })
    const old = await openDB('job-book', 1, {
      upgrade(db) {
        const store = db.createObjectStore('notes', { keyPath: 'clientNoteId' })
        store.createIndex('by-jobId', 'jobId')
      },
    })
    await old.put('notes', note)
    old.close()
    const [saved] = await getAllNotes()
    expect(saved.clientNoteId).toBe(note.clientNoteId)
    expect(saved.localState).toBe('upload_failed')
    expect(saved.uploadAttemptCount).toBe(2)
    expect(await saved.blob.text()).toBe('unsent audio')
    const upgraded = await openDB('job-book')
    expect(upgraded.version).toBe(2)
    expect(upgraded.objectStoreNames.contains('photos')).toBe(true)
    upgraded.close()
  })
  it('applies concurrent job choice and upload completion in atomic transactions', async () => {
    const note = makeNote()
    await saveNote(note)
    await Promise.all([
      patchNote(note.clientNoteId, {
        localState: 'uploaded',
        serverNoteId: 'real-server-id',
      }),
      patchNote(note.clientNoteId, { jobId: 'chosen-job' }),
    ])
    const [saved] = await getAllNotes()
    expect(saved.jobId).toBe('chosen-job')
    expect(saved.localState).toBe('uploaded')
    expect(saved.serverNoteId).toBe('real-server-id')
  })
  it('lists a null-job note without passing null as an IndexedDB index key', async () => {
    const note = makeNote({ ...captureIdentity(), jobId: null })
    await saveNote(note)
    expect((await getNotesForJob(null)).map((n) => n.clientNoteId)).toEqual([
      note.clientNoteId,
    ])
    expect(await getNotesForJob('a-job')).toEqual([])
  })
  it('fails promptly when an old page blocks upgrade, and can save after that page closes', async () => {
    const old = await openDB('job-book', 1, {
      upgrade(db) {
        const s = db.createObjectStore('notes', { keyPath: 'clientNoteId' })
        s.createIndex('by-jobId', 'jobId')
      },
    })
    try {
      const result = await Promise.race([
        getAllNotes().then(
          () => 'opened',
          (e) => e.code,
        ),
        new Promise((resolve) => setTimeout(() => resolve('hung'), 100)),
      ])
      expect(result).toBe('STORAGE_BLOCKED')
      const save = await Promise.race([
        saveNote(makeNote()).then(
          () => 'saved',
          (e) => e.code,
        ),
        new Promise((resolve) => setTimeout(() => resolve('hung'), 100)),
      ])
      expect(save).toBe('STORAGE_BLOCKED')
    } finally {
      old.close()
    }
    const ready = await openDB('job-book', 2)
    ready.close()
    const note = makeNote()
    await saveNote(note)
    expect((await getAllNotes())[0].clientNoteId).toBe(note.clientNoteId)
  })
  it('closes its connection when a newer page needs to upgrade', async () => {
    await saveNote(makeNote())
    const result = await Promise.race([
      openDB('job-book', 3).then((db) => {
        const version = db.version
        db.close()
        return version
      }),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 100)),
    ])
    expect(result).toBe(3)
  })
  it('stores photo blobs durably in the photos store', async () => {
    const blob = new NodeBlob(['photo bytes'], {
      type: 'image/jpeg',
    }) as unknown as Blob
    await savePhoto({
      ...captureIdentity(),
      clientPhotoId: 'photo-one',
      jobId: 'job-a',
      ownerUserId: null,
      blob,
      mimeType: 'image/jpeg',
      sizeBytes: blob.size,
      capturedAt: new Date().toISOString(),
      localState: 'saved_local',
      uploadAttemptCount: 0,
      lastUploadAttemptAt: null,
      lastErrorCode: null,
      serverPhotoId: null,
    })
    const [photo] = await getAllPhotos()
    expect(photo.clientPhotoId).toBe('photo-one')
    expect(await photo.blob.text()).toBe('photo bytes')
  })
})
