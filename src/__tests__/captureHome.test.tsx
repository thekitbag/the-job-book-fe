import { expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import HomeScreen from '../HomeScreen'
import { formatJobDay } from '../SourceHistory'
import { saveNote, getAllNotes } from '../db'
import {
  clearLocalOwner,
  beginSignedInSession,
  captureIdentity,
} from '../localOwner'
import { makeNote } from './helpers'
const defaults = {
  jobs: [],
  home: null,
  known: false,
  online: true,
  onRecord: vi.fn(),
  recording: false,
  recordingTitle: null,
  onPhoto: vi.fn(),
  onOpenJob: vi.fn(),
  onOpenAllJobs: vi.fn(),
  onNewJob: vi.fn(),
  onOpenUnfiled: vi.fn(),
  onWorkshop: vi.fn(),
  onLogout: vi.fn(),
  user: null,
  localUnfiled: 0,
}
it('shows only safe unmatched metadata and requires This is mine before a new account can see the recording', async () => {
  clearLocalOwner()
  const n = makeNote({
    ...captureIdentity(),
    jobId: null,
    transcriptText: 'Private supplier and job words',
    durationMs: 12000,
  })
  await saveNote(n)
  beginSignedInSession('b')
  render(<HomeScreen {...defaults} />)
  fireEvent.click(await screen.findByRole('button', { name: 'This is mine' }))
  expect(screen.queryByText(/private supplier/i)).not.toBeInTheDocument()
  await waitFor(async () =>
    expect((await getAllNotes())[0].ownerUserId).toBe('b'),
  )
})
it('does not call uncached loading jobs an empty book or offer New job', () => {
  render(<HomeScreen {...defaults} />)
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
  expect(
    screen.queryByRole('button', { name: 'New job' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/0 jobs/)).not.toBeInTheDocument()
})

it('counts server unfiled items plus additional captures still waiting on this phone', () => {
  const home = {
    inProgressJobs: [],
    otherJobs: { planningCount: 0, finishedCount: 0 },
    unfiledCount: 3,
    lastRecordedJobId: null,
    workshop: { availableCount: 0, preview: [] },
  }
  render(
    <HomeScreen
      {...defaults}
      home={home}
      localUnfiled={2}
      localUploadedUnfiled={1}
    />,
  )
  expect(
    screen.getByRole('button', { name: /Not filed yet/ }),
  ).toHaveTextContent('5')
})

it('shows job activity as a plain day', () => {
  const now = new Date(2026, 10, 23, 21, 0)
  expect(formatJobDay(new Date(2026, 10, 23, 7, 0).toISOString(), now)).toBe(
    'Today',
  )
  expect(formatJobDay(new Date(2026, 10, 22, 23, 0).toISOString(), now)).toBe(
    'Yesterday',
  )
  expect(formatJobDay(new Date(2026, 10, 18, 9, 0).toISOString(), now)).toBe(
    'Wed',
  )
  expect(formatJobDay(new Date(2026, 6, 8, 21, 0).toISOString(), now)).toBe(
    '8 Jul',
  )
  expect(formatJobDay(new Date(2025, 6, 8, 21, 0).toISOString(), now)).toBe(
    '8 Jul 2025',
  )
})

it('puts Not filed yet above the job list', () => {
  render(
    <HomeScreen
      {...defaults}
      known
      home={{
        inProgressJobs: [
          {
            id: 'j1',
            title: 'Roof',
            lastActivityAt: new Date().toISOString(),
            toCheckCount: 0,
          },
        ],
        otherJobs: { planningCount: 1, finishedCount: 2 },
        unfiledCount: 1,
        lastRecordedJobId: null,
        workshop: { availableCount: 0, preview: [] },
      }}
    />,
  )
  const unfiled = screen.getByRole('button', { name: /Not filed yet/ })
  const job = screen.getByRole('button', { name: /Roof/ })
  expect(
    unfiled.compareDocumentPosition(job) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(screen.getByRole('button', { name: /Other jobs/ })).toHaveTextContent(
    '1 planning · 2 finished',
  )
})
