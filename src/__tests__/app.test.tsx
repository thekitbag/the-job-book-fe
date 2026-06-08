import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { getCurrentJob } from '../api'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn().mockResolvedValue([]),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn().mockResolvedValue([]),
  getReviewDraft: vi.fn(),
  submitReviewDecision: vi.fn(),
}))

vi.mock('../CaptureScreen', () => ({
  default: ({ job }: { job: { title: string } }) => <div data-testid="capture-screen">{job.title}</div>,
}))

vi.mock('../ReviewScreen', () => ({
  default: () => <div data-testid="review-screen">Review</div>,
}))

vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  useRecorder: () => ({ state: 'idle', elapsedMs: 0, mimeType: '', permissionError: null, start: vi.fn(), stop: vi.fn() }),
}))

const mockGetCurrentJob = vi.mocked(getCurrentJob)

const PILOT_JOB = {
  id: 'job-pilot-001',
  title: 'Garden Room',
  roughLocationOrLabel: 'Mrs Patel – back garden',
  status: 'active' as const,
}

const CACHED_JOB_KEY = 'job-book-cached-job'

describe('App', () => {
  it('renders CaptureScreen with job data after successful load', async () => {
    mockGetCurrentJob.mockResolvedValue(PILOT_JOB)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('capture-screen')).toBeInTheDocument()
    })
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('caches the job to localStorage after a successful load', async () => {
    mockGetCurrentJob.mockResolvedValue(PILOT_JOB)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('capture-screen')).toBeInTheDocument()
    })
    const stored = localStorage.getItem(CACHED_JOB_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toMatchObject({ id: PILOT_JOB.id, title: PILOT_JOB.title })
  })

  it('falls back to cached job when API is unavailable (offline PWA launch)', async () => {
    localStorage.setItem(CACHED_JOB_KEY, JSON.stringify(PILOT_JOB))
    mockGetCurrentJob.mockRejectedValue(new Error('network error'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('capture-screen')).toBeInTheDocument()
    })
    // Shows cached job title — capture loop is available offline
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
    // No error screen
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument()
  })

  it('shows error screen when API fails and no cached job exists', async () => {
    mockGetCurrentJob.mockRejectedValue(new Error('network error'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/could not load the current job/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
