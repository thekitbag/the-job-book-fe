import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '../App'
import { getJobs, ApiError } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    getJobs: vi.fn(),
    getCurrentJob: vi.fn(),
    createJob: vi.fn(),
    pilotLogin: vi.fn(),
    uploadNote: vi.fn(),
    getJobNoteStatuses: vi.fn().mockResolvedValue([]),
    getNoteTranscript: vi.fn(),
    getDraftFacts: vi.fn().mockResolvedValue([]),
    getReviewDraft: vi.fn(),
    submitReviewDecision: vi.fn(),
    getReviewQueue: vi.fn(),
    submitQueueDecision: vi.fn(),
    ApiError: actual.ApiError,
  }
})

vi.mock('../CaptureScreen', () => ({
  default: ({ job }: { job: { title: string } }) => (
    <div data-testid="capture-screen">{job.title}</div>
  ),
}))

vi.mock('../ReviewQueueScreen', () => ({
  default: () => <div data-testid="review-queue-screen">Review Queue</div>,
}))

vi.mock('../JobPickerScreen', () => ({
  default: ({ onJobAdded }: { onJobAdded: (j: unknown) => void }) => (
    <div data-testid="job-picker-screen">
      <button onClick={() => onJobAdded({ id: 'new-job-001', title: 'New Job', jobType: 'other', roughLocationOrLabel: null, status: 'active', createdAt: '2026-06-10T10:00:00Z', updatedAt: '2026-06-10T10:00:00Z' })}>mock-add-job</button>
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

vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  useRecorder: () => ({ state: 'idle', elapsedMs: 0, mimeType: '', permissionError: null, start: vi.fn(), stop: vi.fn() }),
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

  it('renders CaptureScreen with the first active job after successful load', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('capture-screen')).toBeInTheDocument())
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('restores previously selected job id from localStorage', async () => {
    localStorage.setItem(SELECTED_ID_KEY, JOB_B.id)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('capture-screen')).toBeInTheDocument())
    expect(screen.getByText('Kitchen Extension')).toBeInTheDocument()
  })

  it('falls back to first active job when stored id is no longer in job list', async () => {
    localStorage.setItem(SELECTED_ID_KEY, 'job-stale-999')
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('capture-screen')).toBeInTheDocument())
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('caches job list to localStorage after successful load', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('capture-screen')).toBeInTheDocument())
    const stored = localStorage.getItem(CACHED_JOBS_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!) as typeof JOB_A[]
    expect(parsed[0].id).toBe(JOB_A.id)
  })

  it('shows passcode screen when getJobs returns 401', async () => {
    mockGetJobs.mockRejectedValue(new ApiError('Unauthorized', 401))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('passcode-screen')).toBeInTheDocument())
    expect(screen.queryByTestId('capture-screen')).not.toBeInTheDocument()
  })

  it('does not use cached jobs for a 401 — user must re-authenticate', async () => {
    localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify([JOB_A]))
    mockGetJobs.mockRejectedValue(new ApiError('Unauthorized', 401))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('passcode-screen')).toBeInTheDocument())
    expect(screen.queryByTestId('capture-screen')).not.toBeInTheDocument()
  })

  it('reloads jobs after successful login via passcode screen', async () => {
    mockGetJobs
      .mockRejectedValueOnce(new ApiError('Unauthorized', 401))
      .mockResolvedValue([JOB_A])
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('passcode-screen')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'mock-login' }))
    await waitFor(() => expect(screen.getByTestId('capture-screen')).toBeInTheDocument())
    expect(mockGetJobs).toHaveBeenCalledTimes(2)
  })

  it('falls back to cached jobs when API fails (offline PWA launch)', async () => {
    localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify([JOB_A]))
    localStorage.setItem(SELECTED_ID_KEY, JOB_A.id)
    mockGetJobs.mockRejectedValue(new Error('network error'))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('capture-screen')).toBeInTheDocument())
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
    expect(screen.queryByTestId('capture-screen')).not.toBeInTheDocument()
  })
})
