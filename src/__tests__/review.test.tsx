import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewScreen from '../ReviewScreen'
import { getReviewDraft, submitReviewDecision } from '../api'
import type { ReviewDraftSection } from '../types'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn(),
  getReviewDraft: vi.fn(),
  submitReviewDecision: vi.fn(),
}))

const JOB = {
  id: 'job-test-001',
  title: 'Garden Room',
  jobType: 'garden_room' as const,
  roughLocationOrLabel: 'Test site',
  status: 'active' as const,
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

// ── Shared mock draft data ────────────────────────────────────────────────────

const ORDERED_ITEM = {
  id: 'fact-001',
  factType: 'ordered_material' as const,
  status: 'draft' as const,
  summary: 'Ordered 12 sheets of plasterboard from Jewson',
  confidenceLabel: 'high' as const,
  confidenceReason: null,
  uncertaintyFlags: [],
  materialName: 'plasterboard',
  quantity: '12',
  unit: 'sheets',
  supplierName: 'Jewson',
  deliveryTiming: 'tomorrow morning',
  locationOrUse: null,
  sourceTranscript: 'Ordered another 12 sheets of plasterboard from Jewson, coming tomorrow morning.',
  sourceNoteIds: ['srv-001'],
}

const UNCLEAR_ITEM = {
  id: 'fact-002',
  factType: 'unclear' as const,
  status: 'unclear' as const,
  summary: 'Possibly around 3 insulation packs left',
  confidenceLabel: 'low' as const,
  confidenceReason: null,
  uncertaintyFlags: ['approximate_quantity'],
  materialName: 'insulation',
  quantity: '3',
  unit: 'packs',
  supplierName: null,
  deliveryTiming: null,
  locationOrUse: null,
  sourceTranscript: 'Probably got three insulation packs left.',
  sourceNoteIds: ['srv-001'],
}

const SECOND_ITEM = {
  id: 'fact-003',
  factType: 'ordered_material' as const,
  status: 'draft' as const,
  summary: 'Ordered 5 boxes of ceramic tiles from BuildBase',
  confidenceLabel: 'high' as const,
  confidenceReason: null,
  uncertaintyFlags: [],
  materialName: 'ceramic tiles',
  quantity: '5',
  unit: 'boxes',
  supplierName: 'BuildBase',
  deliveryTiming: null,
  locationOrUse: null,
  sourceTranscript: 'Got 5 boxes of tiles from BuildBase.',
  sourceNoteIds: ['srv-002'],
}

const MOCK_DRAFT: ReviewDraftSection[] = [
  { key: 'ordered_material', label: 'Ordered materials', items: [ORDERED_ITEM] },
  { key: 'unclear', label: 'Unclear items', items: [UNCLEAR_ITEM] },
]

const mockGetReviewDraft = vi.mocked(getReviewDraft)
const mockSubmitDecision = vi.mocked(submitReviewDecision)
const mockOnClose = vi.fn()

describe('ReviewScreen', () => {
  beforeEach(() => {
    mockGetReviewDraft.mockResolvedValue(MOCK_DRAFT)
    mockSubmitDecision.mockResolvedValue({})
  })

  // ── Loading and error ───────────────────────────────────────────────────────

  it('shows a retryable error when the review draft fetch fails', async () => {
    mockGetReviewDraft.mockRejectedValue(new Error('network error'))

    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getByText(/could not load draft facts/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('retries the fetch when "Try again" is clicked after a failure', async () => {
    mockGetReviewDraft
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue(MOCK_DRAFT)

    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => {
      expect(screen.getByText('Ordered 12 sheets of plasterboard from Jewson')).toBeInTheDocument()
    })
  })

  // ── Content rendering ───────────────────────────────────────────────────────

  it('renders grouped sections with section headings', async () => {
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getByText('Ordered materials')).toBeInTheDocument()
      expect(screen.getByText('Unclear items')).toBeInTheDocument()
    })
  })

  it('shows source transcript context for each draft item', async () => {
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getByText('Ordered another 12 sheets of plasterboard from Jewson, coming tomorrow morning.')).toBeInTheDocument()
    })
  })

  it('shows "Source not available" when sourceTranscript is null', async () => {
    const draftWithoutSource = {
      ...ORDERED_ITEM,
      id: 'fact-003',
      sourceTranscript: null,
    }
    mockGetReviewDraft.mockResolvedValue([
      { key: 'ordered_material', label: 'Ordered materials', items: [draftWithoutSource] },
    ])

    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getByText(/source not available/i)).toBeInTheDocument()
    })
  })

  it('shows "From what the system heard" source label', async () => {
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getAllByText(/from what the system heard/i).length).toBeGreaterThan(0)
    })
  })

  it('does not label draft items as trusted memory before Mike acts', async () => {
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getByText('Ordered 12 sheets of plasterboard from Jewson')).toBeInTheDocument()
    })
    expect(screen.queryByText(/saved to trusted memory/i)).not.toBeInTheDocument()
  })

  // ── Confirm item ────────────────────────────────────────────────────────────

  it('confirms an item and shows "Saved to trusted memory"', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: /confirm$/i })[0]).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: /confirm$/i })[0])

    await waitFor(() => {
      expect(screen.getByText(/saved to trusted memory/i)).toBeInTheDocument()
    })
    expect(mockSubmitDecision).toHaveBeenCalledWith(JOB.id, {
      action: 'confirm',
      candidateFactId: 'fact-001',
    })
  })

  // ── Edit / correct item ─────────────────────────────────────────────────────

  it('shows an edit form when Edit is clicked', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^edit$/i })[0]).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  it('submits a correct decision with the edited summary', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^edit$/i })[0]).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0])

    // Clear and retype the summary textarea
    const summaryInput = screen.getByRole('textbox', { name: /summary/i })
    await user.clear(summaryInput)
    await user.type(summaryInput, 'Ordered 14 sheets of plasterboard from Jewson')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mockSubmitDecision).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
        action: 'correct',
        candidateFactId: 'fact-001',
        corrected: expect.objectContaining({
          summary: 'Ordered 14 sheets of plasterboard from Jewson',
        }),
      }))
    })
    await waitFor(() => {
      expect(screen.getByText(/saved to trusted memory/i)).toBeInTheDocument()
    })
  })

  it('hides the edit form when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^edit$/i })[0]).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^edit$/i })[0]).toBeInTheDocument()
    })
  })

  // ── Reject item ─────────────────────────────────────────────────────────────

  it('removes a rejected item from the review list', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: /reject/i })[0]).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: /reject/i })[0])

    await waitFor(() => {
      expect(mockSubmitDecision).toHaveBeenCalledWith(JOB.id, {
        action: 'reject',
        candidateFactId: 'fact-001',
      })
    })
    await waitFor(() => {
      expect(screen.queryByText('Ordered 12 sheets of plasterboard from Jewson')).not.toBeInTheDocument()
    })
  })

  // ── Section confirm ─────────────────────────────────────────────────────────

  it('confirms a section with correct sectionItemIds payload', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /confirm section/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /confirm section/i }))

    await waitFor(() => {
      expect(mockSubmitDecision).toHaveBeenCalledWith(JOB.id, {
        action: 'confirm_section',
        sectionKey: 'ordered_material',
        candidateFactIds: ['fact-001'],
      })
    })
    await waitFor(() => {
      expect(screen.getByText(/saved to trusted memory/i)).toBeInTheDocument()
    })
  })

  it('marks only confirmed items and shows section error when BE skips some', async () => {
    const DRAFT_TWO_ITEMS: ReviewDraftSection[] = [
      { key: 'ordered_material', label: 'Ordered materials', items: [ORDERED_ITEM, SECOND_ITEM] },
      { key: 'unclear', label: 'Unclear items', items: [UNCLEAR_ITEM] },
    ]
    const DRAFT_AFTER_REFRESH: ReviewDraftSection[] = [
      { key: 'ordered_material', label: 'Ordered materials', items: [SECOND_ITEM] },
      { key: 'unclear', label: 'Unclear items', items: [UNCLEAR_ITEM] },
    ]
    mockGetReviewDraft
      .mockResolvedValueOnce(DRAFT_TWO_ITEMS)
      .mockResolvedValueOnce(DRAFT_AFTER_REFRESH)
    mockSubmitDecision.mockResolvedValueOnce({
      confirmed: [{ candidateFactId: 'fact-001', memoryItemId: 'mem-001' }],
      skipped: [{ candidateFactId: 'fact-003', reason: 'already_reviewed' }],
    })

    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /confirm section/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /confirm section/i }))

    // Skipped item (fact-003) should remain visible after re-fetch
    await waitFor(() => {
      expect(screen.getByText('Ordered 5 boxes of ceramic tiles from BuildBase')).toBeInTheDocument()
    })
    // Confirmed item (fact-001) removed by re-fetch, no longer in DOM
    expect(screen.queryByText('Ordered 12 sheets of plasterboard from Jewson')).not.toBeInTheDocument()
    // Section error about skipped item
    expect(screen.getByText(/1 item\(s\) could not be confirmed/i)).toBeInTheDocument()
    // getReviewDraft called twice: initial load + re-fetch after partial confirm
    expect(mockGetReviewDraft).toHaveBeenCalledTimes(2)
  })

  it('does not show a "Confirm section" button for the unclear section', async () => {
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(screen.getByText('Unclear items')).toBeInTheDocument()
    })

    // Only one "Confirm section" button — for the ordered_material section, not unclear
    const confirmSectionBtns = screen.queryAllByRole('button', { name: /confirm section/i })
    expect(confirmSectionBtns).toHaveLength(1)
  })

  // ── Add missing ─────────────────────────────────────────────────────────────

  it('shows and submits the add missing form', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /add missing item/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /add missing item/i }))

    await waitFor(() => expect(screen.getByRole('form', { name: /add missing item/i })).toBeInTheDocument())

    const summaryInput = screen.getByRole('textbox', { name: /summary/i })
    await user.type(summaryInput, 'Used 3 bags of cement')

    await user.click(screen.getByRole('button', { name: /save to memory/i }))

    await waitFor(() => {
      expect(mockSubmitDecision).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
        action: 'add_missing',
        memoryType: expect.any(String),
        memory: expect.objectContaining({
          summary: 'Used 3 bags of cement',
        }),
      }))
    })
  })

  it('preserves add missing form values and shows error when submission fails', async () => {
    mockSubmitDecision.mockRejectedValue(new Error('network error'))

    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /add missing item/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /add missing item/i }))

    const summaryInput = screen.getByRole('textbox', { name: /summary/i })
    await user.type(summaryInput, 'Used 3 bags of cement')
    await user.click(screen.getByRole('button', { name: /save to memory/i }))

    await waitFor(() => {
      expect(screen.getByText(/could not save/i)).toBeInTheDocument()
    })
    // Form must still be visible with the typed value
    expect(screen.getByRole('textbox', { name: /summary/i })).toHaveValue('Used 3 bags of cement')
  })

  // ── Decision failure ────────────────────────────────────────────────────────

  it('keeps the item visible and shows an error when confirm fails', async () => {
    mockSubmitDecision.mockRejectedValue(new Error('server error'))

    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: /confirm$/i })[0]).toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: /confirm$/i })[0])

    await waitFor(() => {
      expect(screen.getByText(/could not confirm/i)).toBeInTheDocument()
    })
    // Draft item must remain visible — not optimistically removed
    expect(screen.getByText('Ordered 12 sheets of plasterboard from Jewson')).toBeInTheDocument()
    expect(screen.queryByText(/saved to trusted memory/i)).not.toBeInTheDocument()
  })

  it('shows section error and keeps items visible when section confirm fails', async () => {
    mockSubmitDecision.mockRejectedValue(new Error('conflict'))

    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /confirm section/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /confirm section/i }))

    await waitFor(() => {
      expect(screen.getByText(/could not confirm section/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Ordered 12 sheets of plasterboard from Jewson')).toBeInTheDocument()
  })

  // ── Navigation ──────────────────────────────────────────────────────────────

  it('calls onClose when the back button is clicked', async () => {
    const user = userEvent.setup()
    render(<ReviewScreen job={JOB} onClose={mockOnClose} />)

    // Back button is visible even during loading
    await user.click(screen.getByRole('button', { name: /← back/i }))
    expect(mockOnClose).toHaveBeenCalled()
  })
})
