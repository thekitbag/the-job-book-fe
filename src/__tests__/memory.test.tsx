import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JobMemoryScreen from '../JobMemoryScreen'
import * as api from '../api'
import type { Job, MemoryViewResponse } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
  }
})

const mockGetMemoryView = vi.mocked(api.getMemoryView)

const JOB: Job = {
  id: 'job-mem-001',
  title: 'Garden Room',
  jobType: 'garden_room',
  roughLocationOrLabel: null,
  status: 'active',
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const MEMORY_VIEW: MemoryViewResponse = {
  job: JOB,
  generatedAt: '2026-06-13T10:00:00.000Z',
  sections: [
    {
      key: 'ordered_materials',
      label: 'Ordered materials',
      items: [
        {
          id: 'mem-001',
          memoryType: 'ordered_material',
          summary: 'Ordered 12 sheets of plasterboard from Jewson',
          materialName: 'plasterboard',
          quantity: '12',
          unit: 'sheets',
          supplierName: 'Jewson',
          deliveryTiming: 'tomorrow morning',
          locationOrUse: null,
          sourceCandidateFactId: 'fact-001',
          reviewDecisionId: 'decision-001',
          createdAt: '2026-06-13T09:25:00.000Z',
          updatedAt: '2026-06-13T09:25:00.000Z',
          source: {
            candidateFactId: 'fact-001',
            noteId: 'note-001',
            transcriptId: 'trans-001',
            capturedAt: '2026-06-13T09:15:00.000Z',
            transcriptText: 'Ordered another 12 sheets of plasterboard from Jewson.',
          },
        },
      ],
    },
    {
      key: 'used_materials',
      label: 'Used materials',
      items: [
        {
          id: 'mem-002',
          memoryType: 'used_material',
          summary: 'Used OSB boards on the back wall',
          materialName: 'OSB',
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: 'back wall',
          sourceCandidateFactId: null,
          reviewDecisionId: null,
          createdAt: '2026-06-13T10:00:00.000Z',
          updatedAt: '2026-06-13T10:00:00.000Z',
          source: null,
        },
      ],
    },
    { key: 'leftovers', label: 'Leftovers', items: [] },
    { key: 'supplier_delivery_notes', label: 'Supplier delivery notes', items: [] },
    { key: 'customer_changes', label: 'Customer changes', items: [] },
    { key: 'watch_outs', label: 'Watch outs', items: [] },
  ],
  stillToCheck: {
    count: 2,
    items: [
      {
        id: 'stc-001',
        sectionKey: 'unclear_items',
        summary: 'Something about extra cable',
        kind: 'unclear_prompt',
        timeLabel: 'Today',
      },
    ],
  },
}

const EMPTY_MEMORY_VIEW: MemoryViewResponse = {
  ...MEMORY_VIEW,
  sections: MEMORY_VIEW.sections.map(s => ({ ...s, items: [] })),
  stillToCheck: { count: 0, items: [] },
}

const mockClose = vi.fn()
const mockOpenReviewQueue = vi.fn()

beforeEach(() => {
  mockClose.mockReset()
  mockOpenReviewQueue.mockReset()
})

describe('JobMemoryScreen', () => {
  it('shows the Job memory heading', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    expect(screen.getByRole('heading', { name: 'Job memory' })).toBeTruthy()
  })

  it('shows the current job title', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    expect(screen.getByText('Garden Room')).toBeTruthy()
  })

  it('calls getMemoryView with the selected job id', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => expect(mockGetMemoryView).toHaveBeenCalledWith('job-mem-001'))
  })

  it('renders memory section headings for sections with items', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Ordered'))
    expect(screen.getByText('Used')).toBeTruthy()
    // Empty sections should not appear
    expect(screen.queryByText('Leftover')).toBeNull()
    expect(screen.queryByText('Watch out')).toBeNull()
  })

  it('renders memory card summary text', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() =>
      screen.getByText('Ordered 12 sheets of plasterboard from Jewson')
    )
    expect(screen.getByText('Used OSB boards on the back wall')).toBeTruthy()
  })

  it('renders structured fields without showing null text', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    // Structured fields: quantity, unit, material, supplier, timing — all concatenated
    await waitFor(() =>
      screen.getByText('12 sheets · plasterboard · Jewson · tomorrow morning')
    )
    // null values must not appear literally
    expect(screen.queryByText(/null/)).toBeNull()
  })

  it('renders structured fields with locationOrUse when present', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Used OSB boards on the back wall'))
    expect(screen.getByText('OSB · back wall')).toBeTruthy()
  })

  it('shows Show source toggle for items with source context', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Show source'))
  })

  it('does not show source toggle for items without source', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Used OSB boards on the back wall'))
    // Only one item has source; only one toggle should appear
    expect(screen.getAllByText('Show source').length).toBe(1)
  })

  it('expands source context on Show source click', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Show source'))
    fireEvent.click(screen.getByText('Show source'))
    expect(screen.getByText('This came from your note')).toBeTruthy()
    expect(screen.getByText('What the system heard')).toBeTruthy()
    expect(screen.getByText('Ordered another 12 sheets of plasterboard from Jewson.')).toBeTruthy()
  })

  it('collapses source context when toggled again', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Show source'))
    fireEvent.click(screen.getByText('Show source'))
    expect(screen.getByText('Hide source')).toBeTruthy()
    fireEvent.click(screen.getByText('Hide source'))
    expect(screen.queryByText('This came from your note')).toBeNull()
  })

  it('renders Still to check block when count > 0', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText(/still to check/))
    expect(screen.getByText('Something about extra cable')).toBeTruthy()
  })

  it('Still to check button opens review queue', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Review Things to check'))
    fireEvent.click(screen.getByText('Review Things to check'))
    expect(mockOpenReviewQueue).toHaveBeenCalledTimes(1)
  })

  it('does not render Still to check block when count is 0', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText(/No trusted memory yet/))
    expect(screen.queryByText(/still to check/)).toBeNull()
  })

  it('renders empty state when all sections are empty', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() =>
      screen.getByText(/No trusted memory yet. Review Things to check to save useful job details here./)
    )
  })

  it('empty state links to Things to check', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Go to Things to check'))
    fireEvent.click(screen.getByText('Go to Things to check'))
    expect(mockOpenReviewQueue).toHaveBeenCalledTimes(1)
  })

  it('shows a retryable error on load failure', async () => {
    mockGetMemoryView.mockRejectedValue(new Error('Network error'))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByText(/Network error/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('retries on Try again click', async () => {
    mockGetMemoryView
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))
  })

  it('calls onClose when Back is clicked', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('does not show confirm/correct/dismiss/edit controls', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /correct/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fix details/i })).toBeNull()
  })

  it('reloads data when the job changes', async () => {
    const JOB_B: Job = { ...JOB, id: 'job-mem-002', title: 'Kitchen Extension' }
    const VIEW_B: MemoryViewResponse = {
      ...MEMORY_VIEW,
      job: JOB_B,
      sections: [
        {
          key: 'ordered_materials',
          label: 'Ordered materials',
          items: [
            {
              ...MEMORY_VIEW.sections[0].items[0],
              id: 'mem-b-001',
              summary: 'Ordered bricks from Travis Perkins',
            },
          ],
        },
        ...MEMORY_VIEW.sections.slice(1),
      ],
    }
    mockGetMemoryView.mockResolvedValueOnce(MEMORY_VIEW).mockResolvedValueOnce(VIEW_B)
    const { rerender } = render(
      <JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />
    )
    await waitFor(() => screen.getByText('Ordered 12 sheets of plasterboard from Jewson'))
    rerender(<JobMemoryScreen job={JOB_B} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Ordered bricks from Travis Perkins'))
    expect(screen.queryByText('Ordered 12 sheets of plasterboard from Jewson')).toBeNull()
  })
})
