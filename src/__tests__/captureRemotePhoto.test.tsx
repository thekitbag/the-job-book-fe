import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaptureFlow from '../CaptureFlow'
import * as api from '../api'
const state = vi.hoisted(() => ({
  flow: {
    mode: 'picker',
    target: {
      kind: 'photo',
      serverId: 'remote',
      jobId: null,
      at: '2026-11-23',
      context: 'home',
    },
  },
  setFlow: vi.fn(),
  setMessage: vi.fn(),
}))
vi.mock('../CaptureSyncProvider', () => ({ useCaptureContext: () => state }))
vi.mock('../useLocalCaptures', () => ({
  useLocalCaptures: () => ({ notes: [], photos: [] }),
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  fileCapturePhoto: vi.fn(),
}))
it('treats a remote-only photo conflict as neutral, refreshes and never reports Saved to a job', async () => {
  vi.mocked(api.fileCapturePhoto).mockRejectedValue(
    Object.assign(new Error('filed'), {
      code: 'PHOTO_ALREADY_FILED',
      status: 409,
    }),
  )
  render(
    <CaptureFlow
      jobs={[
        {
          id: 'job',
          title: 'Garden Room',
          status: 'started',
          jobType: 'other',
          createdAt: '',
          updatedAt: '',
          roughLocationOrLabel: null,
        },
      ]}
      home={null}
      online
      onJobAdded={vi.fn()}
      onOpenJob={vi.fn()}
      onOpenChecks={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Garden Room' }))
  await waitFor(() =>
    expect(state.setMessage).toHaveBeenCalledWith(
      'This photo has already been filed',
    ),
  )
  expect(state.setFlow).toHaveBeenCalledWith(null)
  expect(screen.queryByText(/Saved to/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('treats a remote-only missing photo as neutral without claiming a destination', async () => {
  vi.mocked(api.fileCapturePhoto).mockRejectedValue(
    Object.assign(new Error('gone'), { code: 'PHOTO_NOT_FOUND', status: 404 }),
  )
  render(
    <CaptureFlow
      jobs={[
        {
          id: 'job',
          title: 'Garden Room',
          status: 'started',
          jobType: 'other',
          createdAt: '',
          updatedAt: '',
          roughLocationOrLabel: null,
        },
      ]}
      home={null}
      online
      onJobAdded={vi.fn()}
      onOpenJob={vi.fn()}
      onOpenChecks={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Garden Room' }))
  await waitFor(() =>
    expect(state.setMessage).toHaveBeenCalledWith(
      'This photo is no longer here',
    ),
  )
  expect(state.setFlow).toHaveBeenCalledWith(null)
})
