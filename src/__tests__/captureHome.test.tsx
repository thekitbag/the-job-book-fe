import { expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import HomeScreen from '../HomeScreen'
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
