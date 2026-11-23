import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import JobLog from '../JobLog'
import { saveNote, patchNote } from '../db'
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
