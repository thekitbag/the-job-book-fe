import { expect, it } from 'vitest'
import {
  getAllNotes,
  getAllPhotos,
  saveNote,
  savePhoto,
  stampUnownedCaptures,
  patchNote,
} from '../db'
import {
  beginSignedInSession,
  clearLocalOwner,
  establishLocalOwner,
  getCaptureSessionId,
  getLocalOwnerId,
  captureIdentity,
} from '../localOwner'
import { makeNote } from './helpers'

it('caches the signed-in owner for a cold offline capture and clears it on logout', () => {
  beginSignedInSession('builder-a')
  expect(getLocalOwnerId()).toBe('builder-a')
  expect(localStorage.getItem('job-book-owner-user-id')).toBe('builder-a')
  clearLocalOwner()
  expect(getLocalOwnerId()).toBeNull()
  expect(localStorage.getItem('job-book-owner-user-id')).toBeNull()
})
it('claims only unknown-owner notes/photos from the same session, preserving legacy notes', async () => {
  clearLocalOwner()
  const session = getCaptureSessionId()
  await saveNote(makeNote({ ...captureIdentity(), jobId: null }))
  const legacy = makeNote({ jobId: 'legacy-job' })
  await saveNote(legacy)
  const blob = new Blob(['photo'])
  await savePhoto({
    ...captureIdentity(),
    clientPhotoId: 'p',
    jobId: null,
    blob,
    mimeType: 'image/jpeg',
    sizeBytes: blob.size,
    capturedAt: '2026-11-22T12:00:00Z',
    localState: 'saved_local',
    uploadAttemptCount: 0,
    lastUploadAttemptAt: null,
    lastErrorCode: null,
    serverPhotoId: null,
  })
  expect(establishLocalOwner('builder-a', session)).toBe(true)
  await stampUnownedCaptures('builder-a', session)
  expect((await getAllNotes()).find((n) => n.jobId === null)?.ownerUserId).toBe(
    'builder-a',
  )
  expect((await getAllPhotos())[0].ownerUserId).toBe('builder-a')
  expect(
    (await getAllNotes()).find((n) => n.clientNoteId === legacy.clientNoteId)
      ?.ownerUserId,
  ).toBeUndefined()
})
it('does not let a late lookup claim unknown captures after another sign-in', async () => {
  clearLocalOwner()
  const session = getCaptureSessionId()
  await saveNote(makeNote({ ...captureIdentity(), jobId: null }))
  beginSignedInSession('builder-b')
  expect(establishLocalOwner('builder-a', session)).toBe(false)
  await stampUnownedCaptures('builder-a', session)
  expect(getLocalOwnerId()).toBe('builder-b')
  expect(await getAllNotes()).toEqual([])
})
it('does not list or patch another owner’s notes/photos on a shared phone', async () => {
  beginSignedInSession('builder-a')
  const a = makeNote({ ...captureIdentity(), jobId: 'job-a' })
  await saveNote(a)
  const blob = new Blob(['private photo'])
  await savePhoto({
    ...captureIdentity(),
    clientPhotoId: 'private-photo',
    jobId: null,
    blob,
    mimeType: 'image/jpeg',
    sizeBytes: blob.size,
    capturedAt: '2026-11-22T12:00:00Z',
    localState: 'saved_local',
    uploadAttemptCount: 0,
    lastUploadAttemptAt: null,
    lastErrorCode: null,
    serverPhotoId: null,
  })
  clearLocalOwner()
  beginSignedInSession('builder-b')
  expect(await getAllNotes()).toEqual([])
  expect(await getAllPhotos()).toEqual([])
  await patchNote(a.clientNoteId, { jobId: 'job-b' })
  clearLocalOwner()
  beginSignedInSession('builder-a')
  expect((await getAllNotes())[0].jobId).toBe('job-a')
  expect((await getAllPhotos())[0].clientPhotoId).toBe('private-photo')
})
