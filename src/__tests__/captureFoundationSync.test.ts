import { beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as db from '../db'
import { useSync } from '../useSync'
import { uploadNote, uploadCaptureNote } from '../api'
import { ApiError } from '../api/client'
import {
  beginSignedInSession,
  captureIdentity,
  clearLocalOwner,
  establishLocalOwner,
  getCaptureSessionId,
} from '../localOwner'
import { makeNote } from './helpers'
vi.mock('../api', () => ({
  uploadNote: vi.fn(),
  uploadCaptureNote: vi.fn(async (n) => ({
    id: 'server-' + n.clientNoteId,
    clientNoteId: n.clientNoteId,
    jobId: n.jobId,
    filedAt: null,
    captureContext: 'home',
    serverStatus: 'UPLOADED',
  })),
  fileCaptureNote: vi.fn(),
}))
beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
const success = (n: Parameters<typeof uploadNote>[0]) => ({
  noteId: 'server-' + n.clientNoteId,
  clientNoteId: n.clientNoteId,
  status: 'uploaded',
  isDuplicate: false,
})

it('reads the latest job immediately before upload instead of using the scan snapshot', async () => {
  const note = makeNote()
  await db.saveNote(note)
  const scan = db.getPendingNotes
  vi.spyOn(db, 'getPendingNotes').mockImplementationOnce(async () => {
    const stale = await scan()
    await db.patchNote(note.clientNoteId, { jobId: 'chosen-during-scan' })
    return stale
  })
  vi.mocked(uploadNote).mockImplementation(async (n) => success(n))
  renderHook(() => useSync(vi.fn()))
  await waitFor(() => expect(uploadNote).toHaveBeenCalled())
  expect(vi.mocked(uploadNote).mock.calls[0][0].jobId).toBe(
    'chosen-during-scan',
  )
})
it('rereads after upload and preserves a concurrent job choice with the server id', async () => {
  const note = makeNote()
  await db.saveNote(note)
  let complete!: () => void
  vi.mocked(uploadNote).mockImplementation(async (n) => {
    await new Promise<void>((r) => {
      complete = r
    })
    return success(n)
  })
  renderHook(() => useSync(vi.fn()))
  await waitFor(() => expect(uploadNote).toHaveBeenCalledOnce())
  await db.patchNote(note.clientNoteId, { jobId: 'chosen-while-uploading' })
  await act(async () => complete())
  await waitFor(async () =>
    expect((await db.getAllNotes())[0].localState).toBe('uploaded'),
  )
  expect((await db.getAllNotes())[0].jobId).toBe('chosen-while-uploading')
  expect((await db.getAllNotes())[0].serverNoteId).toBe(
    'server-' + note.clientNoteId,
  )
})
it('uploads an owned null-job capture through the new unfiled route', async () => {
  beginSignedInSession('a')
  await db.saveNote(makeNote({ ...captureIdentity(), jobId: null }))
  vi.mocked(uploadNote).mockImplementation(async (n) => success(n))
  renderHook(() => useSync(vi.fn()))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
  expect(uploadNote).not.toHaveBeenCalled()
  expect(uploadCaptureNote).toHaveBeenCalledOnce()
  expect((await db.getAllNotes())[0].localState).toBe('uploaded')
})
it('does not upload or reset another account’s pending recordings', async () => {
  beginSignedInSession('a')
  const note = makeNote({ ...captureIdentity(), localState: 'uploading' })
  await db.saveNote(note)
  clearLocalOwner()
  beginSignedInSession('b')
  vi.mocked(uploadNote).mockImplementation(async (n) => success(n))
  const { unmount } = renderHook(() => useSync(vi.fn()))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
  expect(uploadNote).not.toHaveBeenCalled()
  expect(await db.getAllNotes()).toEqual([])
  unmount()
  clearLocalOwner()
  beginSignedInSession('a')
  expect((await db.getAllNotes())[0].localState).toBe('uploading')
})
it('keeps an unknown capture quarantined across sign-in instead of claiming it for the next user', async () => {
  clearLocalOwner()
  await db.saveNote(makeNote({ ...captureIdentity(), jobId: null }))
  beginSignedInSession('b')
  vi.mocked(uploadNote).mockImplementation(async (n) => success(n))
  renderHook(() => useSync(vi.fn()))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
  expect(uploadNote).not.toHaveBeenCalled()
})
it('starts syncing same-session captures once a successful user lookup stamps them', async () => {
  clearLocalOwner()
  const session = getCaptureSessionId()
  await db.saveNote(makeNote({ ...captureIdentity() }))
  vi.mocked(uploadNote).mockImplementation(async (n) => success(n))
  renderHook(() => useSync(vi.fn()))
  await act(async () => {
    establishLocalOwner('a', session)
    await db.stampUnownedCaptures('a', session)
  })
  await waitFor(() => expect(uploadCaptureNote).toHaveBeenCalledOnce())
  expect(vi.mocked(uploadCaptureNote).mock.calls[0][0].ownerUserId).toBe('a')
})
it('syncs on foreground return without needing a job screen or a new online event', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await db.saveNote(makeNote())
  vi.mocked(uploadNote).mockImplementation(async (n) => success(n))
  renderHook(() => useSync(vi.fn()))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await waitFor(() => expect(uploadNote).toHaveBeenCalledOnce())
})
it('keeps rejected media on the phone without consuming network retry attempts', async () => {
  await db.saveNote(makeNote())
  vi.mocked(uploadNote).mockRejectedValue(
    Object.assign(new ApiError('Unsupported media', 415), {
      code: 'UNSUPPORTED_MEDIA_TYPE',
    }),
  )
  renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getAllNotes())[0].localState).toBe(
      'upload_needs_attention',
    ),
  )
  expect((await db.getAllNotes())[0].uploadAttemptCount).toBe(0)
  expect((await db.getAllNotes())[0].lastErrorCode).toBe(
    'UNSUPPORTED_MEDIA_TYPE',
  )
})

it('lists and uploads an ownerless job recording from any earlier boundary through its job route', async () => {
  clearLocalOwner()
  const note = makeNote({ ...captureIdentity(), jobId: 'original-job' })
  await db.saveNote(note)
  beginSignedInSession('b')
  expect((await db.getNotesForJob('original-job'))[0].clientNoteId).toBe(
    note.clientNoteId,
  )
  vi.mocked(uploadNote).mockImplementation(async (n) => success(n))
  renderHook(() => useSync(vi.fn()))
  await waitFor(() => expect(uploadNote).toHaveBeenCalledOnce())
  expect(vi.mocked(uploadNote).mock.calls[0][0].jobId).toBe('original-job')
  expect(vi.mocked(uploadNote).mock.calls[0][0].ownerUserId).toBeNull()
  await waitFor(async () =>
    expect((await db.getAllNotes())[0].localState).toBe('uploaded'),
  )
})
