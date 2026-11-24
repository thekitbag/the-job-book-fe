import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import JobLog from '../JobLog'
import { saveNote, patchNote, savePhoto } from '../db'
import { createCapturedPhoto } from '../capturePersistence'
import { beginSignedInSession } from '../localOwner'
import { makeNote } from './helpers'
import * as api from '../api'
const actions = vi.hoisted(() => ({
  retryNote: vi.fn(),
  retryPhoto: vi.fn(),
  openMove: vi.fn(),
}))
vi.mock('../CaptureSyncProvider', () => ({ useCaptureContext: () => actions }))
vi.mock('../api', () => ({
  getJobLog: vi.fn(async () => ({ entries: [] })),
  resolveApiUrl: (s: string) => s,
}))
it('keeps unsent audio visible with Retry, including when the server log fails', async () => {
  const n = makeNote({ jobId: 'job', localState: 'upload_failed' })
  await saveNote(n)
  vi.mocked(api.getJobLog).mockRejectedValue(new Error('offline'))
  render(<JobLog jobId="job" />)
  expect(
    await screen.findByText('Will retry when there’s signal.'),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(actions.retryNote).toHaveBeenCalledWith(n.clientNoteId)
  await patchNote(n.clientNoteId, { jobId: 'elsewhere' })
  await waitFor(() =>
    expect(
      screen.queryByText('Will retry when there’s signal.'),
    ).not.toBeInTheDocument(),
  )
})

it('does not bring back an uploaded photo the server log no longer has', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  beginSignedInSession('a')
  const file = new File(['p'], 'p.jpg', { type: 'image/jpeg' })
  const removed = await createCapturedPhoto(file, 'job')
  await savePhoto({
    ...removed,
    localState: 'uploaded',
    serverPhotoId: 's1',
    serverJobId: 'job',
  })
  const unsent = await createCapturedPhoto(file, 'job')
  await savePhoto(unsent)
  vi.mocked(api.getJobLog).mockReset().mockResolvedValue({ entries: [] })
  render(<JobLog jobId="job" />)
  await waitFor(() => expect(api.getJobLog).toHaveBeenCalled())
  await waitFor(() => expect(screen.getAllByText(/^Photo ·/)).toHaveLength(1))
})

it('offers Move on photos but not on receipts', async () => {
  const base = {
    kind: 'photo' as const,
    at: '2026-11-23T10:00:00Z',
    fileKind: 'IMAGE' as const,
    descriptor: null,
    linkedNoteId: null,
  }
  vi.mocked(api.getJobLog)
    .mockReset()
    .mockResolvedValue({
      entries: [
        {
          ...base,
          id: 'p',
          photoId: 'p',
          fileUrl: '/api/jobs/job/photos/p/file',
        },
        {
          ...base,
          id: 'r',
          photoId: 'r',
          fileUrl: '/api/jobs/job/receipts/r/file',
        },
      ],
    })
  render(<JobLog jobId="job" />)
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: 'Photo actions' }),
    ).toHaveLength(1),
  )
})
