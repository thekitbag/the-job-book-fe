import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JobLog from '../JobLog'
vi.mock('../api', () => ({
  getJobLog: vi.fn(async () => ({
    entries: [
      {
        kind: 'voice_note',
        id: 'v',
        noteId: 'v',
        at: '2026-11-21T12:00:00Z',
        durationMs: 3000,
        transcriptStatus: 'completed',
        text: 'Skip hire £250',
        linkedPhotoIds: [],
      },
      {
        kind: 'voice_note',
        id: 'f',
        noteId: 'f',
        at: '2026-11-20T12:00:00Z',
        durationMs: null,
        transcriptStatus: 'failed',
        text: null,
        linkedPhotoIds: [],
      },
      {
        kind: 'voice_note',
        id: 'p',
        noteId: 'p',
        at: '2026-11-19T12:00:00Z',
        durationMs: null,
        transcriptStatus: 'pending',
        text: null,
        linkedPhotoIds: [],
      },
      { kind: 'typed_note', id: 't', memoryItemId: 't', at: '2026-11-18T12:00:00Z', text: 'Call tomorrow' },
      {
        kind: 'photo',
        id: 'r',
        photoId: 'r',
        at: '2026-11-17T12:00:00Z',
        fileKind: 'PDF',
        fileUrl: '/api/jobs/j/receipts/r/file',
        descriptor: null,
        linkedNoteId: null,
      },
    ],
  })),
  resolveApiUrl: (s: string) => s,
}))
it('keeps every recording including pending, failed and price-only notes; filters legacy files as photos', async () => {
  render(<JobLog jobId="j" />)
  expect(await screen.findByText('Skip hire £250')).toHaveAttribute('data-builder-note')
  expect(screen.getByText(/could not be transcribed/i)).toBeVisible()
  expect(screen.getByText(/transcript pending/i)).toBeVisible()
  expect(screen.getByText('Call tomorrow')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute(
    'href',
    '/api/jobs/j/receipts/r/file',
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Photos' }))
  expect(screen.queryByText('Call tomorrow')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
  expect(screen.queryByRole('link', { name: 'Open file' })).not.toBeInTheDocument()
  expect(screen.getByText('Call tomorrow')).toBeVisible()
})

it('does not restore stale log text when an earlier read finishes after an edit refresh', async () => {
  const { getJobLog } = await import('../api')
  let resolve!: (v: Awaited<ReturnType<typeof getJobLog>>) => void
  vi.mocked(getJobLog)
    .mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    .mockResolvedValue({
      entries: [
        {
          kind: 'typed_note',
          id: 't',
          memoryItemId: 't',
          at: '2026-11-21T12:00:00Z',
          text: 'Corrected note',
        },
      ],
    })
  const { rerender } = render(<JobLog jobId="j" refreshKey={0} />)
  rerender(<JobLog jobId="j" refreshKey={1} />)
  await screen.findByText('Corrected note')
  const { act } = await import('@testing-library/react')
  await act(async () =>
    resolve({
      entries: [
        { kind: 'typed_note', id: 't', memoryItemId: 't', at: '2026-11-21T12:00:00Z', text: 'Old note' },
      ],
    }),
  )
  expect(screen.getByText('Corrected note')).toBeVisible()
  expect(screen.queryByText('Old note')).not.toBeInTheDocument()
})
