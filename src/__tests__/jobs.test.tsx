import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JobPickerScreen from '../JobPickerScreen'
import CaptureScreen from '../CaptureScreen'
import * as api from '../api'
import type { Job } from '../types'

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
    getJobNoteStatuses: vi.fn().mockResolvedValue([]),
    getReviewQueue: vi.fn(),
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
  status: 'active',
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const JOB_B: Job = {
  id: 'job-002',
  title: 'Kitchen Extension',
  jobType: 'extension',
  roughLocationOrLabel: null,
  status: 'active',
  createdAt: '2026-05-20T08:00:00Z',
  updatedAt: '2026-06-08T14:00:00Z',
}

beforeEach(() => {
  mockGetNotesForJob.mockResolvedValue([])
  mockGetDraftFacts.mockResolvedValue([])
  vi.mocked(api.getReviewQueue).mockResolvedValue({ jobId: 'job-001', generatedAt: '', sections: [], alreadyRemembered: [] })
})

// ── CaptureScreen job display ──────────────────────────────────────────────

describe('CaptureScreen — selected job display', () => {
  it('shows the selected job title', () => {
    render(<CaptureScreen job={JOB_A} />)
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('shows job type label for garden_room', () => {
    render(<CaptureScreen job={JOB_A} />)
    expect(screen.getByText('Garden room')).toBeInTheDocument()
  })

  it('shows job type label for extension', () => {
    render(<CaptureScreen job={JOB_B} />)
    expect(screen.getByText('Extension')).toBeInTheDocument()
  })

  it('does not show a type label for "other"', () => {
    const otherJob: Job = { ...JOB_A, jobType: 'other' }
    render(<CaptureScreen job={otherJob} />)
    expect(screen.queryByText('Other')).not.toBeInTheDocument()
  })

  it('shows Switch job button when onSwitchJob is provided', () => {
    render(<CaptureScreen job={JOB_A} onSwitchJob={vi.fn()} />)
    expect(screen.getByRole('button', { name: /switch job/i })).toBeInTheDocument()
  })

  it('calls onSwitchJob when Switch job is clicked', () => {
    const onSwitchJob = vi.fn()
    render(<CaptureScreen job={JOB_A} onSwitchJob={onSwitchJob} />)
    fireEvent.click(screen.getByRole('button', { name: /switch job/i }))
    expect(onSwitchJob).toHaveBeenCalledTimes(1)
  })

  it('does not show Switch job button when onSwitchJob is not provided', () => {
    render(<CaptureScreen job={JOB_A} />)
    expect(screen.queryByRole('button', { name: /switch job/i })).not.toBeInTheDocument()
  })
})

// ── JobPickerScreen ────────────────────────────────────────────────────────

describe('JobPickerScreen', () => {
  it('lists all jobs', () => {
    render(
      <JobPickerScreen
        jobs={[JOB_A, JOB_B]}
        selectedJobId={JOB_A.id}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
    expect(screen.getByText('Kitchen Extension')).toBeInTheDocument()
  })

  it('marks the currently selected job as selected', () => {
    render(
      <JobPickerScreen
        jobs={[JOB_A, JOB_B]}
        selectedJobId={JOB_A.id}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const selectedBtn = screen.getByRole('button', { name: /garden room/i })
    expect(selectedBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onSelect with the job when a job row is clicked', () => {
    const onSelect = vi.fn()
    render(
      <JobPickerScreen
        jobs={[JOB_A, JOB_B]}
        selectedJobId={JOB_A.id}
        online={true}
        onSelect={onSelect}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /kitchen extension/i }))
    expect(onSelect).toHaveBeenCalledWith(JOB_B)
  })

  it('calls onClose when back button is clicked', () => {
    const onClose = vi.fn()
    render(
      <JobPickerScreen
        jobs={[JOB_A]}
        selectedJobId={JOB_A.id}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows Add job button', () => {
    render(
      <JobPickerScreen
        jobs={[JOB_A]}
        selectedJobId={JOB_A.id}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /add job/i })).toBeInTheDocument()
  })

  it('shows add job form when Add job is clicked', () => {
    render(
      <JobPickerScreen
        jobs={[JOB_A]}
        selectedJobId={JOB_A.id}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /add job/i }))
    expect(screen.getByRole('form', { name: /add job/i })).toBeInTheDocument()
  })
})

// ── Add job form ───────────────────────────────────────────────────────────

describe('Add job form', () => {
  function renderAddForm(online = true) {
    render(
      <JobPickerScreen
        jobs={[]}
        selectedJobId={null}
        online={online}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
      />
    )
    // Navigate into add form
    fireEvent.click(screen.getByRole('button', { name: /add job/i }))
  }

  it('shows Job name field and Job type options', () => {
    renderAddForm()
    expect(screen.getByLabelText(/job name/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /garden room/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /extension/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /other/i })).toBeInTheDocument()
  })

  it('does not use project-management language', () => {
    renderAddForm()
    expect(screen.queryByText(/project/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/workspace/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pipeline/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument()
  })

  it('submits title and jobType, then calls onJobAdded with returned job', async () => {
    const newJob: Job = { ...JOB_A, id: 'job-new', title: 'New site' }
    mockCreateJob.mockResolvedValue(newJob)
    const onJobAdded = vi.fn()
    render(
      <JobPickerScreen
        jobs={[]}
        selectedJobId={null}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={onJobAdded}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /add job/i }))
    fireEvent.change(screen.getByLabelText(/job name/i), { target: { value: 'New site' } })
    fireEvent.click(screen.getByRole('radio', { name: /extension/i }))
    fireEvent.click(screen.getByRole('button', { name: /^add job$/i }))

    await waitFor(() => {
      expect(mockCreateJob).toHaveBeenCalledWith('New site', 'extension')
    })
    expect(onJobAdded).toHaveBeenCalledWith(newJob)
  })

  it('keeps form values and shows error message on submit failure', async () => {
    mockCreateJob.mockRejectedValue(new Error('network'))
    renderAddForm()
    fireEvent.change(screen.getByLabelText(/job name/i), { target: { value: 'Failed job' } })
    fireEvent.click(screen.getByRole('button', { name: /^add job$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // Form value preserved
    expect(screen.getByLabelText(/job name/i)).toHaveValue('Failed job')
  })

  it('submit button is disabled when job name is empty', () => {
    renderAddForm()
    expect(screen.getByRole('button', { name: /^add job$/i })).toBeDisabled()
  })

  it('shows offline message when trying to add a job while offline', () => {
    renderAddForm(false)
    expect(screen.getByText(/adding a job needs a connection/i)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: /add job/i })).not.toBeInTheDocument()
  })
})

// ── First-run / no-jobs mode ───────────────────────────────────────────────

describe('JobPickerScreen — first-run mode (hideBack + custom title)', () => {
  it('hides the Back button when hideBack is true', () => {
    render(
      <JobPickerScreen
        jobs={[]}
        selectedJobId={null}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
        hideBack={true}
        title="Add first job"
      />
    )
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })

  it('shows the custom title instead of "Switch job"', () => {
    render(
      <JobPickerScreen
        jobs={[]}
        selectedJobId={null}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
        hideBack={true}
        title="Add first job"
      />
    )
    expect(screen.getByRole('heading', { name: /add first job/i })).toBeInTheDocument()
    expect(screen.queryByText(/switch job/i)).not.toBeInTheDocument()
  })

  it('shows Back button and "Switch job" title by default', () => {
    render(
      <JobPickerScreen
        jobs={[JOB_A]}
        selectedJobId={JOB_A.id}
        online={true}
        onSelect={vi.fn()}
        onJobAdded={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /switch job/i })).toBeInTheDocument()
  })
})
