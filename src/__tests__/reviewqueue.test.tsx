import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ReviewQueueScreen from '../ReviewQueueScreen'
import * as api from '../api'
import type { Job, QueueItem, ReviewQueue } from '../types'

const mockGetReviewQueue = vi.mocked(api.getReviewQueue)
const mockSubmitQueueDecision = vi.mocked(api.submitQueueDecision)

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getReviewQueue: vi.fn(),
    submitQueueDecision: vi.fn(),
  }
})

const MOCK_JOB: Job = {
  id: 'job-001',
  title: 'Garden Room',
  roughLocationOrLabel: 'Mrs Patel',
  status: 'active',
}

const ITEM_SINGLE: QueueItem = {
  id: 'qi-001',
  kind: 'single',
  status: 'draft',
  reviewLabel: 'What I picked up today',
  timeLabel: 'Today',
  summary: 'Ordered 12 sheets of plasterboard from Jewson',
  proposedMemory: {
    memoryType: 'ordered_material',
    summary: 'Ordered 12 sheets of plasterboard from Jewson',
    materialName: 'plasterboard',
    quantity: '12',
    unit: 'sheets',
    supplierName: 'Jewson',
    deliveryTiming: 'tomorrow morning',
    locationOrUse: null,
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
      transcriptText: 'Ordered twelve sheets of plasterboard from Jewson.',
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
      expect(screen.getByText('Ordered 12 sheets of plasterboard from Jewson')).toBeInTheDocument()
    })
    expect(screen.getByText('Used OSB boards on the back wall')).toBeInTheDocument()
  })

  it('shows "Nothing to check right now" for an empty queue', async () => {
    mockGetReviewQueue.mockResolvedValue(emptyQueue())
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Nothing to check right now.')).toBeInTheDocument()
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
      expect(screen.getByText('Ordered 12 sheets of plasterboard from Jewson')).toBeInTheDocument()
    })
  })

  it('displays section headings', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Ordered materials')).toBeInTheDocument()
    })
    expect(screen.getByText('Used materials')).toBeInTheDocument()
  })

  it('shows time labels', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getAllByText('Today').length).toBeGreaterThan(0)
    })
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
      expect(screen.getByText('Ordered 12 sheets of plasterboard from Jewson')).toBeInTheDocument()
    })

    const toggles = screen.getAllByText(/this came from your note/i)
    expect(toggles.length).toBeGreaterThan(0)
    expect(screen.queryByText(/Ordered twelve sheets of plasterboard from Jewson\./)).not.toBeInTheDocument()

    fireEvent.click(toggles[0])
    expect(screen.getByText('"Ordered twelve sheets of plasterboard from Jewson."')).toBeInTheDocument()
  })

  it('collapses source context on second click', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getAllByText(/this came from your note/i))

    const toggle = screen.getAllByText(/this came from your note/i)[0]
    fireEvent.click(toggle)
    expect(screen.getByText('"Ordered twelve sheets of plasterboard from Jewson."')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('"Ordered twelve sheets of plasterboard from Jewson."')).not.toBeInTheDocument()
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
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))

    fireEvent.click(screen.getAllByRole('button', { name: /remember this/i })[0])

    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, {
        queueItemId: 'qi-001',
        action: 'confirm',
        corrected: undefined,
        reason: undefined,
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
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))

    fireEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])

    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, {
        queueItemId: 'qi-001',
        action: 'dismiss',
        corrected: undefined,
        reason: 'Not about this job',
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
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))

    fireEvent.click(screen.getAllByRole('button', { name: /correct/i })[0])

    const form = screen.getByRole('form', { name: /edit correction/i })
    expect(form).toBeInTheDocument()

    // Update summary
    const summaryInput = form.querySelector<HTMLInputElement>('input[required]')!
    fireEvent.change(summaryInput, { target: { value: 'Ordered 10 sheets of plasterboard from Jewson' } })

    fireEvent.click(screen.getByRole('button', { name: /save correction/i }))

    await waitFor(() => {
      expect(mockSubmitQueueDecision).toHaveBeenCalledWith(MOCK_JOB.id, expect.objectContaining({
        queueItemId: 'qi-001',
        action: 'correct',
        corrected: expect.objectContaining({ summary: 'Ordered 10 sheets of plasterboard from Jewson' }),
      }))
    })
    await waitFor(() => {
      expect(screen.getAllByText('Saved to trusted memory').length).toBeGreaterThan(0)
    })
  })

  it('cancel in edit form closes the form without submitting', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))

    fireEvent.click(screen.getAllByRole('button', { name: /correct/i })[0])
    expect(screen.getByRole('form', { name: /edit correction/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('form', { name: /edit correction/i })).not.toBeInTheDocument()
    expect(mockSubmitQueueDecision).not.toHaveBeenCalled()
  })

  it('edit form type selector excludes unclear', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))

    fireEvent.click(screen.getAllByRole('button', { name: /correct/i })[0])

    const select = screen.getByRole('combobox')
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
    expect(options).not.toContain('unclear')
    expect(options.length).toBe(6)
  })

  it('shows item-level error on decision failure with retry possible', async () => {
    mockSubmitQueueDecision.mockRejectedValue(new Error('network'))
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))

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
    expect(screen.getByText('Ordered scaffolding from TCS')).toBeInTheDocument()
    expect(screen.getByText(/Yesterday/)).toBeInTheDocument()
  })

  it('already-remembered section is hidden when empty', async () => {
    render(<ReviewQueueScreen job={MOCK_JOB} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))
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
    await waitFor(() => screen.getByText('Used OSB boards on the back wall'))

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
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))
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
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))

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
})
