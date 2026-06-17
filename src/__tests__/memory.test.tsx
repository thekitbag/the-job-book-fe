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
          summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
          materialName: 'hardcore',
          quantity: '8',
          unit: 'bags',
          supplierName: 'Jewson',
          deliveryTiming: null,
          locationOrUse: null,
          costAmount: '5',
          costCurrency: 'GBP',
          costQualifier: 'each' as const,
          totalCostAmount: '40',
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-001',
          reviewDecisionId: 'decision-001',
          createdAt: '2026-06-13T09:25:00.000Z',
          updatedAt: '2026-06-13T09:25:00.000Z',
          source: {
            candidateFactId: 'fact-001',
            noteId: 'note-001',
            transcriptId: 'trans-001',
            capturedAt: '2026-06-13T09:15:00.000Z',
            transcriptText: 'Bought 8 bags of hardcore from Jewson, five pounds each.',
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
          costAmount: null,
          costCurrency: null,
          costQualifier: null,
          totalCostAmount: null,
          uncertaintyFlags: [],
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
    // "Ordered" short label appears only in the memory section heading (scan label is "Bought / ordered")
    await waitFor(() => screen.getByText('Ordered'))
    // "Used" appears in both scan heading and memory section heading — check at least one exists
    expect(screen.getAllByText('Used').length).toBeGreaterThan(0)
    // Empty sections should not appear
    expect(screen.queryByText('Leftover')).toBeNull()
    expect(screen.queryByText('Watch out')).toBeNull()
  })

  it('renders memory card summary text', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() =>
      screen.getByText('Ordered 8 bags of hardcore from Jewson at £5 each')
    )
    expect(screen.getByText('Used OSB boards on the back wall')).toBeTruthy()
  })

  it('renders structured fields as labelled rows without showing null text', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Ordered 8 bags of hardcore from Jewson at £5 each'))
    // Individual labelled field values
    expect(screen.getByText('hardcore')).toBeTruthy()
    expect(screen.getByText('8 bags')).toBeTruthy()
    expect(screen.getByText('Jewson')).toBeTruthy()
    // null values must not appear literally
    expect(screen.queryByText(/null/)).toBeNull()
  })

  it('renders structured fields with locationOrUse when present', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Used OSB boards on the back wall'))
    // "OSB" appears in both scan view item and memory card — check at least one exists
    expect(screen.getAllByText('OSB').length).toBeGreaterThan(0)
    expect(screen.getByText('back wall')).toBeTruthy()
  })

  it('renders cost and total cost on memory cards', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Ordered 8 bags of hardcore from Jewson at £5 each'))
    // Cost labels appear in both scan view and memory card
    expect(screen.getAllByText('£5 each').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£40').length).toBeGreaterThan(0)
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
    expect(screen.getByText('Bought 8 bags of hardcore from Jewson, five pounds each.')).toBeTruthy()
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
    await waitFor(() => screen.getByText('Ordered 8 bags of hardcore from Jewson at £5 each'))
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
    await waitFor(() => screen.getByText('Ordered 8 bags of hardcore from Jewson at £5 each'))
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /correct/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fix details/i })).toBeNull()
  })

  it('consolidated scan view renders Bought / ordered and Used headings', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    const scan = screen.getByRole('region', { name: /memory scan/i })
    // Scan section headings are h3 elements within the scan region
    expect(scan.textContent).toContain('Bought / ordered')
    expect(scan.textContent).toContain('Used')
  })

  it('scan view shows item description and cost label', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    // The scan item should include material and supplier
    const scanRegion = screen.getByRole('region', { name: /memory scan/i })
    expect(scanRegion.textContent).toContain('hardcore')
    expect(scanRegion.textContent).toContain('£5 each')
    expect(scanRegion.textContent).toContain('£40')
  })

  it('scan view does not show Left over heading when leftovers section is empty', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    expect(screen.queryByText('Left over')).toBeNull()
  })

  it('scan view shows Left over heading when leftovers section has items', async () => {
    const leftoverItem = {
      ...MEMORY_VIEW.sections[0].items[0],
      id: 'mem-leftover',
      memoryType: 'leftover_material',
      summary: '3 bags of sand left over',
      materialName: 'sand',
      quantity: '3',
      unit: 'bags',
      supplierName: null,
      costAmount: null,
      costCurrency: null,
      costQualifier: null as null,
      totalCostAmount: null,
      source: null,
    }
    const viewWithLeftovers: MemoryViewResponse = {
      ...MEMORY_VIEW,
      sections: MEMORY_VIEW.sections.map(s =>
        s.key === 'leftovers' ? { ...s, items: [leftoverItem] } : s
      ),
    }
    mockGetMemoryView.mockResolvedValue(viewWithLeftovers)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    expect(screen.getByText('Left over')).toBeTruthy()
    const scanRegion = screen.getByRole('region', { name: /memory scan/i })
    expect(scanRegion.textContent).toContain('sand')
  })

  it('scan view shows items from different sections as separate entries (incompatible units not combined)', async () => {
    const leftoverItem = {
      ...MEMORY_VIEW.sections[0].items[0],
      id: 'mem-leftover-plank',
      memoryType: 'leftover_material',
      summary: '5 sheets of OSB left over',
      materialName: 'OSB',
      quantity: '5',
      unit: 'sheets',
      supplierName: null,
      costAmount: null,
      costCurrency: null,
      costQualifier: null as null,
      totalCostAmount: null,
      source: null,
    }
    const viewWithMixed: MemoryViewResponse = {
      ...MEMORY_VIEW,
      sections: MEMORY_VIEW.sections.map(s =>
        s.key === 'leftovers' ? { ...s, items: [leftoverItem] } : s
      ),
    }
    mockGetMemoryView.mockResolvedValue(viewWithMixed)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    const scanRegion = screen.getByRole('region', { name: /memory scan/i })
    // Both items must appear as separate descriptions, not combined
    expect(scanRegion.textContent).toContain('8 bags')
    expect(scanRegion.textContent).toContain('5 sheets')
    expect(scanRegion.textContent).not.toContain('13')
  })

  it('scan view consolidates compatible material+unit rows by summing quantities', async () => {
    const baseItem = MEMORY_VIEW.sections[0].items[0]
    const viewWithCompatible: MemoryViewResponse = {
      ...MEMORY_VIEW,
      sections: MEMORY_VIEW.sections.map(s =>
        s.key === 'used_materials'
          ? {
              ...s,
              items: [
                {
                  ...baseItem,
                  id: 'mem-used-a',
                  memoryType: 'used_material' as const,
                  summary: 'Used 9 bags of sand',
                  materialName: 'sand',
                  quantity: '9',
                  unit: 'bags',
                  supplierName: null,
                  costAmount: null,
                  costCurrency: null,
                  costQualifier: null,
                  totalCostAmount: null,
                  uncertaintyFlags: [],
                  source: null,
                },
                {
                  ...baseItem,
                  id: 'mem-used-b',
                  memoryType: 'used_material' as const,
                  summary: 'Used 4 bags of sand',
                  materialName: 'sand',
                  quantity: '4',
                  unit: 'bags',
                  supplierName: null,
                  costAmount: null,
                  costCurrency: null,
                  costQualifier: null,
                  totalCostAmount: null,
                  uncertaintyFlags: [],
                  source: null,
                },
              ],
            }
          : s
      ),
    }
    mockGetMemoryView.mockResolvedValue(viewWithCompatible)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    const scanRegion = screen.getByRole('region', { name: /memory scan/i })
    // Two compatible sand/bags items should be merged into one showing combined quantity
    expect(scanRegion.textContent).toContain('13')
    expect(scanRegion.textContent).toContain('sand')
    // Items must NOT appear as two separate rows
    expect(scanRegion.textContent).not.toContain('9 bags')
    expect(scanRegion.textContent).not.toContain('4 bags')
  })

  it('scan view does not group items whose quantity is non-decimal (e.g. "about 8")', async () => {
    const baseItem = MEMORY_VIEW.sections[0].items[0]
    const viewWithNonDecimal: MemoryViewResponse = {
      ...MEMORY_VIEW,
      sections: MEMORY_VIEW.sections.map(s =>
        s.key === 'used_materials'
          ? {
              ...s,
              items: [
                {
                  ...baseItem,
                  id: 'mem-nd-a',
                  memoryType: 'used_material' as const,
                  summary: 'Used about 8 bags of sand',
                  materialName: 'sand',
                  quantity: 'about 8',
                  unit: 'bags',
                  supplierName: null,
                  costAmount: null,
                  costCurrency: null,
                  costQualifier: null,
                  totalCostAmount: null,
                  uncertaintyFlags: [],
                  source: null,
                },
                {
                  ...baseItem,
                  id: 'mem-nd-b',
                  memoryType: 'used_material' as const,
                  summary: 'Used 4 bags of sand',
                  materialName: 'sand',
                  quantity: '4',
                  unit: 'bags',
                  supplierName: null,
                  costAmount: null,
                  costCurrency: null,
                  costQualifier: null,
                  totalCostAmount: null,
                  uncertaintyFlags: [],
                  source: null,
                },
              ],
            }
          : s
      ),
    }
    mockGetMemoryView.mockResolvedValue(viewWithNonDecimal)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    const scanRegion = screen.getByRole('region', { name: /memory scan/i })
    // Non-decimal quantity must appear as its own row, not merged
    expect(scanRegion.textContent).toContain('about 8')
    expect(scanRegion.textContent).toContain('4')
    // Combined total of 12 must NOT appear (rows kept separate)
    expect(scanRegion.textContent).not.toContain('12')
  })

  it('scan view shows Worth checking for non-cost uncertainty flags', async () => {
    const baseItem = MEMORY_VIEW.sections[0].items[0]
    const viewWithUncertainty: MemoryViewResponse = {
      ...MEMORY_VIEW,
      sections: MEMORY_VIEW.sections.map(s =>
        s.key === 'used_materials'
          ? {
              ...s,
              items: [
                {
                  ...baseItem,
                  id: 'mem-unc-a',
                  memoryType: 'used_material' as const,
                  summary: 'Used some sand bags',
                  materialName: 'sand',
                  quantity: null,
                  unit: null,
                  supplierName: null,
                  costAmount: null,
                  costCurrency: null,
                  costQualifier: null,
                  totalCostAmount: null,
                  uncertaintyFlags: ['quantity_ambiguous'],
                  source: null,
                },
              ],
            }
          : s
      ),
    }
    mockGetMemoryView.mockResolvedValue(viewWithUncertainty)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    const scanRegion = screen.getByRole('region', { name: /memory scan/i })
    expect(scanRegion.textContent).toContain('Worth checking')
  })

  it('does not show accounting, procurement or report controls', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Ordered 8 bags of hardcore from Jewson at £5 each'))
    expect(screen.queryByText(/invoice/i)).toBeNull()
    expect(screen.queryByText(/reorder/i)).toBeNull()
    expect(screen.queryByText(/spend report/i)).toBeNull()
    expect(screen.queryByText(/total spend/i)).toBeNull()
    expect(screen.queryByText(/procurement/i)).toBeNull()
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
              materialName: 'bricks',
              costAmount: null,
              costCurrency: null,
              costQualifier: null,
              totalCostAmount: null,
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
    await waitFor(() => screen.getByText('Ordered 8 bags of hardcore from Jewson at £5 each'))
    rerender(<JobMemoryScreen job={JOB_B} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('Ordered bricks from Travis Perkins'))
    expect(screen.queryByText('Ordered 8 bags of hardcore from Jewson at £5 each')).toBeNull()
  })
})
