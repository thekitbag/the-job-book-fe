import { expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import CaptureFlow from '../CaptureFlow'
import * as api from '../api'
import type { Job } from '../types'
const state = vi.hoisted(() => ({
  flow: null as unknown,
  setFlow: vi.fn(),
  setMessage: vi.fn(),
  syncAll: vi.fn(),
}))
vi.mock('../CaptureSyncProvider', () => ({ useCaptureContext: () => state }))
vi.mock('../useLocalCaptures', () => ({
  useLocalCaptures: () => ({ notes: [], photos: [] }),
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  fileCaptureNote: vi.fn(),
}))
const job = (id: string, title: string): Job => ({
  id,
  title,
  status: 'started',
  jobType: 'other',
  createdAt: '',
  updatedAt: '',
  roughLocationOrLabel: null,
})
const jobs = [job('job', 'Garden Room'), job('shed', 'Shed')]
const props = {
  jobs,
  home: null,
  online: true,
  onJobAdded: vi.fn(),
  onOpenJob: vi.fn(),
  onOpenChecks: vi.fn(),
}
it('ignores a late filing response after he has closed that picker', async () => {
  state.flow = {
    mode: 'picker',
    target: {
      kind: 'note',
      serverId: 'srv',
      jobId: null,
      at: new Date().toISOString(),
      context: 'home',
    },
  }
  let finish!: () => void
  vi.mocked(api.fileCaptureNote).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({ jobId: 'job' } as Awaited<
            ReturnType<typeof api.fileCaptureNote>
          >)
      }),
  )
  render(<CaptureFlow {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Garden Room' }))
  fireEvent.click(screen.getByRole('button', { name: 'Later' }))
  await act(async () => finish())
  expect(state.setFlow).not.toHaveBeenCalledWith(
    expect.objectContaining({ mode: 'saved' }),
  )
})
it('does not offer the job an item is already in when moving it', () => {
  state.flow = {
    mode: 'move',
    target: {
      kind: 'note',
      serverId: 'srv',
      jobId: 'job',
      at: new Date().toISOString(),
      context: 'job',
    },
  }
  render(<CaptureFlow {...props} />)
  const dialog = within(screen.getByRole('dialog'))
  expect(
    dialog.queryByRole('button', { name: 'Garden Room' }),
  ).not.toBeInTheDocument()
  expect(dialog.getByRole('button', { name: 'Shed' })).toBeVisible()
})
