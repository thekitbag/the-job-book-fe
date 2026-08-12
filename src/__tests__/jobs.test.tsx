import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AllJobsScreen from '../AllJobsScreen'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import type { Job, MemoryViewResponse } from '../types'

const mockCreateJob = vi.mocked(api.createJob)
const mockGetNotesForJob = vi.mocked(
  (await import('../db')).getNotesForJob
)
const mockGetDraftFacts = vi.mocked(api.getDraftFacts)

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    createJob: vi.fn(),
    getJobs: vi.fn(),
    getDraftFacts: vi.fn(),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getReviewQueue: vi.fn(),
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
  }
})

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return { ...actual, getNotesForJob: vi.fn(), saveNote: vi.fn() }
})

vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  useRecorder: () => ({
    state: 'idle',
    elapsedMs: 0,
    permissionError: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const JOB_A: Job = {
  id: 'job-001',
  title: 'Garden Room',
  jobType: 'garden_room',
  roughLocationOrLabel: 'Mrs Patel',
  status: 'started',
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const JOB_B: Job = {
  id: 'job-002',
  title: 'Kitchen Extension',
  jobType: 'extension',
  roughLocationOrLabel: null,
  status: 'started',
  createdAt: '2026-05-20T08:00:00Z',
  updatedAt: '2026-06-08T14:00:00Z',
}

const EMPTY_MEMORY: MemoryViewResponse = {
  job: JOB_A, generatedAt: '', sections: [], stillToCheck: { count: 0, items: [] }, costSummary: undefined,
}

beforeEach(() => {
  mockGetNotesForJob.mockResolvedValue([])
  mockGetDraftFacts.mockResolvedValue([])
  vi.mocked(api.getReviewQueue).mockResolvedValue({ jobId: 'job-001', generatedAt: '', sections: [], alreadyRemembered: [] })
  vi.mocked(api.getMemoryView).mockResolvedValue(EMPTY_MEMORY)
  vi.mocked(api.getBudgetSummary).mockRejectedValue(new Error('no budget'))
})

// ── Workspace selected-job display ─────────────────────────────────────────

function renderWorkspace(job: Job) {
  return render(<CurrentJobWorkspace job={job} onOpenReviewQueue={vi.fn()} onOpenBookHome={vi.fn()} />)
}

describe('CurrentJobWorkspace — selected job display', () => {
  it('shows the selected job title', () => {
    renderWorkspace(JOB_A)
    expect(screen.getByRole('heading', { name: 'Garden Room' })).toBeInTheDocument()
  })

  it('shows the rough location when present', () => {
    renderWorkspace(JOB_A)
    expect(screen.getByText('Mrs Patel')).toBeInTheDocument()
  })

  it('shows the job type as a fallback when there is no location', () => {
    renderWorkspace(JOB_B)
    expect(screen.getByText('Extension')).toBeInTheDocument()
  })

  it('does not show a type label for "other"', () => {
    const otherJob: Job = { ...JOB_B, jobType: 'other' }
    renderWorkspace(otherJob)
    expect(screen.queryByText('Other')).not.toBeInTheDocument()
  })

  it('always offers the route up to The Job Book', () => {
    const onOpenBookHome = vi.fn()
    render(<CurrentJobWorkspace job={JOB_A} onOpenReviewQueue={vi.fn()} onOpenBookHome={onOpenBookHome} />)
    // The old "Switch job" wording is gone: the route is named after the
    // place it leads to.
    expect(screen.queryByRole('button', { name: /switch job/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /the job book/i }))
    expect(onOpenBookHome).toHaveBeenCalledTimes(1)
  })
})

// ── All Jobs index ─────────────────────────────────────────────────────────

function renderAllJobs(props: Partial<React.ComponentProps<typeof AllJobsScreen>> = {}) {
  return render(
    <AllJobsScreen
      jobs={[JOB_A, JOB_B]}
      online={true}
      onOpenJob={vi.fn()}
      onJobAdded={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />,
  )
}

describe('AllJobsScreen', () => {
  it('lists every job', () => {
    renderAllJobs()
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
    expect(screen.getByText('Kitchen Extension')).toBeInTheDocument()
  })

  it('calls onOpenJob with the job when a row is tapped', () => {
    const onOpenJob = vi.fn()
    renderAllJobs({ onOpenJob })
    fireEvent.click(screen.getByRole('button', { name: /kitchen extension/i }))
    expect(onOpenJob).toHaveBeenCalledWith(JOB_B)
  })

  it('goes back to The Job Book', () => {
    const onBack = vi.fn()
    renderAllJobs({ onBack })
    fireEvent.click(screen.getByRole('button', { name: /back to the job book/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('hides the back route in the first-run (no jobs) state', () => {
    renderAllJobs({ jobs: [], hideBack: true })
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
    // …but New job is still right there.
    expect(screen.getByRole('button', { name: 'New job' })).toBeInTheDocument()
  })
})

// ── New job form ───────────────────────────────────────────────────────────

describe('New job', () => {
  function openNewJob(online = true) {
    renderAllJobs({ jobs: [], online })
    fireEvent.click(screen.getByRole('button', { name: 'New job' }))
  }

  it('asks for a name, a where, and a state — and nothing else', () => {
    openNewJob()
    expect(screen.getByLabelText(/job name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/where \(optional\)/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'In progress' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Planning' })).toBeInTheDocument()
    // No budget, customer, dates, or job-type taxonomy at creation time.
    expect(screen.queryByRole('radio', { name: /garden room/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/budget|customer|date/i)).not.toBeInTheDocument()
  })

  it('does not use project-management language', () => {
    openNewJob()
    for (const word of [/project/i, /workspace/i, /pipeline/i, /dashboard/i, /portfolio/i]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument()
    }
  })

  it('submits the entered details and hands back the created job', async () => {
    const newJob: Job = { ...JOB_A, id: 'job-new', title: 'New site' }
    mockCreateJob.mockResolvedValue(newJob)
    const onJobAdded = vi.fn()
    renderAllJobs({ jobs: [], onJobAdded })
    fireEvent.click(screen.getByRole('button', { name: 'New job' }))
    fireEvent.change(screen.getByLabelText(/job name/i), { target: { value: '  New site  ' } })
    fireEvent.change(screen.getByLabelText(/where \(optional\)/i), { target: { value: ' Mill Lane ' } })
    fireEvent.click(screen.getByRole('button', { name: /^add job$/i }))

    await waitFor(() => {
      expect(mockCreateJob).toHaveBeenCalledWith({ title: 'New site', roughLocationOrLabel: 'Mill Lane', status: 'started' })
    })
    expect(onJobAdded).toHaveBeenCalledWith(newJob)
  })

  it('keeps form values and shows a retryable error on failure', async () => {
    mockCreateJob.mockRejectedValue(new Error('network'))
    openNewJob()
    fireEvent.change(screen.getByLabelText(/job name/i), { target: { value: 'Failed job' } })
    fireEvent.click(screen.getByRole('button', { name: /^add job$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByLabelText(/job name/i)).toHaveValue('Failed job')
    expect(screen.getByRole('button', { name: /^add job$/i })).toBeEnabled()
  })

  it('submit is disabled until the job has a name', () => {
    openNewJob()
    expect(screen.getByRole('button', { name: /^add job$/i })).toBeDisabled()
  })

  it('says plainly that adding a job needs a connection when offline', () => {
    openNewJob(false)
    expect(screen.getByText(/adding a job needs a connection/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/job name/i)).not.toBeInTheDocument()
  })
})
