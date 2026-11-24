import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import UnfiledScreen from '../UnfiledScreen'
import * as api from '../api'
import type { LocalNote } from '../types'
import type { UnfiledCaptures } from '../captureTypes'
import { makeNote } from './helpers'
const local = vi.hoisted(() => ({ notes: [] as LocalNote[], photos: [] }))
beforeEach(() => {
  local.notes = []
})
vi.mock('../CaptureSyncProvider', () => ({
  useCaptureContext: () => ({ revision: 0 }),
}))
vi.mock('../useLocalCaptures', () => ({
  useLocalCaptures: () => local,
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  getUnfiledCaptures: vi.fn(),
}))
it('does not call an unfiled list empty before its server read settles', async () => {
  let finish!: (value: { notes: []; photos: [] }) => void
  vi.mocked(api.getUnfiledCaptures).mockReturnValue(
    new Promise((r) => {
      finish = r
    }),
  )
  render(<UnfiledScreen onBack={vi.fn()} />)
  expect(
    screen.queryByText('Nothing waiting to be filed.'),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Loading recordings…')).toBeVisible()
  await act(async () => finish({ notes: [], photos: [] }))
  expect(await screen.findByText('Nothing waiting to be filed.')).toBeVisible()
})

const remote: UnfiledCaptures = {
  notes: [
    {
      noteId: 'saved',
      capturedAt: '2026-11-23',
      durationMs: 1000,
      transcriptStatus: 'pending',
      text: null,
    },
  ],
  photos: [],
}
it('keeps an immediately chosen local destination out of a stale server unfiled list', async () => {
  local.notes = [
    makeNote({
      jobId: 'chosen',
      serverNoteId: 'saved',
      localState: 'uploaded',
    }),
  ]
  vi.mocked(api.getUnfiledCaptures).mockResolvedValue(remote)
  render(<UnfiledScreen onBack={vi.fn()} />)
  expect(await screen.findByText('Nothing waiting to be filed.')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Choose job' }),
  ).not.toBeInTheDocument()
})
it('ignores an older unfiled response after a newer refresh removed the item', async () => {
  let finish!: (value: UnfiledCaptures) => void
  vi.mocked(api.getUnfiledCaptures)
    .mockReturnValueOnce(
      new Promise((r) => {
        finish = r
      }),
    )
    .mockResolvedValue({ notes: [], photos: [] })
  render(<UnfiledScreen onBack={vi.fn()} />)
  fireEvent(window, new Event('online'))
  await screen.findByText('Nothing waiting to be filed.')
  await act(async () => finish(remote))
  expect(
    screen.queryByRole('button', { name: 'Choose job' }),
  ).not.toBeInTheDocument()
})

it('projects completed server transcript status onto the matching uploaded local recording', async () => {
  local.notes = [
    makeNote({
      jobId: null,
      serverNoteId: 'saved',
      localState: 'uploaded',
      transcriptStatus: null,
    }),
  ]
  vi.mocked(api.getUnfiledCaptures).mockResolvedValue({
    ...remote,
    notes: [
      {
        ...remote.notes[0],
        transcriptStatus: 'completed',
        text: 'Two hours on the back wall',
      },
    ],
  })
  render(<UnfiledScreen onBack={vi.fn()} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show transcript' }),
  )
  expect(screen.getByText('Two hours on the back wall')).toBeVisible()
  expect(screen.queryByText('Waiting for transcript')).not.toBeInTheDocument()
})
it('does not call a completed silent transcript pending', async () => {
  local.notes = [
    makeNote({
      jobId: null,
      serverNoteId: 'saved',
      localState: 'uploaded',
      transcriptStatus: null,
    }),
  ]
  vi.mocked(api.getUnfiledCaptures).mockResolvedValue({
    ...remote,
    notes: [{ ...remote.notes[0], transcriptStatus: 'completed', text: '' }],
  })
  render(<UnfiledScreen onBack={vi.fn()} />)
  await screen.findByRole('button', { name: 'Choose job' })
  await act(async () => {})
  expect(screen.queryByText('Waiting for transcript')).not.toBeInTheDocument()
})
