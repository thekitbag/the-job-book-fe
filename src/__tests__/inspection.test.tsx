import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PilotInspectionPage from '../PilotInspectionPage'
import * as api from '../api'
import type { InspectionData, Job } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getJobs: vi.fn(),
    getInspectionData: vi.fn(),
    pilotLogin: vi.fn(),
    getCurrentUser: vi.fn(),
  }
})

vi.mock('../PasscodeScreen', () => ({
  default: ({ onLoginSuccess }: { onLoginSuccess: () => void }) => (
    <div data-testid="passcode-screen">
      <button onClick={onLoginSuccess}>mock-login</button>
    </div>
  ),
}))

vi.mock('../AuthScreen', () => ({
  default: () => <div data-testid="auth-screen" />,
}))

const mockGetJobs = vi.mocked(api.getJobs)
const mockGetInspectionData = vi.mocked(api.getInspectionData)
const mockGetCurrentUser = vi.mocked(api.getCurrentUser)

const JOB_A: Job = {
  id: 'job-inspect-001',
  title: 'Garden Room',
  jobType: 'garden_room',
  roughLocationOrLabel: null,
  status: 'active',
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const JOB_B: Job = {
  id: 'job-inspect-002',
  title: 'Kitchen Extension',
  jobType: 'extension',
  roughLocationOrLabel: null,
  status: 'active',
  createdAt: '2026-05-20T08:00:00Z',
  updatedAt: '2026-06-08T14:00:00Z',
}

const INSPECTION_DATA: InspectionData = {
  job: JOB_A,
  generatedAt: '2026-06-11T10:00:00.000Z',
  notesByDay: [
    {
      localDate: '2026-06-11',
      notes: [
        {
          id: 'note-001',
          clientNoteId: 'client-001',
          capturedAt: '2026-06-11T09:15:00.000Z',
          uploadedAt: '2026-06-11T09:15:08.000Z',
          serverStatus: 'transcribed',
          mimeType: 'audio/webm;codecs=opus',
          durationMs: 18000,
          sizeBytes: 240000,
          audioStored: true,
          transcript: {
            id: 'trans-001',
            status: 'ready',
            text: 'Ordered 12 sheets of plasterboard from Jewson.',
            language: 'en',
            provider: 'openai',
            model: 'whisper-1',
            errorCode: null,
            extractionStatus: 'ready',
            extractionErrorCode: null,
          },
          candidateFacts: [
            {
              id: 'fact-001',
              factType: 'ordered_material',
              status: 'confirmed',
              summary: 'Ordered 12 sheets of plasterboard from Jewson',
              materialName: 'plasterboard',
              quantity: '12',
              unit: 'sheets',
              supplierName: 'Jewson',
              deliveryTiming: null,
              locationOrUse: null,
              confidenceLabel: 'high',
              uncertaintyFlags: ['uncertain_quantity'],
              reviewState: 'confirmed',
              reviewDecisionIds: ['decision-001'],
              memoryItemIds: ['memory-001'],
            },
          ],
        },
      ],
    },
    {
      localDate: '2026-06-10',
      notes: [
        {
          id: 'note-002',
          clientNoteId: 'client-002',
          capturedAt: '2026-06-10T14:00:00.000Z',
          uploadedAt: null,
          serverStatus: 'transcribed',
          mimeType: 'audio/webm;codecs=opus',
          durationMs: 5000,
          sizeBytes: 65000,
          audioStored: false,
          transcript: {
            id: 'trans-002',
            status: 'failed',
            text: null,
            language: null,
            provider: 'openai',
            model: 'whisper-1',
            errorCode: 'TRANSCRIPTION_FAILED',
            extractionStatus: null,
            extractionErrorCode: null,
          },
          candidateFacts: [],
        },
      ],
    },
  ],
  queue: {
    sections: [
      {
        key: 'watch_outs',
        label: 'Watch outs',
        items: [
          {
            id: 'queue-item-001',
            kind: 'single',
            status: 'draft',
            reviewLabel: 'Watch out',
            timeLabel: 'Today',
            summary: 'Uneven floor near back door',
          },
        ],
      },
    ],
  },
  reviewDecisions: [
    {
      id: 'decision-001',
      action: 'queue_confirm',
      candidateFactId: null,
      sourceCandidateFactIds: ['fact-001'],
      sectionKey: null,
      reason: null,
      createdAt: '2026-06-11T09:25:00.000Z',
    },
  ],
  memoryItems: [
    {
      id: 'memory-001',
      memoryType: 'ordered_material',
      summary: 'Ordered 12 sheets of plasterboard from Jewson',
      sourceCandidateFactId: 'fact-001',
      reviewDecisionId: 'decision-001',
      createdAt: '2026-06-11T09:25:00.000Z',
    },
  ],
  possibleMisses: [
    {
      noteId: 'note-miss-001',
      reason: 'Transcript contains material-like wording but no facts extracted',
      transcriptExcerpt: 'Got some sand from the builders merchant',
    },
  ],
}

beforeEach(() => {
  sessionStorage.clear()
  // Default to an authenticated internal user so the existing key-prompt/data
  // flow below is unaffected — tests that care about the unauthenticated case
  // override this explicitly.
  mockGetCurrentUser.mockResolvedValue({ id: 'user-internal', email: 'founder@thejobbook.test', name: 'Founder', role: 'INTERNAL' })
})

async function enterKeyAndLoad(key = 'test-key-abc') {
  const input = screen.getByPlaceholderText('Enter inspection key')
  fireEvent.change(input, { target: { value: key } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('PilotInspectionPage — unauthenticated', () => {
  it('shows email/password auth, not the inspection key form and not PasscodeScreen', async () => {
    mockGetCurrentUser.mockRejectedValue(new api.ApiError('Unauthorized', 401))
    render(<PilotInspectionPage />)
    await waitFor(() => expect(screen.getByTestId('auth-screen')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('Enter inspection key')).toBeNull()
    expect(screen.queryByTestId('passcode-screen')).toBeNull()
  })
})

describe('PilotInspectionPage', () => {
  it('shows the Pilot inspection heading', () => {
    render(<PilotInspectionPage />)
    expect(screen.getByRole('heading', { name: 'Pilot inspection' })).toBeTruthy()
  })

  it('shows key prompt when no key is stored in sessionStorage', () => {
    render(<PilotInspectionPage />)
    expect(screen.getByPlaceholderText('Enter inspection key')).toBeTruthy()
  })

  it('skips key prompt when key already in sessionStorage', async () => {
    sessionStorage.setItem('job-book-inspection-key', 'stored-key')
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await waitFor(() => expect(mockGetJobs).toHaveBeenCalled())
    expect(screen.queryByPlaceholderText('Enter inspection key')).toBeNull()
  })

  it('stores inspection key in sessionStorage after submit', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad('my-secret-key')
    expect(sessionStorage.getItem('job-book-inspection-key')).toBe('my-secret-key')
  })

  it('Continue button is disabled while key field is empty', () => {
    render(<PilotInspectionPage />)
    const btn = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Enter inspection key'), { target: { value: 'k' } })
    expect(btn.disabled).toBe(false)
  })

  it('loads jobs after key is entered', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => expect(mockGetJobs).toHaveBeenCalledTimes(1))
  })

  it('renders a job selector after jobs load', async () => {
    mockGetJobs.mockResolvedValue([JOB_A, JOB_B])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('combobox', { name: 'Select job' }))
    expect(screen.getByRole('option', { name: 'Garden Room' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Kitchen Extension' })).toBeTruthy()
  })

  it('calls getInspectionData with the first loaded job id', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad('my-key')
    await waitFor(() =>
      expect(mockGetInspectionData).toHaveBeenCalledWith('job-inspect-001', 'my-key')
    )
  })

  it('sends the inspection key as the second argument to getInspectionData', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad('special-key-999')
    await waitFor(() => {
      const [, keyArg] = mockGetInspectionData.mock.calls[0]
      expect(keyArg).toBe('special-key-999')
    })
  })

  it('calls getInspectionData with selected job id when job is changed', async () => {
    mockGetJobs.mockResolvedValue([JOB_A, JOB_B])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad('k')
    const select = await waitFor(() => screen.getByRole('combobox', { name: 'Select job' }))
    fireEvent.change(select, { target: { value: JOB_B.id } })
    await waitFor(() =>
      expect(mockGetInspectionData).toHaveBeenCalledWith(JOB_B.id, 'k')
    )
  })

  it('renders the Notes section heading', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('heading', { name: 'Notes' }))
  })

  it('groups notes under day headings', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('heading', { name: 'Notes' }))
    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.length).toBe(2)
  })

  it('renders transcript status badge', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByText('ready'))
    expect(screen.getByText('failed')).toBeTruthy()
  })

  it('renders transcript text when available', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() =>
      screen.getByText('Ordered 12 sheets of plasterboard from Jewson.')
    )
  })

  it('renders transcript error code for failed transcripts', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByText('TRANSCRIPTION_FAILED'))
  })

  it('renders candidate fact summary', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => {
      const matches = screen.getAllByText('Ordered 12 sheets of plasterboard from Jewson')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders candidate fact review state badge', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByText('Confirmed'))
  })

  it('renders candidate fact confidence badge', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByText('high'))
  })

  it('renders candidate fact uncertainty flags', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByText('uncertain_quantity'))
  })

  it('renders Things to check section and queue item', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('heading', { name: 'Things to check now' }))
    expect(screen.getByText('Uneven floor near back door')).toBeTruthy()
  })

  it('renders confirmed memory section and item', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('heading', { name: 'Confirmed memory' }))
    expect(
      screen.getAllByText('Ordered 12 sheets of plasterboard from Jewson').length
    ).toBeGreaterThanOrEqual(1)
  })

  it('renders possible misses section when data includes them', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('heading', { name: 'Possible misses' }))
    expect(screen.getByText(/material-like wording/)).toBeTruthy()
    expect(screen.getByText(/Got some sand from the builders merchant/)).toBeTruthy()
  })

  it('does not render possible misses section when array is empty', async () => {
    const noMisses = { ...INSPECTION_DATA, possibleMisses: [] }
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(noMisses)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('heading', { name: 'Confirmed memory' }))
    expect(screen.queryByRole('heading', { name: 'Possible misses' })).toBeNull()
  })

  it('shows PasscodeScreen when getInspectionData returns 401', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockRejectedValue(new api.ApiError('Unauthorized', 401))
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByTestId('passcode-screen'))
  })

  it('shows retryable error when getInspectionData throws a generic error', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockRejectedValue(new Error('Network failure'))
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByText(/Network failure/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('shows error when jobs fail to load', async () => {
    mockGetJobs.mockRejectedValue(new Error('Could not reach server'))
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByText(/Could not reach server/)).toBeTruthy()
  })

  it('clears key and returns to key prompt on Clear key click', async () => {
    sessionStorage.setItem('job-book-inspection-key', 'stored-key')
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await waitFor(() => screen.getByRole('button', { name: 'Clear key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear key' }))
    expect(sessionStorage.getItem('job-book-inspection-key')).toBeNull()
    expect(screen.getByPlaceholderText('Enter inspection key')).toBeTruthy()
  })

  it('shows PasscodeScreen when getJobs returns 401, and retries after login', async () => {
    mockGetJobs
      .mockRejectedValueOnce(new api.ApiError('Unauthorized', 401))
      .mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByTestId('passcode-screen'))
    fireEvent.click(screen.getByRole('button', { name: 'mock-login' }))
    await waitFor(() => expect(mockGetJobs).toHaveBeenCalledTimes(2))
    await waitFor(() => screen.getByRole('combobox', { name: 'Select job' }))
  })

  it('renders cleanly when durationMs is null', async () => {
    const nullDuration = {
      ...INSPECTION_DATA,
      notesByDay: [
        {
          localDate: '2026-06-11',
          notes: [
            {
              ...INSPECTION_DATA.notesByDay[0].notes[0],
              durationMs: null,
            },
          ],
        },
      ],
    }
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(nullDuration)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByText(/duration unknown/))
  })

  it('does not show confirm/correct/dismiss/edit controls', async () => {
    mockGetJobs.mockResolvedValue([JOB_A])
    mockGetInspectionData.mockResolvedValue(INSPECTION_DATA)
    render(<PilotInspectionPage />)
    await enterKeyAndLoad()
    await waitFor(() => screen.getByRole('heading', { name: 'Notes' }))
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /correct/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fix details/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remember this/i })).toBeNull()
  })
})
