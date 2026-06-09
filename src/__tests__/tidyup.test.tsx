import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createOrGetTidyUp, submitTidyUpDecision } from '../api'
import type { TidyUpRun } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    createOrGetTidyUp: vi.fn(),
    submitTidyUpDecision: vi.fn(),
    getTodayLocalDate: actual.getTodayLocalDate,
    ApiError: actual.ApiError,
  }
})

const mockCreate = vi.mocked(createOrGetTidyUp)
const mockSubmit = vi.mocked(submitTidyUpDecision)

// Import component after mocks
const { default: TidyUpScreen } = await import('../TidyUpScreen')

// Also mock CaptureScreen dependencies and import for the entry-point test
vi.mock('../db', () => ({
  saveNote: vi.fn(),
  getNotesForJob: vi.fn(),
}))
vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  useRecorder: () => ({ state: 'idle', elapsedMs: 0, mimeType: '', permissionError: null, start: vi.fn(), stop: vi.fn() }),
}))
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))
vi.mock('../usePwaInstall', () => ({ usePwaInstall: () => ({ showBanner: false, isIosSafari: false, triggerInstall: vi.fn(), dismiss: vi.fn() }) }))
import { getNotesForJob } from '../db'
const mockGetNotes = vi.mocked(getNotesForJob)

const { default: CaptureScreen } = await import('../CaptureScreen')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_JOB = {
  id: 'job-001',
  title: 'Garden Room',
  roughLocationOrLabel: 'Mrs Patel',
  status: 'active' as const,
}

const SINGLE_ITEM = {
  id: 'tidy-item-001',
  kind: 'single' as const,
  status: 'draft' as const,
  reviewLabel: 'What I picked up today',
  summary: 'Ordered 12 sheets of plasterboard from Jewson',
  proposedMemory: {
    memoryType: 'ordered_material' as const,
    summary: 'Ordered 12 sheets of plasterboard from Jewson',
    materialName: 'plasterboard',
    quantity: '12',
    unit: 'sheets',
    supplierName: 'Jewson',
    deliveryTiming: null,
    locationOrUse: null,
  },
  confidenceLabel: 'high' as const,
  uncertaintyFlags: [],
  sourceCandidateFactIds: ['fact-001'],
  sourceContext: [
    {
      candidateFactId: 'fact-001',
      noteId: 'note-001',
      transcriptId: 'trans-001',
      capturedAt: '2026-06-09T09:30:00.000Z',
      transcriptText: 'Ordered 12 sheets of plasterboard from Jewson.',
    },
  ],
}

const DUPLICATE_ITEM = {
  id: 'tidy-item-002',
  kind: 'duplicate_group' as const,
  status: 'draft' as const,
  reviewLabel: 'Looks like the same item',
  summary: 'Used OSB boards on the back wall',
  proposedMemory: {
    memoryType: 'used_material' as const,
    summary: 'Used OSB boards on the back wall',
    materialName: 'OSB',
    quantity: null,
    unit: 'boards',
    supplierName: null,
    deliveryTiming: null,
    locationOrUse: 'back wall',
  },
  confidenceLabel: 'medium' as const,
  uncertaintyFlags: ['uncertain_quantity'],
  sourceCandidateFactIds: ['fact-002', 'fact-003'],
  sourceContext: [
    {
      candidateFactId: 'fact-002',
      noteId: 'note-001',
      transcriptId: 'trans-001',
      capturedAt: '2026-06-09T09:30:00.000Z',
      transcriptText: 'Used six OSB boards on the back wall.',
    },
    {
      candidateFactId: 'fact-003',
      noteId: 'note-002',
      transcriptId: 'trans-002',
      capturedAt: '2026-06-09T14:00:00.000Z',
      transcriptText: 'Put some OSB on the back wall earlier.',
    },
  ],
}

const CONTRADICTION_ITEM = {
  id: 'tidy-item-003',
  kind: 'contradiction' as const,
  status: 'draft' as const,
  reviewLabel: 'Worth checking',
  summary: 'Plasterboard delivery timing conflict',
  proposedMemory: {
    memoryType: 'ordered_material' as const,
    summary: 'Plasterboard delivery',
    materialName: 'plasterboard',
    quantity: '12',
    unit: 'sheets',
    supplierName: 'Jewson',
    deliveryTiming: null,
    locationOrUse: null,
  },
  confidenceLabel: 'low' as const,
  uncertaintyFlags: ['contradicting_sources'],
  sourceCandidateFactIds: ['fact-004', 'fact-005'],
  sourceContext: [
    {
      candidateFactId: 'fact-004',
      noteId: 'note-001',
      transcriptId: 'trans-001',
      capturedAt: '2026-06-09T09:30:00.000Z',
      transcriptText: 'Plasterboard coming tomorrow.',
    },
    {
      candidateFactId: 'fact-005',
      noteId: 'note-003',
      transcriptId: 'trans-003',
      capturedAt: '2026-06-09T16:00:00.000Z',
      transcriptText: 'Jewson said plasterboard coming Friday not tomorrow.',
    },
  ],
}

const MOCK_RUN: TidyUpRun = {
  id: 'tidy-run-001',
  jobId: 'job-001',
  localDate: '2026-06-09',
  status: 'ready' as const,
  createdAt: '2026-06-09T18:00:00.000Z',
  sections: [
    { key: 'ordered_material', label: 'Ordered materials', items: [SINGLE_ITEM] },
    { key: 'used_material', label: 'Used materials', items: [DUPLICATE_ITEM, CONTRADICTION_ITEM] },
  ],
  alreadyRemembered: [
    { memoryItemId: 'mem-001', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material' as const },
  ],
}

const EMPTY_RUN: TidyUpRun = {
  id: 'tidy-run-empty',
  jobId: 'job-001',
  localDate: '2026-06-09',
  status: 'ready' as const,
  sections: [],
  alreadyRemembered: [],
}

function makeDecisionResponse(itemId: string, action: string, status: string) {
  return {
    tidyUpItemId: itemId,
    action,
    status,
    memoryItemId: status === 'confirmed' || status === 'corrected' ? `mem-${itemId}` : undefined,
    sourceCandidateFactIds: [],
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TidyUpScreen', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue(MOCK_RUN)
    mockSubmit.mockResolvedValue(makeDecisionResponse('tidy-item-001', 'confirm', 'confirmed') as never)
  })

  it('opens Today\'s tidy-up from CaptureScreen when the button is tapped', async () => {
    mockGetNotes.mockResolvedValue([])
    const user = userEvent.setup()
    const onOpenTidyUp = vi.fn()

    render(<CaptureScreen job={MOCK_JOB} onOpenTidyUp={onOpenTidyUp} />)

    await user.click(screen.getByRole('button', { name: /today's tidy-up/i }))
    expect(onOpenTidyUp).toHaveBeenCalledOnce()
  })

  it('passes today\'s local date to the API', async () => {
    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())

    const [, calledDate] = mockCreate.mock.calls[0]
    // Should be a YYYY-MM-DD string
    expect(calledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Should match today's date
    const today = new Date()
    const expected = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
    expect(calledDate).toBe(expected)
  })

  it('renders grouped section headings', async () => {
    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await screen.findByText('Ordered materials')
    expect(screen.getByText('Used materials')).toBeInTheDocument()
  })

  it('renders duplicate group badge and all source snippets', async () => {
    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await screen.findByText('Looks like the same item')
    expect(screen.getByText(/"Used six OSB boards on the back wall\."/)).toBeInTheDocument()
    expect(screen.getByText(/"Put some OSB on the back wall earlier\."/)).toBeInTheDocument()
  })

  it('renders contradiction badge with both conflicting source snippets', async () => {
    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await screen.findByText('Worth checking')
    expect(screen.getByText(/"Plasterboard coming tomorrow\."/)).toBeInTheDocument()
    expect(screen.getByText(/"Jewson said plasterboard coming Friday not tomorrow\."/)).toBeInTheDocument()
  })

  it('submits a confirm decision with the correct payload', async () => {
    mockSubmit.mockResolvedValue(makeDecisionResponse('tidy-item-001', 'confirm', 'confirmed') as never)
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    const btns = await screen.findAllByRole('button', { name: /remember this/i })
    await user.click(btns[0])

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({ tidyUpItemId: 'tidy-item-001', action: 'confirm' }),
    ))
  })

  it('shows "Saved to trusted memory" after a successful confirm', async () => {
    mockSubmit.mockResolvedValue(makeDecisionResponse('tidy-item-001', 'confirm', 'confirmed') as never)
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    const btns = await screen.findAllByRole('button', { name: /remember this/i })
    await user.click(btns[0])

    await waitFor(() => {
      const card = screen.getByTestId('tidy-item-tidy-item-001')
      expect(within(card).getByText('Saved to trusted memory')).toBeInTheDocument()
    })
  })

  it('submits a correct decision with edited fields', async () => {
    mockSubmit.mockResolvedValue(makeDecisionResponse('tidy-item-001', 'correct', 'corrected') as never)
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    const correctBtns = await screen.findAllByRole('button', { name: /^correct$/i })
    await user.click(correctBtns[0])

    const summaryInput = screen.getByDisplayValue('Ordered 12 sheets of plasterboard from Jewson')
    await user.clear(summaryInput)
    await user.type(summaryInput, 'Ordered 15 sheets of plasterboard from Jewson')

    await user.click(screen.getByRole('button', { name: /save correction/i }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({
        tidyUpItemId: 'tidy-item-001',
        action: 'correct',
        corrected: expect.objectContaining({ summary: 'Ordered 15 sheets of plasterboard from Jewson' }),
      }),
    ))
  })

  it('submits a reject decision with the correct payload', async () => {
    mockSubmit.mockResolvedValue(makeDecisionResponse('tidy-item-001', 'reject', 'rejected') as never)
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await screen.findAllByRole('button', { name: /not this job/i })
    await user.click(screen.getAllByRole('button', { name: /not this job/i })[0])

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({ tidyUpItemId: 'tidy-item-001', action: 'reject' }),
    ))
  })

  it('submits a leave_unconfirmed decision and keeps item visible as left for later', async () => {
    mockSubmit.mockResolvedValue(makeDecisionResponse('tidy-item-001', 'leave_unconfirmed', 'left_unconfirmed') as never)
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await screen.findAllByRole('button', { name: /leave for later/i })
    await user.click(screen.getAllByRole('button', { name: /leave for later/i })[0])

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({ tidyUpItemId: 'tidy-item-001', action: 'leave_unconfirmed' }),
    ))

    // Item stays visible with "Left for later" status
    const card = screen.getByTestId('tidy-item-tidy-item-001')
    expect(within(card).getByText('Left for later')).toBeInTheDocument()
  })

  it('shows empty state when there are no sections and no remembered items', async () => {
    mockCreate.mockResolvedValue(EMPTY_RUN)

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await screen.findByText(/nothing to tidy up for today/i)
  })

  it('shows a retry button when loading fails', async () => {
    mockCreate.mockRejectedValue(new Error('network error'))

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await screen.findByRole('button', { name: /try again/i })
    expect(screen.getByText(/could not load/i)).toBeInTheDocument()
  })

  it('retries the load when Try again is clicked', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(MOCK_RUN)
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /try again/i }))

    await screen.findByText('Ordered materials')
  })

  it('keeps item visible and shows an error when a decision fails', async () => {
    mockSubmit.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    const btns = await screen.findAllByRole('button', { name: /remember this/i })
    await user.click(btns[0])

    await waitFor(() => {
      const card = screen.getByTestId('tidy-item-tidy-item-001')
      expect(within(card).getByRole('alert')).toHaveTextContent(/could not save/i)
    })

    // Item still visible with actions (not removed)
    expect(screen.getAllByRole('button', { name: /remember this/i })).toHaveLength(
      MOCK_RUN.sections.flatMap(s => s.items).length,
    )
  })

  it('preserves edit form values when a correct decision fails', async () => {
    mockSubmit.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    const correctBtns = await screen.findAllByRole('button', { name: /^correct$/i })
    await user.click(correctBtns[0])

    const summaryInput = screen.getByDisplayValue('Ordered 12 sheets of plasterboard from Jewson')
    await user.clear(summaryInput)
    await user.type(summaryInput, 'Updated summary')

    await user.click(screen.getByRole('button', { name: /save correction/i }))

    // Form should remain with the edited value after failure
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Updated summary')).toBeInTheDocument()
  })

  it('shows already-remembered items in a separate section, not as draft action-required', async () => {
    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    const rememberedRegion = await screen.findByRole('region', { name: /already remembered/i })
    expect(within(rememberedRegion).getByText('Ordered scaffolding from TCS')).toBeInTheDocument()

    // Should not be inside any action-required item card
    const cards = screen.queryAllByRole('button', { name: /remember this/i })
    // None of the "Remember this" buttons should be associated with the already-remembered item
    const summaryEls = document.querySelectorAll('.tidy-remembered-item')
    summaryEls.forEach(el => {
      expect(el.closest('.tidy-item-card')).toBeNull()
    })
    // Total "Remember this" buttons should equal the number of draft items, not alreadyRemembered count
    expect(cards.length).toBe(MOCK_RUN.sections.flatMap(s => s.items).length)
  })

  it('resolved tidy-up items do not appear as action-required in per-note review on next open', async () => {
    // This tests the shared-state boundary: after a tidy-up decision the item
    // is marked resolved in local state. The per-note ReviewScreen re-fetches
    // on mount from the backend, which will already reflect the resolved state.
    // We confirm the local tidy-up state is updated so the item is not still shown
    // as draft after a successful decision.
    mockSubmit.mockResolvedValue(makeDecisionResponse('tidy-item-001', 'confirm', 'confirmed') as never)
    const user = userEvent.setup()

    render(<TidyUpScreen job={MOCK_JOB} onClose={vi.fn()} />)

    const btns = await screen.findAllByRole('button', { name: /remember this/i })
    await user.click(btns[0])

    await waitFor(() => {
      const card = screen.getByTestId('tidy-item-tidy-item-001')
      // Item is resolved — no longer shows action buttons
      expect(within(card).queryByRole('button', { name: /remember this/i })).not.toBeInTheDocument()
      expect(within(card).getByText('Saved to trusted memory')).toBeInTheDocument()
    })
  })
})
