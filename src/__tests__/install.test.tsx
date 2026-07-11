import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getNotesForJob } from '../db'
import { getReviewQueue } from '../api'

// CaptureScreen depends on these; mock to isolate install behaviour
vi.mock('../db', () => ({
  saveNote: vi.fn(),
  getNotesForJob: vi.fn(),
}))

vi.mock('../api', () => ({
  getDraftFacts: vi.fn(() => Promise.resolve([])),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-x', photos: [] })),
  getNoteTranscript: vi.fn(),
  getReviewQueue: vi.fn(),
  getMemoryView: vi.fn(() => Promise.resolve({ job: { id: 'job-001' }, generatedAt: '', sections: [], stillToCheck: { count: 0, items: [] } })),
  getBudgetSummary: vi.fn(() => Promise.reject(new Error('no budget'))),
}))

vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  useRecorder: () => ({
    state: 'idle',
    elapsedMs: 0,
    mimeType: '',
    permissionError: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

vi.mock('../useSync', () => ({
  useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }),
}))

vi.mock('../useTranscriptPoll', () => ({
  useTranscriptPoll: () => ({ refreshNow: vi.fn() }),
}))

const mockGetNotesForJob = vi.mocked(getNotesForJob)

const DISMISSED_KEY = 'job-book-install-dismissed'

const MOCK_JOB = {
  id: 'job-001',
  title: 'Garden Room',
  jobType: 'garden_room' as const,
  roughLocationOrLabel: 'Mrs Patel',
  status: 'started' as const,
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

// Helper to fire the beforeinstallprompt event
function fireInstallPrompt() {
  const promptFn = vi.fn(() => Promise.resolve(undefined))
  const event = Object.assign(new Event('beforeinstallprompt'), { prompt: promptFn })
  act(() => { window.dispatchEvent(event) })
  return promptFn
}

// Import CaptureScreen after all mocks are set up
const { default: CurrentJobWorkspace } = await import('../CurrentJobWorkspace')

describe('PWA install banner', () => {
  beforeEach(() => {
    mockGetNotesForJob.mockResolvedValue([])
    vi.mocked(getReviewQueue).mockResolvedValue({ jobId: 'job-001', generatedAt: '', sections: [], alreadyRemembered: [] })
    localStorage.clear()
    // Ensure not in standalone mode by default
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    // Not iOS by default
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      value: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) Chrome/90.0',
    })
    Object.defineProperty(navigator, 'maxTouchPoints', { writable: true, value: 0 })
    Object.defineProperty(navigator, 'standalone', { writable: true, value: undefined })
  })

  it('is hidden when app is already installed (standalone mode)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })

    render(<CurrentJobWorkspace job={MOCK_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument()
  })

  it('is hidden after the user dismisses it', async () => {
    const user = userEvent.setup()
    render(<CurrentJobWorkspace job={MOCK_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    // No prompt yet — banner not visible
    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument()

    // Fire the install prompt so banner appears
    fireInstallPrompt()

    expect(await screen.findByRole('region', { name: /install app/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /dismiss install banner/i }))

    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true')
  })

  it('stays hidden on re-render after dismissal stored in localStorage', () => {
    localStorage.setItem(DISMISSED_KEY, 'true')

    render(<CurrentJobWorkspace job={MOCK_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)
    fireInstallPrompt()

    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument()
  })

  it('shows iOS Share instructions on iOS Safari (no install button)', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    })
    Object.defineProperty(navigator, 'maxTouchPoints', { writable: true, value: 5 })

    render(<CurrentJobWorkspace job={MOCK_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    const banner = await screen.findByRole('region', { name: /install app/i })
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveTextContent(/add to your home screen/i)
    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument()
  })

  it('triggers the native install prompt when Install is clicked', async () => {
    const user = userEvent.setup()
    render(<CurrentJobWorkspace job={MOCK_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    const promptFn = fireInstallPrompt()

    await screen.findByRole('region', { name: /install app/i })
    await user.click(screen.getByRole('button', { name: /^install$/i }))

    expect(promptFn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument()
  })

  it('hides the install banner when the device is offline', () => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })

    render(<CurrentJobWorkspace job={MOCK_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)
    fireInstallPrompt()

    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument()

    // restore so other tests are unaffected
    Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
  })

  it('smoke test: CaptureScreen renders without install banner when no prompt and not iOS', () => {
    render(<CurrentJobWorkspace job={MOCK_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument()
  })
})
