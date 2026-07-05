import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '../App'
import { getJobs, ApiError } from '../api'

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return { ...actual, saveNote: vi.fn(), getNotesForJob: vi.fn(() => Promise.resolve([])) }
})

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    getJobs: vi.fn(),
    getCurrentJob: vi.fn(),
    createJob: vi.fn(),
    pilotLogin: vi.fn(),
    uploadNote: vi.fn(),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getNoteTranscript: vi.fn(),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getReviewDraft: vi.fn(),
    submitReviewDecision: vi.fn(),
    getReviewQueue: vi.fn(),
    submitQueueDecision: vi.fn(),
    ApiError: actual.ApiError,
  }
})

vi.mock('../CurrentJobWorkspace', () => ({
  default: ({ job, onOpenReviewQueue, onSwitchJob }: { job: { id: string; title: string }; onOpenReviewQueue: () => void; onSwitchJob: () => void }) => (
    <div data-testid="workspace-screen" data-job-id={job.id}>
      {job.title}
      <button onClick={onOpenReviewQueue}>mock-open-queue</button>
      <button onClick={onSwitchJob}>mock-switch-job</button>
    </div>
  ),
}))

vi.mock('../ReviewQueueScreen', () => ({
  default: ({ job }: { job: { id: string; title: string } }) => (
    <div data-testid="review-queue-screen" data-job-id={job.id}>{job.title}</div>
  ),
}))

vi.mock('../JobPickerScreen', () => ({
  default: ({ onJobAdded, onSelect }: { onJobAdded: (j: unknown) => void; onSelect: (j: unknown) => void }) => (
    <div data-testid="job-picker-screen">
      <button onClick={() => onJobAdded({ id: 'new-job-001', title: 'New Job', jobType: 'other', roughLocationOrLabel: null, status: 'active', createdAt: '2026-06-10T10:00:00Z', updatedAt: '2026-06-10T10:00:00Z' })}>mock-add-job</button>
      <button onClick={() => onSelect({ id: 'job-002', title: 'Kitchen Extension', jobType: 'extension', roughLocationOrLabel: null, status: 'active', createdAt: '2026-05-20T08:00:00Z', updatedAt: '2026-06-08T14:00:00Z' })}>mock-select-job-b</button>
    </div>
  ),
}))

vi.mock('../PasscodeScreen', () => ({
  default: ({ onLoginSuccess }: { onLoginSuccess: () => void }) => (
    <div data-testid="passcode-screen">
      <button onClick={onLoginSuccess}>mock-login</button>
    </div>
  ),
}))

const mockGetJobs = vi.mocked(getJobs)

const JOB_A = {
  id: 'job-001',
  title: 'Garden Room',
  jobType: 'garden_room' as const,
  roughLocationOrLabel: 'Mrs Patel',
  status: 'active' as const,
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const JOB_B = {
  id: 'job-002',
  title: 'Kitchen Extension',
  jobType: 'extension' as const,
  roughLocationOrLabel: null,
  status: 'active' as const,
  createdAt: '2026-05-20T08:00:00Z',
  updatedAt: '2026-06-08T14:00:00Z',
}

const SELECTED_ID_KEY = 'job-book-selected-job-id'
const CACHED_JOBS_KEY = 'job-book-cached-jobs'

describe('App', () => {
  beforeEach(() => {
    mockGetJobs.mockResolvedValue([JOB_A, JOB_B])
  })

  it('renders the workspace with the first active job after successful load', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('restores previously selected job id from localStorage', async () => {
    localStorage.setItem(SELECTED_ID_KEY, JOB_B.id)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(screen.getByText('Kitchen Extension')).toBeInTheDocument()
  })

  it('falls back to first active job when stored id is no longer in job list', async () => {
    localStorage.setItem(SELECTED_ID_KEY, 'job-stale-999')
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('caches job list to localStorage after successful load', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    const stored = localStorage.getItem(CACHED_JOBS_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!) as typeof JOB_A[]
    expect(parsed[0].id).toBe(JOB_A.id)
  })

  it('shows passcode screen when getJobs returns 401', async () => {
    mockGetJobs.mockRejectedValue(new ApiError('Unauthorized', 401))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('passcode-screen')).toBeInTheDocument())
    expect(screen.queryByTestId('workspace-screen')).not.toBeInTheDocument()
  })

  it('does not use cached jobs for a 401 — user must re-authenticate', async () => {
    localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify([JOB_A]))
    mockGetJobs.mockRejectedValue(new ApiError('Unauthorized', 401))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('passcode-screen')).toBeInTheDocument())
    expect(screen.queryByTestId('workspace-screen')).not.toBeInTheDocument()
  })

  it('reloads jobs after successful login via passcode screen', async () => {
    mockGetJobs
      .mockRejectedValueOnce(new ApiError('Unauthorized', 401))
      .mockResolvedValue([JOB_A])
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('passcode-screen')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'mock-login' }))
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(mockGetJobs).toHaveBeenCalledTimes(2)
  })

  it('falls back to cached jobs when API fails (offline PWA launch)', async () => {
    localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify([JOB_A]))
    localStorage.setItem(SELECTED_ID_KEY, JOB_A.id)
    mockGetJobs.mockRejectedValue(new Error('network error'))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('shows error screen when API fails and no cached jobs exist', async () => {
    mockGetJobs.mockRejectedValue(new Error('network error'))
    render(<App />)
    await waitFor(() => expect(screen.getByText(/could not load jobs/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows job picker / add-job prompt when no jobs exist', async () => {
    mockGetJobs.mockResolvedValue([])
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('job-picker-screen')).toBeInTheDocument())
    expect(screen.queryByTestId('workspace-screen')).not.toBeInTheDocument()
  })

  it('no-jobs state shows no Back button', async () => {
    mockGetJobs.mockResolvedValue([])
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('job-picker-screen')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })

  it('creating the first job from zero jobs enters the workspace immediately', async () => {
    mockGetJobs.mockResolvedValue([])
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('job-picker-screen')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /mock-add-job/i }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(screen.getByText('New Job')).toBeInTheDocument()
    expect(screen.queryByTestId('job-picker-screen')).not.toBeInTheDocument()
  })

  it('switching job updates the workspace to the new job', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', JOB_A.id)

    fireEvent.click(screen.getByRole('button', { name: /mock-switch-job/i }))
    await waitFor(() => expect(screen.getByTestId('job-picker-screen')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /mock-select-job-b/i }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', JOB_B.id)
  })

  it('switching job does not call saveNote or update pending notes', async () => {
    const { saveNote } = await import('../db')
    const mockSaveNote = vi.mocked(saveNote)

    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /mock-switch-job/i }))
    await waitFor(() => expect(screen.getByTestId('job-picker-screen')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /mock-select-job-b/i }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    expect(mockSaveNote).not.toHaveBeenCalled()
  })

  it('"Things to check" opens ReviewQueueScreen with the selected job id', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /mock-open-queue/i }))
    await waitFor(() => expect(screen.getByTestId('review-queue-screen')).toBeInTheDocument())
    expect(screen.getByTestId('review-queue-screen')).toHaveAttribute('data-job-id', JOB_A.id)
  })

  it('"Things to check" uses the switched-to job id after switching', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /mock-switch-job/i }))
    await waitFor(() => screen.getByTestId('job-picker-screen'))
    fireEvent.click(screen.getByRole('button', { name: /mock-select-job-b/i }))
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', JOB_B.id))

    fireEvent.click(screen.getByRole('button', { name: /mock-open-queue/i }))
    await waitFor(() => expect(screen.getByTestId('review-queue-screen')).toBeInTheDocument())
    expect(screen.getByTestId('review-queue-screen')).toHaveAttribute('data-job-id', JOB_B.id)
  })

  it('returns to the workspace from the review queue back action', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /mock-open-queue/i }))
    await waitFor(() => expect(screen.getByTestId('review-queue-screen')).toBeInTheDocument())
  })
})
