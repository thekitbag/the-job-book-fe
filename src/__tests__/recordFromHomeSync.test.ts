import { beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { Blob as NodeBlob } from 'node:buffer'
import * as api from '../api'
import * as db from '../db'
import { useSync } from '../useSync'
import { beginSignedInSession, captureIdentity } from '../localOwner'
import { makeNote } from './helpers'
vi.mock('../api', () => ({
  uploadNote: vi.fn(),
  uploadCaptureNote: vi.fn(),
  fileCaptureNote: vi.fn(),
  getCaptureDraft: vi.fn(),
  uploadCapturePhoto: vi.fn(),
  fileCapturePhoto: vi.fn(),
}))
const reply = (jobId: string | null) => ({
  id: 'real-id',
  clientNoteId: 'client',
  jobId,
  filedAt: jobId ? '2026-11-23' : null,
  captureContext: 'home' as const,
  serverStatus: 'UPLOADED',
})
beforeEach(() => {
  beginSignedInSession('a')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
async function save(jobId: string | null = null) {
  const n = makeNote({ ...captureIdentity(), jobId, captureContext: 'home' })
  await db.saveNote(n)
  return n
}
const failed = (status: number, code: string) =>
  Object.assign(new Error(code), { status, code })

it('uploads owned unfiled audio and files a job chosen while the request is in flight', async () => {
  const n = await save()
  let finish!: (value: ReturnType<typeof reply>) => void
  vi.mocked(api.uploadCaptureNote).mockReturnValue(
    new Promise((r) => {
      finish = r
    }),
  )
  vi.mocked(api.fileCaptureNote).mockResolvedValue(reply('picked'))
  renderHook(() => useSync(vi.fn()))
  await waitFor(() => expect(api.uploadCaptureNote).toHaveBeenCalledOnce())
  await db.patchNote(n.clientNoteId, { jobId: 'picked' })
  await act(async () => finish(reply(null)))
  await waitFor(() =>
    expect(api.fileCaptureNote).toHaveBeenCalledWith('real-id', 'picked'),
  )
  await waitFor(async () =>
    expect((await db.getNote(n.clientNoteId))?.localState).toBe('uploaded'),
  )
  expect(await db.getNote(n.clientNoteId)).toMatchObject({
    jobId: 'picked',
    serverJobId: 'picked',
    serverNoteId: 'real-id',
  })
})
it('uses the server job when an upload retry returns a different filed job', async () => {
  const n = await save('local-choice')
  vi.mocked(api.uploadCaptureNote).mockResolvedValue(reply('actual-job'))
  renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getNote(n.clientNoteId))?.jobId).toBe('actual-job'),
  )
  expect(api.fileCaptureNote).not.toHaveBeenCalled()
})
it('retains the uploaded server id after a file failure and retries only filing', async () => {
  const n = await save('picked')
  vi.mocked(api.uploadCaptureNote).mockResolvedValue(reply(null))
  vi.mocked(api.fileCaptureNote)
    .mockRejectedValueOnce(failed(503, 'UNAVAILABLE'))
    .mockResolvedValue(reply('picked'))
  const { result } = renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getNote(n.clientNoteId))?.localState).toBe(
      'upload_failed',
    ),
  )
  expect((await db.getNote(n.clientNoteId))?.serverNoteId).toBe('real-id')
  await act(async () => {
    await result.current.retryNote(n.clientNoteId)
  })
  expect(api.uploadCaptureNote).toHaveBeenCalledOnce()
  expect(api.fileCaptureNote).toHaveBeenCalledTimes(2)
})
it('rereads the draft on NOTE_ALREADY_FILED and keeps its actual job', async () => {
  const n = await save('picked')
  await db.patchNote(n.clientNoteId, {
    serverNoteId: 'real-id',
    serverJobId: null,
  })
  vi.mocked(api.fileCaptureNote).mockRejectedValue(
    failed(409, 'NOTE_ALREADY_FILED'),
  )
  vi.mocked(api.getCaptureDraft).mockResolvedValue({
    noteId: 'real-id',
    jobId: 'actual',
    state: 'ready',
    transcriptText: null,
    items: [],
    moreToCheckCount: 0,
  })
  renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getNote(n.clientNoteId))?.jobId).toBe('actual'),
  )
  expect(api.getCaptureDraft).toHaveBeenCalledWith('real-id')
})
it.each([
  [409, 'JOB_NOT_FILEABLE'],
  [404, 'JOB_NOT_FOUND'],
])(
  'uploads an owned note unfiled when its chosen job cannot be filed (%s)',
  async (status, code) => {
    const n = await save('archived')
    vi.mocked(api.uploadCaptureNote)
      .mockRejectedValueOnce(failed(status, code))
      .mockResolvedValue(reply(null))
    renderHook(() => useSync(vi.fn()))
    await waitFor(async () =>
      expect((await db.getNote(n.clientNoteId))?.localState).toBe('uploaded'),
    )
    expect((await db.getNote(n.clientNoteId))?.jobId).toBeNull()
    expect(vi.mocked(api.uploadCaptureNote).mock.calls[1][0].jobId).toBeNull()
  },
)
it('does not reinterpret ownerless legacy audio as unfiled when its job rejects upload', async () => {
  const n = makeNote({ jobId: 'legacy' })
  await db.saveNote(n)
  vi.mocked(api.uploadNote).mockRejectedValue(failed(404, 'JOB_NOT_FOUND'))
  renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getNote(n.clientNoteId))?.localState).toBe(
      'upload_needs_attention',
    ),
  )
  expect((await db.getNote(n.clientNoteId))?.jobId).toBe('legacy')
  expect(api.uploadCaptureNote).not.toHaveBeenCalled()
})
async function photo() {
  const p = {
    ...captureIdentity(),
    clientPhotoId: 'photo',
    jobId: 'picked',
    capturedAt: '2026-11-23',
    mimeType: 'image/jpeg',
    blob: new NodeBlob(['photo']) as unknown as Blob,
    sizeBytes: 5,
    localState: 'saved_local' as const,
    uploadAttemptCount: 0,
    lastUploadAttemptAt: null,
    lastErrorCode: null,
    serverPhotoId: 'real-photo',
    serverJobId: null,
    captureContext: 'home' as const,
  }
  await db.savePhoto(p)
  return p
}
it('recovers PHOTO_ALREADY_FILED by repeating the photo upload without a job', async () => {
  await photo()
  vi.mocked(api.fileCapturePhoto).mockRejectedValue(
    failed(409, 'PHOTO_ALREADY_FILED'),
  )
  vi.mocked(api.uploadCapturePhoto).mockResolvedValue({
    id: 'real-photo',
    clientPhotoId: 'photo',
    jobId: 'actual',
    filedAt: 'now',
    captureContext: 'home',
    uploadedAt: 'now',
    fileUrl: '/api/photos/real-photo/file',
  })
  renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getAllPhotos())[0].jobId).toBe('actual'),
  )
  expect(api.uploadCapturePhoto).toHaveBeenCalledWith(
    expect.objectContaining({ clientPhotoId: 'photo', jobId: null }),
  )
})
it('stops retrying a removed photo after conflict recovery returns 404 and retains its bytes', async () => {
  await photo()
  vi.mocked(api.fileCapturePhoto).mockRejectedValue(
    failed(409, 'PHOTO_ALREADY_FILED'),
  )
  vi.mocked(api.uploadCapturePhoto).mockRejectedValue(
    failed(404, 'PHOTO_NOT_FOUND'),
  )
  renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getAllPhotos())[0].localState).toBe(
      'upload_needs_attention',
    ),
  )
  expect((await db.getAllPhotos())[0].blob.size).toBe(5)
})

it('uses a photo upload response’s real job instead of a different local choice', async () => {
  const p = await photo()
  await db.patchPhoto(p.clientPhotoId, { serverPhotoId: null })
  vi.mocked(api.uploadCapturePhoto).mockResolvedValue({
    id: 'server-photo-id',
    clientPhotoId: p.clientPhotoId,
    jobId: 'real-job',
    filedAt: 'now',
    captureContext: 'home',
    uploadedAt: 'now',
    fileUrl: '/api/photos/server-photo-id/file',
  })
  renderHook(() => useSync(vi.fn()))
  await waitFor(async () =>
    expect((await db.getAllPhotos())[0].jobId).toBe('real-job'),
  )
  expect(api.fileCapturePhoto).not.toHaveBeenCalled()
  expect((await db.getAllPhotos())[0].serverPhotoId).toBe('server-photo-id')
})
