import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ReviewQueueScreen from '../ReviewQueueScreen'
import * as api from '../api'
import type { BudgetCategory, Job, QueueItem, ReviewQueue } from '../types'

const mockGetReviewQueue = vi.mocked(api.getReviewQueue)
const mockSubmitQueueDecision = vi.mocked(api.submitQueueDecision)
const mockUpdateMemoryItem = vi.mocked(api.updateMemoryItem)
const mockVerifyMemoryItem = vi.mocked(api.verifyMemoryItem)

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getReviewQueue: vi.fn(),
    submitQueueDecision: vi.fn(),
    updateMemoryItem: vi.fn(),
    verifyMemoryItem: vi.fn(),
  }
})

const MOCK_JOB: Job = {
  id: 'job-001',
  title: 'Garden Room',
  jobType: 'garden_room',
  roughLocationOrLabel: 'Mrs Patel',
  status: 'started',
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const ITEM_SINGLE: QueueItem = {
  id: 'qi-001',
  kind: 'single',
  status: 'draft',
  reviewLabel: 'What I picked up today',
  timeLabel: 'Today',
  summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
  proposedMemory: {
    memoryType: 'ordered_material',
    summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
    materialName: 'hardcore',
    quantity: '8',
    unit: 'bags',
    supplierName: 'Jewson',
    deliveryTiming: null,
    locationOrUse: null,
    costAmount: '5',
    costCurrency: 'GBP',
    costQualifier: 'each',
    totalCostAmount: '40',
  },
  confidenceLabel: 'high',
  uncertaintyFlags: [],
  sourceCandidateFactIds: ['cf-001'],
  sourceContext: [
    {
      candidateFactId: 'cf-001',
      noteId: 'note-001',
      transcriptId: 'trans-001',
      capturedAt: '2026-06-07T09:00:00Z',
      transcriptText: 'Bought 8 bags of hardcore from Jewson, five pounds each.',
    },
  ],
}

const ITEM_DUPLICATE: QueueItem = {
  id: 'qi-002',
  kind: 'duplicate_group',
  status: 'draft',
  reviewLabel: 'Looks like the same item',
  timeLabel: 'Today',
  summary: 'Used OSB boards on the back wall',
  proposedMemory: {
    memoryType: 'used_material',
    summary: 'Used OSB boards on the back wall',
    materialName: 'OSB',
    quantity: null,
    unit: null,
    supplierName: null,
    deliveryTiming: null,
    locationOrUse: 'back wall',
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    totalCostAmount: null,
  },
  confidenceLabel: 'medium',
  uncertaintyFlags: [],
  sourceCandidateFactIds: ['cf-002', 'cf-003'],
  sourceContext: [
    {
      candidateFactId: 'cf-002',
      noteId: 'note-001',
      transcriptId: 'trans-001',
      capturedAt: '2026-06-07T09:00:00Z',
      transcriptText: 'Used six OSB boards on the back wall.',
    },
    {
      candidateFactId: 'cf-003',
      noteId: 'note-002',
      transcriptId: 'trans-002',
      capturedAt: '2026-06-07T10:00:00Z',
      transcriptText: 'Put some OSB on the back wall earlier.',
    },
  ],
}

function makeQueue(overrides?: Partial<ReviewQueue>): ReviewQueue {
  return {
    jobId: MOCK_JOB.id,
    generatedAt: '2026-06-07T12:00:00Z',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [ITEM_SINGLE] },
      { key: 'used_materials', label: 'Used materials', items: [ITEM_DUPLICATE] },
    ],
    alreadyRemembered: [],
    ...overrides,
  }
}

function emptyQueue(): ReviewQueue {
  return {
    jobId: MOCK_JOB.id,
    generatedAt: '2026-06-07T12:00:00Z',
    sections: [],
    alreadyRemembered: [],
  }
}

describe('ReviewQueueScreen', () => {
  beforeEach(() => {
    mockGetReviewQueue.mockResolvedValue(makeQueue())
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001',
      action: 'confirm',
      status: 'confirmed',
      memoryItemId: 'mem-001',
      sourceCandidateFactIds: ['cf-001'],
    })
  })

  it('shows loading state then renders queue items', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Bought / ordered')).toBeInTheDocument()
    })
    expect(screen.getByText('OSB')).toBeInTheDocument()
  })

  it('shows "Nothing waiting" empty state for an empty queue', async () => {
    mockGetReviewQueue.mockResolvedValue(emptyQueue())
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Nothing waiting')).toBeInTheDocument()
    })
  })

  it('shows retry button on load failure and retries on click', async () => {
    mockGetReviewQueue.mockRejectedValueOnce(new Error('network'))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Could not load your queue.')).toBeInTheDocument()
    })

    mockGetReviewQueue.mockResolvedValue(makeQueue())
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => {
      expect(screen.getByText('Bought / ordered')).toBeInTheDocument()
    })
  })

  it('displays section headings', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Ordered materials')).toBeInTheDocument()
    })
    expect(screen.getByText('Used materials')).toBeInTheDocument()
  })

  it('shows time labels on already-remembered cards', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [
        { memoryItemId: 'mem-001', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    // draft cards drop the redundant per-card time; remembered context keeps it
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('shows duplicate badge for duplicate_group items', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Looks like the same item')).toBeInTheDocument()
    })
  })

  it('source context is collapsed by default and expands on click', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Bought / ordered')).toBeInTheDocument()
    })

    const toggles = screen.getAllByText(/this came from your note/i)
    expect(toggles.length).toBeGreaterThan(0)
    expect(screen.queryByText(/Ordered twelve sheets of plasterboard from Jewson\./)).not.toBeInTheDocument()

    fireEvent.click(toggles[0])
    expect(screen.getByText('"Bought 8 bags of hardcore from Jewson, five pounds each."')).toBeInTheDocument()
  })

  it('collapses source context on second click', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getAllByText(/this came from your note/i))

    const toggle = screen.getAllByText(/this came from your note/i)[0]
    fireEvent.click(toggle)
    expect(screen.getByText('"Bought 8 bags of hardcore from Jewson, five pounds each."')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('"Bought 8 bags of hardcore from Jewson, five pounds each."')).not.toBeInTheDocument()
  })

  it('confirm action sends confirm decision and shows "Saved to trusted memory"', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001',
      action: 'confirm',
      status: 'confirmed',
      memoryItemId: 'mem-001',
      sourceCandidateFactIds: ['cf-001'],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /remember this/i })[0])

    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, {
        queueItemId: 'qi-001',
        action: 'confirm',
        corrected: undefined,
        reason: undefined,
        uncertaintyResolution: 'resolved',
      })
    })
    await waitFor(() => {
      expect(screen.getAllByText('Saved to trusted memory').length).toBeGreaterThan(0)
    })
  })

  it('dismiss action sends dismiss decision with reason and shows "Dismissed"', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001',
      action: 'dismiss',
      status: 'dismissed',
      sourceCandidateFactIds: ['cf-001'],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])

    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, {
        queueItemId: 'qi-001',
        action: 'dismiss',
        corrected: undefined,
        reason: 'Not about this job',
        uncertaintyResolution: undefined,
      })
    })
    await waitFor(() => {
      expect(screen.getByText('Dismissed')).toBeInTheDocument()
    })
  })

  it('correct action opens edit form and submits corrected memory', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001',
      action: 'correct',
      status: 'corrected',
      memoryItemId: 'mem-001',
      sourceCandidateFactIds: ['cf-001'],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])

    const form = screen.getByRole('form', { name: /edit correction/i })
    expect(form).toBeInTheDocument()

    // Update summary
    const summaryInput = form.querySelector<HTMLInputElement>('input[name="summary"]')!
    fireEvent.change(summaryInput, { target: { value: 'Ordered 10 bags of hardcore from Jewson' } })

    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))

    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({
        queueItemId: 'qi-001',
        action: 'correct',
        corrected: expect.objectContaining({ summary: 'Ordered 10 bags of hardcore from Jewson' }),
      }))
    })
    await waitFor(() => {
      expect(screen.getAllByText('Saved to trusted memory').length).toBeGreaterThan(0)
    })
  })

  it('cancel in edit form closes the form without submitting', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])
    expect(screen.getByRole('form', { name: /edit correction/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('form', { name: /edit correction/i })).not.toBeInTheDocument()
    expect(mockSubmitQueueDecision).not.toHaveBeenCalled()
  })

  it('edit form type selector excludes unclear', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])

    // The type combobox is the first select in the form (Type label)
    const typeSelect = screen.getAllByRole('combobox')[0]
    const options = Array.from(typeSelect.querySelectorAll('option')).map(o => o.value)
    expect(options).not.toContain('unclear')
    expect(options).toContain('labour')
    expect(options.length).toBe(7)
  })

  it('shows item-level error on decision failure with retry possible', async () => {
    mockSubmitQueueDecision.mockRejectedValue(new Error('network'))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /remember this/i })[0])

    await waitFor(() => {
      expect(screen.getByText('Could not save — tap to retry')).toBeInTheDocument()
    })
    // Actions should still be available for retry
    expect(screen.getAllByRole('button', { name: /remember this/i }).length).toBeGreaterThan(0)
  })

  it('shows already-remembered section with time labels', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [
        { memoryItemId: 'mem-001', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /already remembered/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    expect(screen.getByText('Ordered scaffolding from TCS')).toBeInTheDocument()
    expect(screen.getByText(/Yesterday/)).toBeInTheDocument()
  })

  it('shows type chip for each remembered item', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [
        { memoryItemId: 'mem-001', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
        { memoryItemId: 'mem-002', summary: 'Watch out near back door', memoryType: 'watch_out' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('region', { name: /already remembered/i }))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    // Scope to the remembered region so the type chips don't clash with the
    // category focus chips (which also read "Ordered …").
    const remembered = screen.getByRole('region', { name: /already remembered/i })
    expect(within(remembered).getByText('Ordered')).toBeInTheDocument()
    expect(within(remembered).getByText('Watch out')).toBeInTheDocument()
  })

  it('shows structured details for remembered items that have them', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [
        {
          memoryItemId: 'mem-001',
          summary: 'Ordered scaffolding from TCS',
          memoryType: 'ordered_material',
          timeLabel: 'Yesterday',
          supplierName: 'TCS',
          deliveryTiming: 'Friday morning',
          materialName: 'scaffolding',
          quantity: null,
          unit: null,
          locationOrUse: null,
        },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('region', { name: /already remembered/i }))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    expect(screen.getByText('scaffolding')).toBeInTheDocument()
    expect(screen.getByText('TCS')).toBeInTheDocument()
    expect(screen.getByText('Friday morning')).toBeInTheDocument()
  })

  it('omits details dl when no structured fields present', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [
        { memoryItemId: 'mem-001', summary: 'Watch out near back door', memoryType: 'watch_out' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('region', { name: /already remembered/i }))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    expect(screen.getByText('Watch out near back door')).toBeInTheDocument()
    const rememberedRegion = screen.getByRole('region', { name: /already remembered/i })
    expect(rememberedRegion.querySelector('.card-detail-fields')).not.toBeInTheDocument()
  })

  it('remembered card shows labelled cost and total rows', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [],
      alreadyRemembered: [
        {
          memoryItemId: 'mem-001',
          summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
          memoryType: 'ordered_material',
          materialName: 'hardcore',
          quantity: '8',
          unit: 'bags',
          supplierName: 'Jewson',
          costAmount: '5',
          costCurrency: 'GBP',
          costQualifier: 'each' as const,
          totalCostAmount: '40',
          uncertaintyFlags: [],
        },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('region', { name: /already remembered/i }))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    expect(screen.getByText('£5 each')).toBeInTheDocument()
    expect(screen.getByText('£40')).toBeInTheDocument()
  })

  it('remembered card shows Worth checking when uncertaintyFlags is non-empty', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [
        {
          memoryItemId: 'mem-001',
          summary: 'Ordered something uncertain',
          memoryType: 'ordered_material',
          materialName: 'timber',
          uncertaintyFlags: ['quantity_ambiguous'],
        },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('region', { name: /already remembered/i }))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    expect(screen.getByText('Worth checking')).toBeInTheDocument()
  })

  it('corrected summary and cost appear on card after saving a correction', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001',
      action: 'correct',
      status: 'corrected',
      memoryItemId: 'mem-001',
      sourceCandidateFactIds: ['cf-001'],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])

    const form = screen.getByRole('form', { name: /edit correction/i })
    const summaryInput = form.querySelector<HTMLInputElement>('input[name="summary"]')!
    fireEvent.change(summaryInput, { target: { value: 'Ordered 10 bags of hardcore from Jewson' } })

    const costInput = form.querySelector<HTMLInputElement>('input[placeholder="e.g. 5.00"]')!
    fireEvent.change(costInput, { target: { value: '4.50' } })

    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))

    await waitFor(() => screen.getAllByText('Saved to trusted memory'))
    expect(screen.getByText(/£4.50 each/)).toBeInTheDocument()
    // Stale prose must not appear as a conflicting headline after correction
    expect(screen.queryByText('Ordered 8 bags of hardcore from Jewson at £5 each')).not.toBeInTheDocument()
  })

  it('multiple remembered items are individually scannable as separate elements', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [
        { memoryItemId: 'mem-001', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
        { memoryItemId: 'mem-002', summary: 'Watch out near back door', memoryType: 'watch_out', timeLabel: 'Earlier' },
        { memoryItemId: 'mem-003', summary: 'Used three OSB sheets on the wall', memoryType: 'used_material', timeLabel: 'Today' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('region', { name: /already remembered/i }))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    const cards = document.querySelectorAll('.queue-remembered-card')
    expect(cards.length).toBe(3)
    expect(cards[0].textContent).toContain('Ordered scaffolding from TCS')
    expect(cards[1].textContent).toContain('Watch out near back door')
    expect(cards[2].textContent).toContain('Used three OSB sheets on the wall')
  })

  it('remembered cards have no confirm/correct/dismiss action buttons', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [],
      alreadyRemembered: [
        { memoryItemId: 'mem-001', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('region', { name: /already remembered/i }))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
    expect(screen.queryByRole('button', { name: /remember this/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fix details/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()
  })

  it('already-remembered section is hidden when empty', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    expect(screen.queryByRole('region', { name: /already remembered/i })).not.toBeInTheDocument()
  })

  it('displays job title', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Garden Room')).toBeInTheDocument())
  })

  it('"Things to check" heading is always shown', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /things to check/i })).toBeInTheDocument()
  })

  it('back button calls onClose', async () => {
    const onClose = vi.fn()
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('duplicate group shows multiple source contexts', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getAllByText('OSB'))

    const toggles = screen.getAllByText(/this came from your note/i)
    // expand the duplicate item's toggle (second one in DOM)
    const dupeToggle = toggles[1]
    fireEvent.click(dupeToggle)

    expect(screen.getByText('"Used six OSB boards on the back wall."')).toBeInTheDocument()
    expect(screen.getByText('"Put some OSB on the back wall earlier."')).toBeInTheDocument()
  })

  it('null transcriptText shows "Source unavailable" inside expanded context', async () => {
    const itemNoText: QueueItem = {
      ...ITEM_SINGLE,
      id: 'qi-notext',
      sourceContext: [
        {
          candidateFactId: 'cf-notext',
          noteId: 'note-001',
          transcriptId: 'trans-001',
          capturedAt: '2026-06-07T09:00:00Z',
          transcriptText: null,
        },
      ],
    }
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [itemNoText] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText(/this came from your note/i))

    const toggle = screen.getByText(/this came from your note/i)
    fireEvent.click(toggle)
    expect(screen.getByText('Source unavailable')).toBeInTheDocument()
  })

  it('empty sourceContext array shows "Source unavailable" directly', async () => {
    const itemNoCtx: QueueItem = {
      ...ITEM_SINGLE,
      id: 'qi-noctx',
      sourceContext: [],
    }
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [itemNoCtx] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    expect(screen.getByText('Source unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/this came from your note/i)).not.toBeInTheDocument()
  })

  it('confirmed item hides action buttons', async () => {
    const confirmedItem: QueueItem = { ...ITEM_SINGLE, id: 'qi-confirmed', status: 'confirmed' }
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [confirmedItem] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Saved to trusted memory'))
    expect(screen.queryByRole('button', { name: /remember this/i })).not.toBeInTheDocument()
  })

  it('dismissed item hides action buttons', async () => {
    const dismissedItem: QueueItem = { ...ITEM_SINGLE, id: 'qi-dismissed', status: 'dismissed' }
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [dismissedItem] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Dismissed'))
    expect(screen.queryByRole('button', { name: /remember this/i })).not.toBeInTheDocument()
  })

  it('submitting state disables action buttons', async () => {
    let resolveDecision!: (v: Awaited<ReturnType<typeof api.submitQueueDecision>>) => void
    mockSubmitQueueDecision.mockReturnValue(
      new Promise(res => { resolveDecision = res })
    )
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    const rememberBtn = screen.getAllByRole('button', { name: /remember this/i })[0]
    fireEvent.click(rememberBtn)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /saving/i }).length).toBeGreaterThan(0)
    })

    act(() => {
      resolveDecision({
        queueItemId: 'qi-001',
        action: 'confirm',
        status: 'confirmed',
        memoryItemId: 'mem-001',
        sourceCandidateFactIds: [],
      })
    })
  })

  it('card shows a scannable headline, supplier meta and cost without expanding source', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    expect(screen.getByText('8 bags · hardcore')).toBeInTheDocument()
    expect(screen.getByText('Jewson')).toBeInTheDocument()
    expect(screen.getByText(/£5 each · £40 total/)).toBeInTheDocument()

    // Source context must still be collapsed
    expect(screen.queryByText(/five pounds each/i)).not.toBeInTheDocument()
  })

  it('card shows Worth checking for cost_uncertain items', async () => {
    const uncertainItem: QueueItem = {
      ...ITEM_SINGLE,
      id: 'qi-uncertain',
      uncertaintyFlags: ['cost_uncertain'],
    }
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [uncertainItem] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    expect(screen.getByText(/Worth checking/)).toBeInTheDocument()
  })

  it('edit form has cost amount + qualifier, and derives the total for an each line', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])

    const form = screen.getByRole('form', { name: /edit correction/i })
    expect(form.querySelector('input[placeholder="e.g. 5.00"]')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /each \(per item\)/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /approximate/i })).toBeInTheDocument()
    // hardcore is £5 each × 8 bags → derived total shown, no manual Total field
    expect(form.querySelector('input[placeholder="e.g. 40"]')).not.toBeInTheDocument()
    expect(form.textContent).toMatch(/£40 total/)
  })

  it('correction omits an explicit total for an each line so the backend derives it', async () => {
    mockSubmitQueueDecision.mockResolvedValue({ queueItemId: 'qi-001', action: 'correct', status: 'corrected', memoryItemId: 'mem-001', sourceCandidateFactIds: ['cf-001'] })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])
    const form = screen.getByRole('form', { name: /edit correction/i })
    fireEvent.change(form.querySelector('input[placeholder="e.g. 5.00"]')!, { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalled())
    const decision = mockSubmitQueueDecision.mock.calls[mockSubmitQueueDecision.mock.calls.length - 1][1]
    expect(decision.corrected).toMatchObject({ costQualifier: 'each', costAmount: '6' })
    expect(decision.corrected).not.toHaveProperty('totalCostAmount')
  })

  it('blocks save with a warning for an each line missing quantity/unit', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [{
        ...ITEM_SINGLE,
        proposedMemory: { ...ITEM_SINGLE.proposedMemory, quantity: null, unit: null },
      }] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])
    const form = screen.getByRole('form', { name: /edit correction/i })
    expect(within(form).getByRole('alert').textContent).toMatch(/Add a quantity and a unit/)
    expect(screen.getByRole('button', { name: /save correction/i })).toBeDisabled()
  })

  it('shows one editable field for a `total` basis, not a second Cost amount field', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [{
        ...ITEM_SINGLE,
        proposedMemory: { ...ITEM_SINGLE.proposedMemory, costQualifier: 'total', costAmount: '40' },
      }] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])
    const form = screen.getByRole('form', { name: /edit correction/i })
    expect(within(form).getByText('Total cost')).toBeTruthy()
    expect(within(form).queryByText('Cost amount')).toBeNull()
    expect(form.querySelectorAll('input[name="costAmount"]')).toHaveLength(1)
    expect(form.querySelector('input[name="totalCostAmount"]')).not.toBeInTheDocument()
  })

  it('mirrors an edited `total` figure into totalCostAmount on save, not a stale value', async () => {
    mockSubmitQueueDecision.mockResolvedValue({ queueItemId: 'qi-001', action: 'correct', status: 'corrected', memoryItemId: 'mem-001', sourceCandidateFactIds: ['cf-001'] })
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [{
        ...ITEM_SINGLE,
        proposedMemory: { ...ITEM_SINGLE.proposedMemory, costQualifier: 'total', costAmount: '40' },
      }] }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])
    const form = screen.getByRole('form', { name: /edit correction/i })
    fireEvent.change(form.querySelector('input[name="costAmount"]')!, { target: { value: '55' } })
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalled())
    const decision = mockSubmitQueueDecision.mock.calls[mockSubmitQueueDecision.mock.calls.length - 1][1]
    expect(decision.corrected).toMatchObject({ costQualifier: 'total', costAmount: '55', totalCostAmount: '55' })
  })

  it('correction payload includes cost fields when changed', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001',
      action: 'correct',
      status: 'corrected',
      memoryItemId: 'mem-001',
      sourceCandidateFactIds: ['cf-001'],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])

    const form = screen.getByRole('form', { name: /edit correction/i })
    const costInput = form.querySelector<HTMLInputElement>('input[placeholder="e.g. 5.00"]')!
    fireEvent.change(costInput, { target: { value: '6' } })

    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))

    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({
        corrected: expect.objectContaining({ costAmount: '6' }),
      }))
    })
  })

  it('does not show accounting, procurement, or report language', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    expect(screen.queryByText(/invoice/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reorder/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/spend report/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/total spend/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/procurement/i)).not.toBeInTheDocument()
  })

  it('source context still expands and collapses after cost fields added', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    const toggle = screen.getAllByText(/this came from your note/i)[0]
    expect(screen.queryByText(/five pounds each/i)).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByText('"Bought 8 bags of hardcore from Jewson, five pounds each."')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText(/five pounds each/i)).not.toBeInTheDocument()
  })
})

// ── Real-use volume: counts, category focus, hierarchy ──────────────────────

function makeWatchItem(id: string): QueueItem {
  return {
    id,
    kind: 'single',
    status: 'draft',
    reviewLabel: 'Watch out',
    timeLabel: 'Today',
    summary: 'Watch out — uneven floor near back door',
    proposedMemory: {
      memoryType: 'watch_out',
      summary: 'Watch out — uneven floor near back door',
      materialName: null, quantity: null, unit: null, supplierName: null,
      deliveryTiming: null, locationOrUse: 'near back door',
      costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['cf-watch'],
    sourceContext: [],
  }
}

function makeVolumeQueue(overrides?: Partial<ReviewQueue>): ReviewQueue {
  return {
    jobId: MOCK_JOB.id,
    generatedAt: '2026-06-07T12:00:00Z',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [ITEM_SINGLE] },
      { key: 'used_materials', label: 'Used materials', items: [ITEM_DUPLICATE] },
      { key: 'leftovers', label: 'Leftovers', items: [] },
      { key: 'watch_outs', label: 'Watch outs', items: [makeWatchItem('qi-watch-1')] },
    ],
    alreadyRemembered: [
      { memoryItemId: 'mem-001', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
    ],
    ...overrides,
  }
}

describe('ReviewQueueScreen — real-use volume', () => {
  beforeEach(() => {
    mockGetReviewQueue.mockResolvedValue(makeVolumeQueue())
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001', action: 'confirm', status: 'confirmed',
      memoryItemId: 'mem-x', sourceCandidateFactIds: [],
    })
  })

  it('shows total pending count across all categories', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('3 waiting')).toBeInTheDocument())
  })

  it('shows per-category chips only for categories with pending items (no zero chips)', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByRole('button', { name: 'All 3' }))
    expect(screen.getByRole('button', { name: 'Ordered 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Used 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watch-outs 1' })).toBeInTheDocument()
    // the empty "Left over" category gets no chip
    expect(screen.queryByRole('button', { name: 'Left over 0' })).not.toBeInTheDocument()
  })

  it('renders pending items before the already-remembered section', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    const firstCard = document.querySelector('.queue-item-card')!
    const remembered = screen.getByRole('region', { name: /already remembered/i })
    // remembered region comes AFTER the first pending card in document order
    expect(firstCard.compareDocumentPosition(remembered) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('focusing a category reduces visible pending items to that category', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getByRole('button', { name: 'Used 1' }))

    expect(screen.getByText('OSB')).toBeInTheDocument()
    expect(screen.queryByText('Bought / ordered')).not.toBeInTheDocument()
    expect(screen.queryByText(/uneven floor/)).not.toBeInTheDocument()
    // total still visible while focused
    expect(screen.getByText('3 waiting')).toBeInTheDocument()
  })

  it('All shows every pending group again', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getByRole('button', { name: 'Used 1' }))
    expect(screen.queryByText('Bought / ordered')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All 3' }))
    expect(screen.getByText('Bought / ordered')).toBeInTheDocument()
    expect(screen.getByText('OSB')).toBeInTheDocument()
  })

  it('confirm updates total and category counts', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    // confirm the ordered (hardcore) item — first Remember this
    fireEvent.click(screen.getAllByRole('button', { name: /remember this/i })[0])

    await waitFor(() => expect(screen.getByText('2 waiting')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Ordered 0' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All 2' })).toBeInTheDocument()
  })

  it('dismiss updates total and category counts', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001', action: 'dismiss', status: 'dismissed', sourceCandidateFactIds: [],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])

    await waitFor(() => expect(screen.getByText('2 waiting')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Ordered 0' })).not.toBeInTheDocument()
  })

  it('correct updates total and category counts', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-001', action: 'correct', status: 'corrected',
      memoryItemId: 'mem-x', sourceCandidateFactIds: [],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getAllByRole('button', { name: /fix details/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))

    await waitFor(() => expect(screen.getByText('2 waiting')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Ordered 0' })).not.toBeInTheDocument()
  })

  it('keeps the focused category after acting on an item', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-002', action: 'dismiss', status: 'dismissed', sourceCandidateFactIds: [],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    fireEvent.click(screen.getByRole('button', { name: 'Used 1' }))
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    // still focused on Used (chip pressed), count dropped to 0, total updated
    await waitFor(() => expect(screen.getByText('2 waiting')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Used 0' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Bought / ordered')).not.toBeInTheDocument()
  })

  it('already remembered is collapsed below pending by default', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    // toggle present, content hidden until expanded
    expect(screen.getByRole('button', { name: /show remembered items/i })).toBeInTheDocument()
    expect(screen.queryByText('Ordered scaffolding from TCS')).not.toBeInTheDocument()
  })

  it('renders a large multi-category queue and stays pending-first', async () => {
    const many: QueueItem[] = Array.from({ length: 12 }, (_, i) => ({
      ...ITEM_SINGLE,
      id: `qi-many-${i}`,
    }))
    mockGetReviewQueue.mockResolvedValue(makeVolumeQueue({
      sections: [
        { key: 'ordered_materials', label: 'Ordered materials', items: many },
        { key: 'used_materials', label: 'Used materials', items: [ITEM_DUPLICATE] },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('13 waiting')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Ordered 12' })).toBeInTheDocument()
    expect(document.querySelectorAll('.queue-item-card').length).toBe(13)
  })

  it('already-remembered context follows the active category focus', async () => {
    mockGetReviewQueue.mockResolvedValue(makeVolumeQueue({
      alreadyRemembered: [
        { memoryItemId: 'mem-ord', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
        { memoryItemId: 'mem-watch', summary: 'Watch out near back door', memoryType: 'watch_out', timeLabel: 'Earlier' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    // All: both remembered shown when expanded
    fireEvent.click(screen.getByRole('button', { name: /show remembered items \(2\)/i }))
    const remembered = screen.getByRole('region', { name: /already remembered/i })
    expect(within(remembered).getByText('Ordered scaffolding from TCS')).toBeInTheDocument()
    expect(within(remembered).getByText('Watch out near back door')).toBeInTheDocument()

    // Focus Ordered: section stays expanded but now shows only ordered context
    fireEvent.click(screen.getByRole('button', { name: 'Ordered 1' }))
    const rememberedOrdered = screen.getByRole('region', { name: /already remembered/i })
    expect(within(rememberedOrdered).getByText('Ordered scaffolding from TCS')).toBeInTheDocument()
    expect(within(rememberedOrdered).queryByText('Watch out near back door')).not.toBeInTheDocument()
  })

  it('hides remembered context entirely for a focus with no matching memory', async () => {
    mockGetReviewQueue.mockResolvedValue(makeVolumeQueue({
      alreadyRemembered: [
        { memoryItemId: 'mem-ord', summary: 'Ordered scaffolding from TCS', memoryType: 'ordered_material', timeLabel: 'Yesterday' },
      ],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))

    // Used has a pending item but no remembered context → section hidden
    fireEvent.click(screen.getByRole('button', { name: 'Used 1' }))
    expect(screen.queryByRole('region', { name: /already remembered/i })).not.toBeInTheDocument()
  })
})

// ── Fix memory on Already-remembered cards (in-place trusted-memory correction) ──

describe('ReviewQueueScreen — Fix memory on remembered cards', () => {
  const REMEMBERED = {
    memoryItemId: 'mem-ord', summary: 'Ordered scaffolding from TCS',
    memoryType: 'ordered_material' as const, timeLabel: 'Yesterday',
    materialName: 'scaffolding', quantity: '1', unit: 'lot', supplierName: 'TCS',
    deliveryTiming: 'Friday morning', locationOrUse: null,
    costAmount: null, costCurrency: 'GBP', costQualifier: null, totalCostAmount: null,
    uncertaintyFlags: [],
  }

  function updatedMemItem(overrides: Partial<import('../types').MemoryViewItem>): import('../types').MemoryViewItem {
    return {
      id: 'mem-ord', memoryType: 'ordered_material', summary: 'Ordered scaffolding from TCS',
      materialName: 'scaffolding', quantity: '1', unit: 'lot', supplierName: 'TCS',
      deliveryTiming: 'Friday morning', locationOrUse: null,
      costAmount: null, costCurrency: 'GBP', costQualifier: null, totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '2026-06-20T09:00:00Z', updatedAt: '2026-06-20T09:00:00Z', source: null,
      ...overrides,
    }
  }

  beforeEach(() => {
    mockGetReviewQueue.mockResolvedValue(makeVolumeQueue({ alreadyRemembered: [REMEMBERED] }))
    mockUpdateMemoryItem.mockReset()
  })

  async function openRemembered() {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))
  }

  it('shows a Fix memory action on remembered cards', async () => {
    await openRemembered()
    const remembered = screen.getByRole('region', { name: /already remembered/i })
    expect(within(remembered).getByRole('button', { name: /fix memory/i })).toBeInTheDocument()
  })

  it('opens the shared structured edit form (Save memory)', async () => {
    await openRemembered()
    fireEvent.click(screen.getByRole('button', { name: /fix memory/i }))
    expect(screen.getByRole('form', { name: /edit memory/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save memory/i })).toBeInTheDocument()
  })

  it('saves via updateMemoryItem and updates the card in place', async () => {
    mockUpdateMemoryItem.mockResolvedValue(updatedMemItem({ supplierName: 'Travis Perkins', quantity: '2' }))
    await openRemembered()
    fireEvent.click(screen.getByRole('button', { name: /fix memory/i }))

    const form = screen.getByRole('form', { name: /edit memory/i })
    fireEvent.change(form.querySelector('input[name="supplierName"]')!, { target: { value: 'Travis Perkins' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    await waitFor(() => {
      expect(mockUpdateMemoryItem).toHaveBeenCalledWith(MOCK_JOB.id, 'mem-ord',
        expect.objectContaining({ supplierName: 'Travis Perkins', memoryType: 'ordered_material' }))
    })
    const remembered = screen.getByRole('region', { name: /already remembered/i })
    await waitFor(() => expect(within(remembered).getByText('Travis Perkins')).toBeInTheDocument())
    expect(screen.queryByRole('form', { name: /edit memory/i })).not.toBeInTheDocument()
  })

  it('does NOT add a pending queue item or change the pending count', async () => {
    mockUpdateMemoryItem.mockResolvedValue(updatedMemItem({ quantity: '2' }))
    await openRemembered()
    expect(screen.getByText('3 waiting')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /fix memory/i }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="quantity"]')!, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())
    // pending total unchanged — no new draft / queue item created
    expect(screen.getByText('3 waiting')).toBeInTheDocument()
    expect(mockSubmitQueueDecision).not.toHaveBeenCalled()
  })

  it('shows an inline error and keeps the form on failure', async () => {
    mockUpdateMemoryItem.mockRejectedValue(new Error('network'))
    await openRemembered()
    fireEvent.click(screen.getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(screen.getByText(/could not save/i)).toBeInTheDocument())
    expect(screen.getByRole('form', { name: /edit memory/i })).toBeInTheDocument()
  })
})

// ── Worth checking resolution in Things to check ────────────────────────────

describe('ReviewQueueScreen — Worth checking resolution', () => {
  const UNCERTAIN_DRAFT: QueueItem = {
    ...ITEM_SINGLE,
    id: 'qi-unc',
    uncertaintyFlags: ['approximate_quantity'],
  }

  beforeEach(() => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-unc', action: 'confirm', status: 'confirmed',
      memoryItemId: 'mem-x', sourceCandidateFactIds: [],
    })
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [UNCERTAIN_DRAFT] }],
    }))
  })

  it('confirming a Worth checking draft sends uncertaintyResolution: resolved', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getByRole('button', { name: /^remember this$/i }))
    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id,
        expect.objectContaining({ action: 'confirm', uncertaintyResolution: 'resolved' }))
    })
  })

  it('correcting a Worth checking draft sends uncertaintyResolution: resolved', async () => {
    mockSubmitQueueDecision.mockResolvedValue({
      queueItemId: 'qi-unc', action: 'correct', status: 'corrected',
      memoryItemId: 'mem-x', sourceCandidateFactIds: [],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getByRole('button', { name: /fix details/i }))
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))
    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id,
        expect.objectContaining({ action: 'correct', uncertaintyResolution: 'resolved' }))
    })
  })

  it('Remember but still unsure sends uncertaintyResolution: still_unsure', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getByRole('button', { name: /still unsure/i }))
    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id,
        expect.objectContaining({ action: 'confirm', uncertaintyResolution: 'still_unsure' }))
    })
  })

  it('a non-uncertain draft has no Still unsure action', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue())
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    expect(screen.queryByRole('button', { name: /still unsure/i })).not.toBeInTheDocument()
  })

  it('verifying an uncertain already-remembered card clears its Worth checking', async () => {
    mockVerifyMemoryItem.mockResolvedValue({ uncertaintyFlags: [] })
    mockGetReviewQueue.mockResolvedValue(makeQueue({
      alreadyRemembered: [{
        memoryItemId: 'mem-ord', summary: 'Ordered scaffolding from TCS',
        memoryType: 'ordered_material', timeLabel: 'Yesterday',
        materialName: 'scaffolding', uncertaintyFlags: ['approximate_quantity'],
      }],
    }))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Bought / ordered'))
    fireEvent.click(screen.getByRole('button', { name: /show remembered items/i }))

    const remembered = screen.getByRole('region', { name: /already remembered/i })
    expect(within(remembered).getByText('Worth checking')).toBeInTheDocument()
    fireEvent.click(within(remembered).getByRole('button', { name: /this is right/i }))

    await waitFor(() => expect(mockVerifyMemoryItem).toHaveBeenCalledWith(MOCK_JOB.id, 'mem-ord'))
    await waitFor(() => expect(within(remembered).queryByText('Worth checking')).not.toBeInTheDocument())
  })
})

// ── Review-time budget category selection ───────────────────────────────────

const REVIEW_CATS: BudgetCategory[] = [
  { id: 'c1', jobId: 'job-001', name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' },
  { id: 'c2', jobId: 'job-001', name: 'cladding', budgetAmount: null, budgetCurrency: null, sortOrder: 1, isArchived: false, createdAt: '', updatedAt: '' },
]

// An ordered draft (timber) with a material-name suggestion for category c1.
const ITEM_TIMBER: QueueItem = {
  ...ITEM_SINGLE,
  id: 'qi-timber',
  summary: 'Ordered 6 lengths of timber',
  proposedMemory: {
    ...ITEM_SINGLE.proposedMemory,
    summary: 'Ordered 6 lengths of timber',
    materialName: 'timber',
    quantity: '6',
    unit: 'lengths',
    budgetCategoryId: 'c1',
    budgetCategorySuggestion: { budgetCategoryId: 'c1', categoryName: 'timber', reason: 'material_name_match' },
  },
}

function categoryQueue(): ReviewQueue {
  return {
    jobId: MOCK_JOB.id,
    generatedAt: '2026-06-07T12:00:00Z',
    budgetCategories: REVIEW_CATS,
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [ITEM_TIMBER] },
      { key: 'used_materials', label: 'Used materials', items: [ITEM_DUPLICATE] },
    ],
    alreadyRemembered: [],
  }
}

describe('ReviewQueueScreen — budget category in review', () => {
  beforeEach(() => {
    mockGetReviewQueue.mockResolvedValue(categoryQueue())
    mockSubmitQueueDecision.mockResolvedValue({ queueItemId: 'qi-timber', action: 'confirm', status: 'confirmed', memoryItemId: 'mem-qi-timber', sourceCandidateFactIds: [] })
  })

  it('shows the suggested category and defaults the selector to it', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const card = await screen.findByTestId('queue-item-qi-timber')
    expect(within(card).getByText('Suggested: timber')).toBeTruthy()
    expect((within(card).getByLabelText('Budget category') as HTMLSelectElement).value).toBe('c1')
  })

  it('does not show category controls for non-ordered memory', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const card = await screen.findByTestId('queue-item-qi-002') // used material
    expect(within(card).queryByLabelText('Budget category')).toBeNull()
  })

  it('does not show category controls when there are no active categories', async () => {
    mockGetReviewQueue.mockResolvedValue(makeQueue()) // no budgetCategories
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const card = await screen.findByTestId('queue-item-qi-001')
    expect(within(card).queryByLabelText('Budget category')).toBeNull()
  })

  it('confirms with the suggested category by default', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const card = await screen.findByTestId('queue-item-qi-timber')
    fireEvent.click(within(card).getByRole('button', { name: /remember this/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({
      queueItemId: 'qi-timber', action: 'confirm', budgetCategoryId: 'c1',
    })))
  })

  it('lets Mike change the category before remembering', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const card = await screen.findByTestId('queue-item-qi-timber')
    fireEvent.change(within(card).getByLabelText('Budget category'), { target: { value: 'c2' } })
    fireEvent.click(within(card).getByRole('button', { name: /remember this/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({
      budgetCategoryId: 'c2',
    })))
  })

  it('lets Mike clear the category before remembering', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const card = await screen.findByTestId('queue-item-qi-timber')
    fireEvent.change(within(card).getByLabelText('Budget category'), { target: { value: '' } })
    fireEvent.click(within(card).getByRole('button', { name: /remember this/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({
      budgetCategoryId: null,
    })))
  })
})

// ── Labour in review ────────────────────────────────────────────────────────

const ITEM_LABOUR_HOURS: QueueItem = {
  ...ITEM_SINGLE,
  id: 'qi-labour-hours',
  summary: 'Spent 6 hours fitting the cladding',
  proposedMemory: {
    memoryType: 'labour', summary: 'Spent 6 hours fitting the cladding',
    materialName: null, quantity: null, unit: null, supplierName: null, deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    labourHours: '6', labourPerson: null, labourTask: 'fitting cladding',
  },
}
const ITEM_LABOUR_RATED: QueueItem = {
  ...ITEM_SINGLE,
  id: 'qi-labour-rated',
  summary: 'Tom did 8 hours on electrics at £35 an hour',
  proposedMemory: {
    memoryType: 'labour', summary: 'Tom did 8 hours on electrics at £35 an hour',
    materialName: null, quantity: null, unit: null, supplierName: null, deliveryTiming: null, locationOrUse: null,
    costAmount: '35', costCurrency: 'GBP', costQualifier: 'per_hour', totalCostAmount: '280',
    labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics',
    budgetCategoryId: 'c-lab',
    budgetCategorySuggestion: { budgetCategoryId: 'c-lab', categoryName: 'labour', reason: 'material_name_match' },
  },
}

function labourQueue(): ReviewQueue {
  return {
    jobId: MOCK_JOB.id, generatedAt: '2026-06-07T12:00:00Z',
    budgetCategories: [{ id: 'c-lab', jobId: 'job-001', name: 'labour', budgetAmount: '1500', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }],
    sections: [{ key: 'labour', label: 'Labour', items: [ITEM_LABOUR_HOURS, ITEM_LABOUR_RATED] }],
    alreadyRemembered: [],
  }
}

describe('ReviewQueueScreen — labour', () => {
  beforeEach(() => {
    mockGetReviewQueue.mockResolvedValue(labourQueue())
    mockSubmitQueueDecision.mockResolvedValue({ queueItemId: 'qi-labour-hours', action: 'confirm', status: 'confirmed', memoryItemId: 'mem-x', sourceCandidateFactIds: [] })
  })

  it('renders a Labour section with hours, person, task, and rate', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const hours = await screen.findByTestId('queue-item-qi-labour-hours')
    expect(within(hours).getByText('Labour')).toBeTruthy()
    expect(within(hours).getByText('6 hours · fitting cladding')).toBeTruthy()
    const rated = screen.getByTestId('queue-item-qi-labour-rated')
    expect(within(rated).getByText('8 hours · electrics')).toBeTruthy()
    expect(within(rated).getByText('Tom')).toBeTruthy()
    expect(within(rated).getByText(/£35\/hour · £280 total/)).toBeTruthy()
  })

  it('can confirm hours-only labour without a cost', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const hours = await screen.findByTestId('queue-item-qi-labour-hours')
    fireEvent.click(within(hours).getByRole('button', { name: /remember this/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({ queueItemId: 'qi-labour-hours', action: 'confirm' })))
  })

  it('shows the suggested category and confirms it for rated labour', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const rated = await screen.findByTestId('queue-item-qi-labour-rated')
    expect(within(rated).getByText('Suggested: labour')).toBeTruthy()
    fireEvent.click(within(rated).getByRole('button', { name: /remember this/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({ budgetCategoryId: 'c-lab' })))
  })

  it('offers Per hour in the correction cost qualifier', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const rated = await screen.findByTestId('queue-item-qi-labour-rated')
    fireEvent.click(within(rated).getByRole('button', { name: /fix details/i }))
    expect(within(rated).getByLabelText('Hours')).toBeTruthy()
    const quals = Array.from(within(rated).getAllByRole('combobox')).flatMap(s => Array.from(s.querySelectorAll('option')).map(o => o.value))
    expect(quals).toContain('per_hour')
  })

  it('blocks save with a warning for a per_hour line missing hours', async () => {
    mockGetReviewQueue.mockResolvedValue({
      ...labourQueue(),
      sections: [{ key: 'labour', label: 'Labour', items: [{
        ...ITEM_LABOUR_RATED,
        proposedMemory: { ...ITEM_LABOUR_RATED.proposedMemory, labourHours: null },
      }] }],
    })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const rated = await screen.findByTestId('queue-item-qi-labour-rated')
    fireEvent.click(within(rated).getByRole('button', { name: /fix details/i }))
    expect(within(rated).getByRole('alert').textContent).toMatch(/Add hours/)
    expect(within(rated).getByRole('button', { name: /save correction/i })).toBeDisabled()
  })

  it('shows a derived hours × rate preview for a per_hour line and omits the explicit total on save', async () => {
    mockSubmitQueueDecision.mockResolvedValue({ queueItemId: 'qi-labour-rated', action: 'correct', status: 'corrected', memoryItemId: 'mem-y', sourceCandidateFactIds: [] })
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const rated = await screen.findByTestId('queue-item-qi-labour-rated')
    fireEvent.click(within(rated).getByRole('button', { name: /fix details/i }))
    expect(within(rated).getByText('Rate per hour')).toBeTruthy()
    expect(within(rated).queryByText('Total cost')).toBeNull()
    expect(within(rated).getByRole('status').textContent).toBe('8 hours × £35/hour = £280 total')
    fireEvent.click(within(rated).getByRole('button', { name: /save correction/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalled())
    const decision = mockSubmitQueueDecision.mock.calls[mockSubmitQueueDecision.mock.calls.length - 1][1]
    expect(decision.corrected).not.toHaveProperty('totalCostAmount')
  })
})

// ── Labour Tracking V2: day (happenedAt) in review ───────────────────────────

describe('ReviewQueueScreen — labour day correction', () => {
  const withDay = (): ReviewQueue => ({
    ...labourQueue(),
    sections: [{ key: 'labour', label: 'Labour', items: [{
      ...ITEM_LABOUR_RATED,
      proposedMemory: { ...ITEM_LABOUR_RATED.proposedMemory, happenedAt: '2026-06-06T12:00:00' },
    }] }],
  })

  beforeEach(() => {
    mockGetReviewQueue.mockResolvedValue(withDay())
    mockSubmitQueueDecision.mockResolvedValue({ queueItemId: 'qi-labour-rated', action: 'correct', status: 'corrected', memoryItemId: 'mem-y', sourceCandidateFactIds: [] })
  })

  it('shows the day field prefilled from happenedAt and submits a corrected day as local noon', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    const rated = await screen.findByTestId('queue-item-qi-labour-rated')
    fireEvent.click(within(rated).getByRole('button', { name: /fix details/i }))
    const day = within(rated).getByLabelText('Day') as HTMLInputElement
    expect(day.value).toBe('2026-06-06')
    fireEvent.change(day, { target: { value: '2026-06-05' } })
    fireEvent.click(within(rated).getByRole('button', { name: /save correction/i }))
    await waitFor(() => expect(mockSubmitQueueDecision).toHaveBeenCalled())
    const decision = mockSubmitQueueDecision.mock.calls[mockSubmitQueueDecision.mock.calls.length - 1][1]
    expect(decision.action).toBe('correct')
    expect(decision.corrected!.happenedAt).toBe('2026-06-05T12:00:00')
    // day/person/hours/task all remain correctable in the same form
    expect(decision.corrected!.labourPerson).toBe('Tom')
    expect(decision.corrected!.labourHours).toBe('8')
    expect(decision.corrected!.labourTask).toBe('electrics')
  })
})
