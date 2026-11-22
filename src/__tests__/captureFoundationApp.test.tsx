import { Blob as NodeBlob } from 'node:buffer'
import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import * as api from '../api'
import * as db from '../db'
import type { RecordingResult } from '../useRecorder'
import type { Job } from '../types'
const recorder = vi.hoisted(() => ({
  state: 'idle' as const,
  elapsedMs: 0,
  mimeType: 'audio/webm;codecs=opus',
  permissionError: null,
  start: vi.fn(),
  stop: vi.fn(),
  complete: null as ((r: RecordingResult) => void | Promise<void>) | null,
}))
vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  useRecorder: () => recorder,
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof api>()),
  getJobs: vi.fn(),
  getCurrentUser: vi.fn(async () => ({
    id: 'builder-a',
    name: 'Mike',
    email: 'mike@test',
    role: 'PILOT' as const,
  })),
  getMemoryView: vi.fn(async () => ({
    job: JOB,
    generatedAt: '',
    sections: [],
    hours: { totalHours: '0', people: [], days: [] },
    stillToCheck: { count: 0, items: [] },
  })),
  getReviewQueue: vi.fn(async () => ({
    jobId: JOB.id,
    generatedAt: '',
    sections: [],
    alreadyRemembered: [],
  })),
  getJobNoteStatuses: vi.fn(async () => []),
  getDraftFacts: vi.fn(async () => []),
  getWorkshop: vi.fn(async () => ({
    generatedAt: '',
    availableItems: [],
    bookHome: {
      showWorkshopRow: true,
      availableCount: 0,
      availableLabel: null,
      previewItems: [],
    },
  })),
  uploadNote: vi.fn(async (n) => ({
    noteId: 'server-id',
    clientNoteId: n.clientNoteId,
    status: 'uploaded',
    isDuplicate: false,
  })),
}))
vi.mock('../db', async (original) => ({
  ...(await original<typeof db>()),
  saveNote: vi.fn(),
}))
const JOB: Job = {
  id: 'job-foundation',
  title: 'Garden Room',
  jobType: 'garden_room',
  status: 'started',
  roughLocationOrLabel: null,
  createdAt: '',
  updatedAt: '',
}
beforeEach(async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.mocked(api.getJobs).mockResolvedValue([JOB])
  recorder.complete = null
  recorder.start.mockImplementation(async (callback) => {
    recorder.complete = callback
    return true
  })
  const actual = await vi.importActual<typeof db>('../db')
  vi.mocked(db.saveNote).mockImplementation(actual.saveNote)
})
const result: RecordingResult = {
  blob: new NodeBlob(['recorded audio']) as unknown as Blob,
  durationMs: 3000,
  mimeType: 'audio/webm;codecs=opus',
}
it('paints the cached job with working Record while getJobs hangs', async () => {
  localStorage.setItem('job-book-cached-jobs', JSON.stringify([JOB]))
  localStorage.setItem('job-book-owner-user-id', 'builder-a')
  vi.mocked(api.getJobs).mockReturnValue(new Promise(() => {}))
  render(<App />)
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
  await waitFor(() => expect(recorder.start).toHaveBeenCalled())
})
it('lets a signed-in builder record offline without any cached jobs', async () => {
  localStorage.setItem('job-book-owner-user-id', 'builder-a')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  vi.mocked(api.getJobs).mockRejectedValue(new Error('offline'))
  vi.mocked(api.getCurrentUser).mockRejectedValue(new Error('offline'))
  render(<App />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Start recording' }),
  )
  await waitFor(() => expect(recorder.complete).toBeTruthy())
  await act(async () => {
    await recorder.complete!(result)
  })
  const [note] = await db.getAllNotes()
  expect(note.jobId).toBeNull()
  expect(note.ownerUserId).toBe('builder-a')
  expect(note.blob.size).toBe(result.blob.size)
  expect(api.uploadNote).not.toHaveBeenCalled()
})
it('shows a failed save and retains the exact blob for retry across screen navigation', async () => {
  vi.mocked(db.saveNote).mockRejectedValueOnce(
    new DOMException('Full', 'QuotaExceededError'),
  )
  render(<App />)
  await screen.findByRole('heading', { name: JOB.title })
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
  await waitFor(() => expect(recorder.complete).toBeTruthy())
  await act(async () => {
    await recorder.complete!(result)
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(/wasn.t saved/i)
  expect(screen.queryByText('Voice note saved')).not.toBeInTheDocument()
  expect(api.uploadNote).not.toHaveBeenCalled()
  const first = vi.mocked(db.saveNote).mock.calls[0][0]
  fireEvent.click(screen.getByRole('button', { name: /the job book/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Try saving again' }))
  await waitFor(() => expect(db.saveNote).toHaveBeenCalledTimes(2))
  const retry = vi.mocked(db.saveNote).mock.calls[1][0]
  expect(retry.blob).toBe(first.blob)
  expect(retry.clientNoteId).toBe(first.clientNoteId)
  expect(retry.jobId).toBe(JOB.id)
  await waitFor(async () =>
    expect((await db.getAllNotes())[0].serverNoteId).toBe('server-id'),
  )
})
it('keeps a 401 as sign-in and clears the cached owner', async () => {
  localStorage.setItem('job-book-owner-user-id', 'builder-a')
  vi.mocked(api.getJobs).mockRejectedValue(
    new api.ApiError('Unauthenticated', 401),
  )
  render(<App />)
  expect(
    await screen.findByRole('heading', { name: /the job book/i }),
  ).toBeVisible()
  await waitFor(() =>
    expect(localStorage.getItem('job-book-owner-user-id')).toBeNull(),
  )
  expect(
    screen.queryByRole('button', { name: 'Start recording' }),
  ).not.toBeInTheDocument()
})

it('does not reopen an acknowledged save when returning to the job', async () => {
  render(<App />)
  await screen.findByRole('heading', { name: JOB.title })
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
  await waitFor(() => expect(recorder.complete).toBeTruthy())
  await act(async () => {
    await recorder.complete!(result)
  })
  await screen.findByRole('dialog', { name: 'Recording saved' })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: /the job book/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^jobs/i }))
  fireEvent.click(screen.getByRole('button', { name: /garden room/i }))
  await screen.findByRole('heading', { name: JOB.title })
  expect(
    screen.queryByRole('dialog', { name: 'Recording saved' }),
  ).not.toBeInTheDocument()
})

it('keeps Record available without presenting pending jobs as an empty book', async () => {
  let finish!: (jobs: Job[]) => void
  vi.mocked(api.getJobs).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  render(<App />)
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: /^All jobs/ }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'New job' }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
  await waitFor(() => expect(recorder.start).toHaveBeenCalledOnce())
  await act(async () => finish([]))
  expect(
    await screen.findByRole('heading', { name: /^All jobs/ }),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'New job' })).toBeVisible()
})
