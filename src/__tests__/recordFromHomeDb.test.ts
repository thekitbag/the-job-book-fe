import { expect, it } from 'vitest'
import {
  beginSignedInSession,
  captureIdentity,
  clearLocalOwner,
} from '../localOwner'
import {
  saveNote,
  getAllNotes,
  getUnmatchedNotes,
  claimUnmatchedNote,
  savePhoto,
  getAllPhotos,
} from '../db'
import { makeNote } from './helpers'
import { createCapturedPhoto } from '../capturePersistence'
it('requires an explicit claim for old-boundary unfiled audio and never claims another owner’s note', async () => {
  clearLocalOwner()
  const unknown = makeNote({ ...captureIdentity(), jobId: null })
  await saveNote(unknown)
  beginSignedInSession('a')
  await saveNote(makeNote({ ...captureIdentity(), jobId: null }))
  beginSignedInSession('b')
  expect((await getUnmatchedNotes()).map((n) => n.clientNoteId)).toEqual([
    unknown.clientNoteId,
  ])
  expect(await getAllNotes()).toEqual([])
  await claimUnmatchedNote(unknown.clientNoteId)
  expect((await getAllNotes())[0].ownerUserId).toBe('b')
  expect(await getUnmatchedNotes()).toEqual([])
})
it('copies picked file bytes into a durable Blob before storing, with an owner and retry id', async () => {
  beginSignedInSession('a')
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
  const photo = await createCapturedPhoto(file, null)
  expect(photo.blob).not.toBe(file)
  expect(photo.ownerUserId).toBe('a')
  expect(photo.clientPhotoId).toBeTruthy()
  await savePhoto(photo)
  expect((await getAllPhotos())[0].sizeBytes).toBe(5)
})
it('rejects a photo above 15 MiB before attempting to read or store its bytes', async () => {
  const file = {
    size: 15 * 1024 * 1024 + 1,
    arrayBuffer: () => {
      throw new Error('Should not read')
    },
  } as unknown as File
  await expect(createCapturedPhoto(file, null)).rejects.toThrow(/15 MB/)
  expect(await getAllPhotos()).toEqual([])
})
