import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JobMemoryScreen from '../JobMemoryScreen'
import * as api from '../api'
import type { Job, MemoryViewResponse } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    updateMemoryItem: vi.fn(),
    verifyMemoryItem: vi.fn(),
  }
})

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockUpdateMemoryItem = vi.mocked(api.updateMemoryItem)
const mockVerifyMemoryItem = vi.mocked(api.verifyMemoryItem)

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

// Remembered detail is collapsed by default — open it before asserting on
// detail cards / Fix memory / source toggles.
async function openDetail() {
  fireEvent.click(await screen.findByRole('button', { name: /show details/i }))
}

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
    await openDetail()
    // "Ordered" short label appears only in the memory section heading (scan label is "Bought / ordered")
    expect(screen.getByText('Ordered')).toBeTruthy()
    // "Used" appears in both scan heading and memory section heading — check at least one exists
    expect(screen.getAllByText('Used').length).toBeGreaterThan(0)
    // Empty sections should not appear
    expect(screen.queryByText('Leftover')).toBeNull()
    expect(screen.queryByText('Watch out')).toBeNull()
  })

  it('renders type label as primary display for material memory cards', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getAllByText('Bought / ordered'))
    expect(screen.getAllByText('Used').length).toBeGreaterThan(0)
    // Prose summaries must not appear as primary titles for material types with structured fields
    expect(screen.queryByText('Ordered 8 bags of hardcore from Jewson at £5 each')).toBeNull()
    expect(screen.queryByText('Used OSB boards on the back wall')).toBeNull()
  })

  it('renders structured fields as labelled rows without showing null text', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    // Individual labelled field values in the detail region (some also appear
    // in the scan summary, so scope to the detail cards).
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    expect(within(detail).getByText('hardcore')).toBeTruthy()
    expect(within(detail).getByText('8 bags')).toBeTruthy()
    expect(within(detail).getByText('Jewson')).toBeTruthy()
    // null values must not appear literally
    expect(screen.queryByText(/null/)).toBeNull()
  })

  it('renders structured fields with locationOrUse when present', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getAllByText('OSB'))
    // "OSB" appears in both scan view item and memory card — check at least one exists
    expect(screen.getAllByText('OSB').length).toBeGreaterThan(0)
    expect(screen.getByText('back wall')).toBeTruthy()
  })

  it('renders cost and total cost on memory cards', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    // Cost labels appear in both scan view and memory card
    expect(screen.getAllByText('£5 each').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£40').length).toBeGreaterThan(0)
  })

  it('shows Show source toggle for items with source context', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    expect(screen.getByText('Show source')).toBeTruthy()
  })

  it('does not show source toggle for items without source', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    // Only one item has source; only one toggle should appear
    expect(screen.getAllByText('Show source').length).toBe(1)
  })

  it('expands source context on Show source click', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    fireEvent.click(screen.getByText('Show source'))
    expect(screen.getByText('This came from your note')).toBeTruthy()
    expect(screen.getByText('What the system heard')).toBeTruthy()
    expect(screen.getByText('Bought 8 bags of hardcore from Jewson, five pounds each.')).toBeTruthy()
  })

  it('collapses source context when toggled again', async () => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
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
    await waitFor(() => screen.getByRole('button', { name: /show details/i }))
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
    await openDetail()
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
    expect(screen.getAllByText('Left over').length).toBeGreaterThan(0)
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

  it('scan view consolidates compatible ordered material+unit rows by summing quantities', async () => {
    const baseItem = MEMORY_VIEW.sections[0].items[0]
    // Only bought/ordered consolidates like-for-like, so put the sand rows there.
    const viewWithCompatible: MemoryViewResponse = {
      ...MEMORY_VIEW,
      sections: MEMORY_VIEW.sections.map(s =>
        s.key === 'ordered_materials'
          ? {
              ...s,
              items: [
                {
                  ...baseItem,
                  id: 'mem-ord-a',
                  memoryType: 'ordered_material' as const,
                  summary: 'Ordered 9 bags of sand',
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
                  id: 'mem-ord-b',
                  memoryType: 'ordered_material' as const,
                  summary: 'Ordered 4 bags of sand',
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

  it('scan view does NOT consolidate used material rows (totals are ordered-only)', async () => {
    const baseItem = MEMORY_VIEW.sections[0].items[0]
    const viewWithUsed: MemoryViewResponse = {
      ...MEMORY_VIEW,
      sections: MEMORY_VIEW.sections.map(s =>
        s.key === 'used_materials'
          ? {
              ...s,
              items: [
                { ...baseItem, id: 'mem-u-a', memoryType: 'used_material' as const, summary: 'Used 9 bags of sand', materialName: 'sand', quantity: '9', unit: 'bags', supplierName: null, costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null, uncertaintyFlags: [], source: null },
                { ...baseItem, id: 'mem-u-b', memoryType: 'used_material' as const, summary: 'Used 4 bags of sand', materialName: 'sand', quantity: '4', unit: 'bags', supplierName: null, costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null, uncertaintyFlags: [], source: null },
              ],
            }
          : s
      ),
    }
    mockGetMemoryView.mockResolvedValue(viewWithUsed)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    const scanRegion = screen.getByRole('region', { name: /memory scan/i })
    // Used stays as separate rows — no fake "13 bags" total
    expect(scanRegion.textContent).toContain('9 bags')
    expect(scanRegion.textContent).toContain('4 bags')
    expect(scanRegion.textContent).not.toContain('13')
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
    await openDetail()
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
    await openDetail()
    expect(screen.getByText('hardcore')).toBeTruthy()
    rerender(<JobMemoryScreen job={JOB_B} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => screen.getByText('bricks'))
    expect(screen.queryByText('hardcore')).toBeNull()
  })
})

// ── Remembered-memory edit (Fix memory) ─────────────────────────────────────

describe('JobMemoryScreen — Fix memory', () => {
  beforeEach(() => {
    mockGetMemoryView.mockResolvedValue(MEMORY_VIEW)
    mockUpdateMemoryItem.mockReset()
  })

  function updatedItem(overrides: Partial<import('../types').MemoryViewItem>): import('../types').MemoryViewItem {
    return {
      id: 'mem-001', memoryType: 'ordered_material',
      summary: 'Ordered hardcore from Jewson',
      materialName: 'hardcore', quantity: '8', unit: 'bags', supplierName: 'Jewson',
      deliveryTiming: null, locationOrUse: null,
      costAmount: '5', costCurrency: 'GBP', costQualifier: 'each', totalCostAmount: '40',
      uncertaintyFlags: [], sourceCandidateFactId: 'fact-001', reviewDecisionId: 'decision-001',
      createdAt: '2026-06-13T09:25:00.000Z', updatedAt: '2026-06-20T09:00:00.000Z',
      source: null,
      ...overrides,
    }
  }

  it('shows a Fix memory action on remembered items', async () => {
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    expect(screen.getAllByRole('button', { name: /fix memory/i }).length).toBeGreaterThan(0)
  })

  it('opens a structured edit form with Save memory', async () => {
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    fireEvent.click(screen.getAllByRole('button', { name: /fix memory/i })[0])
    const form = screen.getByRole('form', { name: /edit memory/i })
    expect(form).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save memory/i })).toBeInTheDocument()
    expect(form.querySelector('input[name="quantity"]')).toBeInTheDocument()
    expect(form.querySelector('input[name="costAmount"]')).toBeInTheDocument()
  })

  it('saves edits via updateMemoryItem with structured fields', async () => {
    mockUpdateMemoryItem.mockResolvedValue(updatedItem({ quantity: '10', costAmount: '4.50' }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    fireEvent.click(screen.getAllByRole('button', { name: /fix memory/i })[0])

    const form = screen.getByRole('form', { name: /edit memory/i })
    fireEvent.change(form.querySelector('input[name="quantity"]')!, { target: { value: '10' } })
    fireEvent.change(form.querySelector('input[name="costAmount"]')!, { target: { value: '4.50' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    await waitFor(() => {
      expect(mockUpdateMemoryItem).toHaveBeenCalledWith('job-mem-001', 'mem-001',
        expect.objectContaining({ quantity: '10', costAmount: '4.50', memoryType: 'ordered_material' }))
    })
  })

  it('updates the visible card after saving an edit', async () => {
    mockUpdateMemoryItem.mockResolvedValue(updatedItem({ quantity: '10', costAmount: '4.50' }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    fireEvent.click(screen.getAllByRole('button', { name: /fix memory/i })[0])
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '4.50' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    await waitFor(() => expect(screen.getByText('10 bags')).toBeInTheDocument())
    // appears in both the scan summary and the detailed card after the edit
    expect(screen.getAllByText('£4.50 each').length).toBeGreaterThan(0)
    // form closed
    expect(screen.queryByRole('form', { name: /edit memory/i })).not.toBeInTheDocument()
  })

  it('moves item to the correct section when the type changes', async () => {
    // change ordered hardcore → leftover_material
    mockUpdateMemoryItem.mockResolvedValue(updatedItem({ memoryType: 'leftover_material' }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()

    fireEvent.click(screen.getAllByRole('button', { name: /fix memory/i })[0])
    const typeSelect = screen.getByRole('form', { name: /edit memory/i }).querySelector('select')!
    fireEvent.change(typeSelect, { target: { value: 'leftover_material' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    // The "Leftover" section heading should now appear (it was empty before)
    await waitFor(() => expect(screen.getByText('Leftover')).toBeInTheDocument())
  })

  it('keeps source context available after editing', async () => {
    // response omits source (like the mock backend) — client preserves prior linkage
    mockUpdateMemoryItem.mockResolvedValue(updatedItem({ quantity: '9', source: null }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    fireEvent.click(screen.getAllByRole('button', { name: /fix memory/i })[0])
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="quantity"]')!, { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    await waitFor(() => screen.getByText('9 bags'))
    // Source toggle still present for the edited ordered item
    expect(screen.getAllByRole('button', { name: /show source/i }).length).toBeGreaterThan(0)
  })

  it('shows an inline error and keeps the form on save failure', async () => {
    mockUpdateMemoryItem.mockRejectedValue(new Error('network'))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    fireEvent.click(screen.getAllByRole('button', { name: /fix memory/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(screen.getByText(/could not save/i)).toBeInTheDocument())
  })
})

// ── Worth checking resolution (verify / fix-clears / still unsure) ───────────

const UNCERTAIN_VIEW: MemoryViewResponse = {
  ...MEMORY_VIEW,
  sections: MEMORY_VIEW.sections.map(s =>
    s.key === 'leftovers'
      ? {
          ...s,
          items: [{
            id: 'mem-unc-1',
            memoryType: 'leftover_material',
            summary: 'About half a bag of sand left over',
            materialName: 'sand',
            quantity: 'about half',
            unit: 'bag',
            supplierName: null,
            deliveryTiming: null,
            locationOrUse: 'in the van',
            costAmount: null,
            costCurrency: null,
            costQualifier: null as null,
            totalCostAmount: null,
            uncertaintyFlags: ['approximate_quantity'],
            sourceUncertaintyFlags: ['approximate_quantity'],
            sourceCandidateFactId: 'fact-unc',
            reviewDecisionId: 'decision-unc',
            createdAt: '2026-06-20T09:00:00.000Z',
            updatedAt: '2026-06-20T09:00:00.000Z',
            source: {
              candidateFactId: 'fact-unc', noteId: 'note-unc', transcriptId: 'trans-unc',
              capturedAt: '2026-06-20T08:50:00.000Z',
              transcriptText: 'Think there is about half a bag of sand left in the van.',
            },
          }],
        }
      : s
  ),
  stillToCheck: { count: 0, items: [] },
}

describe('JobMemoryScreen — Worth checking resolution', () => {
  beforeEach(() => {
    mockGetMemoryView.mockResolvedValue(UNCERTAIN_VIEW)
    mockVerifyMemoryItem.mockReset()
    mockUpdateMemoryItem.mockReset()
  })

  it('shows Worth checking plus a verify action on an uncertain item', async () => {
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    expect(within(detail).getByText('Worth checking')).toBeTruthy()
    expect(within(detail).getByRole('button', { name: /this is right/i })).toBeTruthy()
    expect(within(detail).getByRole('button', { name: /still unsure/i })).toBeTruthy()
  })

  it('verifying clears Worth checking on the card and the scan roll-up but keeps approximate wording', async () => {
    mockVerifyMemoryItem.mockResolvedValue({ uncertaintyFlags: [] })
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)

    // Before: Worth checking roll-up present in the scan summary
    await waitFor(() => screen.getByRole('region', { name: /memory scan/i }))
    expect(screen.getByRole('region', { name: /memory scan/i }).textContent).toContain('Worth checking')

    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    fireEvent.click(within(detail).getByRole('button', { name: /this is right/i }))

    await waitFor(() => expect(mockVerifyMemoryItem).toHaveBeenCalledWith('job-mem-001', 'mem-unc-1'))
    // Worth checking gone from card and scan; approximate value remains
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /memory scan/i }).textContent).not.toContain('Worth checking')
    })
    expect(within(detail).queryByText('Worth checking')).toBeNull()
    expect(within(detail).getByText('about half bag')).toBeTruthy()
  })

  it('Fix memory clears Worth checking and sends uncertaintyResolution: resolved', async () => {
    mockUpdateMemoryItem.mockResolvedValue({
      id: 'mem-unc-1', memoryType: 'leftover_material', summary: 'half a bag of sand',
      materialName: 'sand', quantity: 'about half', unit: 'bag', supplierName: null,
      deliveryTiming: null, locationOrUse: 'in the van',
      costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: 'fact-unc', reviewDecisionId: 'decision-unc',
      createdAt: '', updatedAt: '', source: null,
    })
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    const card = within(detail).getByText('in the van').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    await waitFor(() => {
      expect(mockUpdateMemoryItem).toHaveBeenCalledWith('job-mem-001', 'mem-unc-1',
        expect.objectContaining({ uncertaintyResolution: 'resolved' }))
    })
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /memory scan/i }).textContent).not.toContain('Worth checking')
    })
  })

  it('Still unsure keeps Worth checking visible', async () => {
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    fireEvent.click(within(detail).getByRole('button', { name: /still unsure/i }))
    // No backend call; warning remains, verify prompt dismissed
    expect(mockVerifyMemoryItem).not.toHaveBeenCalled()
    expect(within(detail).getByText('Worth checking')).toBeTruthy()
    expect(within(detail).queryByRole('button', { name: /this is right/i })).toBeNull()
  })

  it('source context remains available on an uncertain item', async () => {
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    const card = within(detail).getByText('in the van').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /show source/i }))
    expect(screen.getByText('Think there is about half a bag of sand left in the van.')).toBeTruthy()
  })
})

// ── Known spend (cost capture / consolidation) ──────────────────────────────

function viewWithCost(overrides?: Partial<MemoryViewResponse>): MemoryViewResponse {
  const orderedItems = [
    {
      id: 'mv-cost-1', memoryType: 'ordered_material', summary: 'plasterboard',
      materialName: 'plasterboard', quantity: '12', unit: 'sheets', supplierName: 'Jewson',
      deliveryTiming: null, locationOrUse: null,
      costAmount: '50', costCurrency: 'GBP', costQualifier: 'each' as const, totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '', updatedAt: '', source: null,
    },
    {
      id: 'mv-cost-2', memoryType: 'ordered_material', summary: 'timber',
      materialName: 'timber', quantity: '6', unit: 'lengths', supplierName: null,
      deliveryTiming: null, locationOrUse: null,
      costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '', updatedAt: '', source: null,
    },
    {
      id: 'mv-cost-3', memoryType: 'ordered_material', summary: 'screws cost was 50',
      materialName: 'screws', quantity: null, unit: null, supplierName: null,
      deliveryTiming: null, locationOrUse: null,
      costAmount: '50', costCurrency: 'GBP', costQualifier: 'unknown' as const, totalCostAmount: null,
      uncertaintyFlags: ['cost_uncertain'], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '', updatedAt: '', source: null,
    },
  ]
  return {
    job: JOB,
    generatedAt: '2026-06-22T10:00:00.000Z',
    sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: orderedItems }],
    stillToCheck: { count: 0, items: [] },
    ...overrides,
  }
}

describe('JobMemoryScreen — Known spend', () => {
  beforeEach(() => {
    mockUpdateMemoryItem.mockReset()
    mockVerifyMemoryItem.mockReset()
  })

  it('shows "Known spend" (not "Total spend") derived from safe line totals', async () => {
    mockGetMemoryView.mockResolvedValue(viewWithCost())
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    // plasterboard 12 × £50 = £600 (timber missing, screws worth-checking excluded)
    expect(within(region).getByText('£600')).toBeTruthy()
    expect(screen.queryByText(/total spend/i)).toBeNull()
  })

  it('names each excluded bought item under "Not included yet" with its reason', async () => {
    // viewWithCost has no backend costSummary → local fallback derives excludedRows.
    mockGetMemoryView.mockResolvedValue(viewWithCost())
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText('Not included yet')).toBeTruthy()
    // timber has no cost at all; screws has an untrusted (unknown-basis) cost
    expect(within(region).getByText(/timber/)).toBeTruthy()
    expect(within(region).getByText('No cost remembered')).toBeTruthy()
    expect(within(region).getByText(/screws/)).toBeTruthy()
    expect(within(region).getByText('Cost worth checking')).toBeTruthy()
  })

  it('prefers the backend cost summary when present and renders its line-total rows', async () => {
    mockGetMemoryView.mockResolvedValue(viewWithCost({
      costSummary: {
        orderedMaterials: {
          knownSpendAmount: '940', knownSpendCurrency: 'GBP', knownSpendLabel: '£940 known spend',
          includedMemoryItemIds: ['mv-cost-1'], missingCostCount: 1, uncertainCostCount: 1,
          excludedMemoryItemIds: ['mv-cost-2', 'mv-cost-3'],
          rows: [
            {
              key: 'plasterboard|sheets', materialName: 'plasterboard', quantity: '24', unit: 'sheets',
              lineTotalAmount: '1200', lineTotalCurrency: 'GBP', lineTotalLabel: '£1200 total',
              memoryItemIds: ['mv-cost-1'],
            },
          ],
        },
      },
    }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText('£940')).toBeTruthy()
    // the backend safe line-total row is shown, not just the aggregate
    expect(within(region).getByText(/plasterboard · 24 sheets/)).toBeTruthy()
    expect(within(region).getByText('£1200 total')).toBeTruthy()
  })

  it('detail card shows unit cost and total separately, never a bare number', async () => {
    mockGetMemoryView.mockResolvedValue(viewWithCost())
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    expect(within(detail).getByText('Unit cost')).toBeTruthy()
    expect(within(detail).getByText('£50 each')).toBeTruthy()
    // screws cost basis is unknown → worth-checking note, not a bare "50"
    expect(within(detail).getByText('£50 — worth checking')).toBeTruthy()
    expect(within(detail).queryByText('50')).toBeNull()
  })

  it('fixing unit cost updates the known spend immediately', async () => {
    mockGetMemoryView.mockResolvedValue(viewWithCost())
    mockUpdateMemoryItem.mockResolvedValue({
      id: 'mv-cost-1', memoryType: 'ordered_material', summary: 'plasterboard',
      materialName: 'plasterboard', quantity: '12', unit: 'sheets', supplierName: 'Jewson',
      deliveryTiming: null, locationOrUse: null,
      costAmount: '60', costCurrency: 'GBP', costQualifier: 'each', totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '', updatedAt: '', source: null,
    })
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    const card = within(detail).getByText('£50 each').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    const form = screen.getByRole('form', { name: /edit memory/i })
    fireEvent.change(form.querySelector('input[name="costAmount"]')!, { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    // 12 × £60 = £720 now reflected in Known spend
    await waitFor(() => {
      expect(within(screen.getByRole('region', { name: /known spend/i })).getByText('£720')).toBeTruthy()
    })
  })

  it('verifying a worth-checking ordered cost brings it into known spend', async () => {
    // screws becomes a clean total once verified (flag cleared) — but unknown
    // basis still won't total; use a derivable item flagged worth-checking
    mockGetMemoryView.mockResolvedValue(viewWithCost({
      sections: [{
        key: 'ordered_materials', label: 'Ordered materials', items: [{
          id: 'mv-v', memoryType: 'ordered_material', summary: 'bricks',
          materialName: 'bricks', quantity: '10', unit: 'packs', supplierName: null,
          deliveryTiming: null, locationOrUse: null,
          costAmount: '20', costCurrency: 'GBP', costQualifier: 'each' as const, totalCostAmount: null,
          uncertaintyFlags: ['cost_uncertain'], sourceCandidateFactId: null, reviewDecisionId: null,
          createdAt: '', updatedAt: '', source: null,
        }],
      }],
    }))
    mockVerifyMemoryItem.mockResolvedValue({ uncertaintyFlags: [] })
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    // Before: excluded (worth checking), no known spend amount
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).queryByText('£200')).toBeNull()

    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    fireEvent.click(within(detail).getByRole('button', { name: /this is right/i }))

    // After verify: 10 × £20 = £200 now counted
    await waitFor(() => {
      expect(within(screen.getByRole('region', { name: /known spend/i })).getByText('£200')).toBeTruthy()
    })
  })
})

// ── Known spend clarity (Included / Not included yet) ────────────────────────

describe('JobMemoryScreen — Known spend clarity', () => {
  beforeEach(() => {
    mockUpdateMemoryItem.mockReset()
    mockVerifyMemoryItem.mockReset()
  })

  // A backend summary carrying the additive excludedRows contract.
  function summaryView(over?: Partial<import('../types').OrderedCostSummary>): MemoryViewResponse {
    return viewWithCost({
      costSummary: {
        orderedMaterials: {
          knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend',
          includedMemoryItemIds: ['inc'], missingCostCount: 1, uncertainCostCount: 1,
          excludedMemoryItemIds: ['miss', 'unsure'],
          rows: [
            { key: 'hardcore|bags', materialName: 'hardcore', quantity: '8', unit: 'bags',
              lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total', memoryItemIds: ['inc'] },
          ],
          excludedRows: [
            { memoryItemId: 'miss', itemLabel: 'timber', materialName: 'timber', quantity: '6', unit: 'lengths', reason: 'no_cost_remembered' },
            { memoryItemId: 'unsure', itemLabel: 'insulation', materialName: 'insulation', quantity: '4', unit: 'packs', reason: 'cost_worth_checking' },
          ],
          ...over,
        },
      },
    })
  }

  it('shows an Included row with its money total and a Not included yet group with reasons', async () => {
    mockGetMemoryView.mockResolvedValue(summaryView())
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText('Included')).toBeTruthy()
    expect(within(region).getByText(/hardcore · 8 bags/)).toBeTruthy()
    expect(within(region).getByText('£40 total')).toBeTruthy()
    expect(within(region).getByText('Not included yet')).toBeTruthy()
    expect(within(region).getByText(/timber · 6 lengths/)).toBeTruthy()
    expect(within(region).getByText('No cost remembered')).toBeTruthy()
    expect(within(region).getByText(/insulation · 4 packs/)).toBeTruthy()
    expect(within(region).getByText('Cost worth checking')).toBeTruthy()
  })

  it('shows None known yet with named exclusions when nothing is included', async () => {
    mockGetMemoryView.mockResolvedValue(summaryView({
      knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null,
      includedMemoryItemIds: [], rows: [],
    }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText('None known yet')).toBeTruthy()
    expect(within(region).queryByText('Included')).toBeNull()
    expect(within(region).getByText('Not included yet')).toBeTruthy()
    expect(within(region).getByText(/timber/)).toBeTruthy()
  })

  it('does not render the Not included yet group when there are no exclusions', async () => {
    mockGetMemoryView.mockResolvedValue(summaryView({
      missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], excludedRows: [],
    }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText('Included')).toBeTruthy()
    expect(within(region).queryByText('Not included yet')).toBeNull()
  })

  it('keeps the count-based copy for an older backend without excludedRows', async () => {
    const older = summaryView()
    // Simulate an older backend: drop the additive field entirely.
    delete (older.costSummary!.orderedMaterials as { excludedRows?: unknown }).excludedRows
    mockGetMemoryView.mockResolvedValue(older)
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).queryByText('Not included yet')).toBeNull()
    expect(within(region).getByText(/1 bought item has no cost remembered/i)).toBeTruthy()
    expect(within(region).getByText(/1 bought item has cost worth checking/i)).toBeTruthy()
  })

  it('renders an unknown future reason as the safe "Cost worth checking" without crashing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetMemoryView.mockResolvedValue(summaryView({
      excludedRows: [
        { memoryItemId: 'x', itemLabel: 'mystery', materialName: 'mystery', quantity: '1', unit: 'unit', reason: 'some_future_reason' },
      ],
    }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText(/mystery/)).toBeTruthy()
    expect(within(region).getByText('Cost worth checking')).toBeTruthy()
    warn.mockRestore()
  })

  it('does not show a standalone "total" badge on a consolidated quantity rollup', async () => {
    // Two like-for-like no-cost rows consolidate to a quantity rollup in the scan.
    mockGetMemoryView.mockResolvedValue(viewWithCost({
      sections: [{
        key: 'ordered_materials', label: 'Ordered materials', items: [
          { id: 'r1', memoryType: 'ordered_material', summary: 'membrane', materialName: 'membrane', quantity: '5', unit: 'rolls', supplierName: null, deliveryTiming: null, locationOrUse: null, costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null, uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null, createdAt: '', updatedAt: '', source: null },
          { id: 'r2', memoryType: 'ordered_material', summary: 'membrane', materialName: 'membrane', quantity: '5', unit: 'rolls', supplierName: null, deliveryTiming: null, locationOrUse: null, costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null, uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null, createdAt: '', updatedAt: '', source: null },
        ],
      }],
    }))
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const scan = await screen.findByRole('region', { name: /memory scan/i })
    // Quantity is expressed inline ("10 rolls total"), and the old badge element is gone.
    expect(within(scan).getByText(/10 rolls total/)).toBeTruthy()
    expect(scan.querySelector('.mem-scan-item-tag')).toBeNull()
  })

  it('adopts the refetched backend summary after an edit (authoritative inclusion + amount)', async () => {
    // Before: timber excluded, £40. After edit + refetch: timber included, £100.
    const after = summaryView({
      knownSpendAmount: '100', knownSpendLabel: '£100 known spend',
      includedMemoryItemIds: ['inc', 'miss'], missingCostCount: 0, uncertainCostCount: 1,
      excludedMemoryItemIds: ['unsure'],
      rows: [
        { key: 'hardcore|bags', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total', memoryItemIds: ['inc'] },
        { key: 'timber|lengths', materialName: 'timber', quantity: '6', unit: 'lengths', lineTotalAmount: '60', lineTotalCurrency: 'GBP', lineTotalLabel: '£60 total', memoryItemIds: ['miss'] },
      ],
      excludedRows: [
        { memoryItemId: 'unsure', itemLabel: 'insulation', materialName: 'insulation', quantity: '4', unit: 'packs', reason: 'cost_worth_checking' },
      ],
    })
    mockGetMemoryView.mockResolvedValueOnce(summaryView()).mockResolvedValue(after)
    mockUpdateMemoryItem.mockResolvedValue({
      id: 'mv-cost-2', memoryType: 'ordered_material', summary: 'timber', materialName: 'timber',
      quantity: '6', unit: 'lengths', supplierName: null, deliveryTiming: null, locationOrUse: null,
      costAmount: '10', costCurrency: 'GBP', costQualifier: 'each', totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '', updatedAt: '', source: null,
    })
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    const region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText('£40')).toBeTruthy()

    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    const card = within(detail).getByText('timber').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    await waitFor(() => {
      const r = screen.getByRole('region', { name: /known spend/i })
      expect(within(r).getByText('£100')).toBeTruthy()
      // timber moved to Included; only insulation remains excluded
      expect(within(r).getByText(/timber · 6 lengths/)).toBeTruthy()
    })
    expect(within(screen.getByRole('region', { name: /known spend/i })).queryByText('No cost remembered')).toBeNull()
  })

  it('on refetch failure keeps the last server summary and offers a retry', async () => {
    mockGetMemoryView.mockResolvedValueOnce(summaryView()).mockRejectedValue(new Error('offline'))
    mockUpdateMemoryItem.mockResolvedValue({
      id: 'mv-cost-2', memoryType: 'ordered_material', summary: 'timber', materialName: 'timber',
      quantity: '6', unit: 'lengths', supplierName: null, deliveryTiming: null, locationOrUse: null,
      costAmount: '10', costCurrency: 'GBP', costQualifier: 'each', totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '', updatedAt: '', source: null,
    })
    render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    const card = within(detail).getByText('timber').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))

    const region = await screen.findByRole('region', { name: /known spend/i })
    // Recoverable banner appears; the last server-confirmed £40 is still shown.
    await waitFor(() => expect(within(region).getByText(/couldn’t refresh spend/i)).toBeTruthy())
    expect(within(region).getByText('£40')).toBeTruthy()
    expect(within(region).getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('does not merge an in-flight refresh into a different job after a job switch', async () => {
    const JOB_B: Job = { ...JOB, id: 'job-mem-002', title: 'Kitchen Extension' }
    // Job B has its own distinct, authoritative known spend.
    const viewB = summaryView({
      knownSpendAmount: '200', knownSpendLabel: '£200 known spend',
      rows: [{ key: 'bricks|packs', materialName: 'bricks', quantity: '10', unit: 'packs', lineTotalAmount: '200', lineTotalCurrency: 'GBP', lineTotalLabel: '£200 total', memoryItemIds: ['b1'] }],
    })
    // The stale refresh for job A would (if not guarded) overwrite B with £999.
    const staleA = summaryView({ knownSpendAmount: '999', knownSpendLabel: '£999 known spend' })

    let resolveRefresh!: (v: MemoryViewResponse) => void
    const refreshPromise = new Promise<MemoryViewResponse>(r => { resolveRefresh = r })
    mockGetMemoryView
      .mockResolvedValueOnce(summaryView())   // 1) initial load — job A (£40)
      .mockReturnValueOnce(refreshPromise)    // 2) post-edit refresh — job A (deferred)
      .mockResolvedValue(viewB)               // 3) load — job B (£200)
    mockUpdateMemoryItem.mockResolvedValue({
      id: 'mv-cost-2', memoryType: 'ordered_material', summary: 'timber', materialName: 'timber',
      quantity: '6', unit: 'lengths', supplierName: null, deliveryTiming: null, locationOrUse: null,
      costAmount: '10', costCurrency: 'GBP', costQualifier: 'each', totalCostAmount: null,
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '', updatedAt: '', source: null,
    })

    const { rerender } = render(<JobMemoryScreen job={JOB} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    let region = await screen.findByRole('region', { name: /known spend/i })
    expect(within(region).getByText('£40')).toBeTruthy()

    // Edit on job A → fires the (deferred) refresh for job A.
    await openDetail()
    const detail = screen.getByRole('region', { name: /remembered detail/i })
    const card = within(detail).getByText('timber').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(mockGetMemoryView).toHaveBeenCalledTimes(2))

    // Switch to job B and let its load settle (£200).
    rerender(<JobMemoryScreen job={JOB_B} onClose={mockClose} onOpenReviewQueue={mockOpenReviewQueue} />)
    await waitFor(() => {
      expect(within(screen.getByRole('region', { name: /known spend/i })).getByText('£200')).toBeTruthy()
    })

    // Now the stale job-A refresh resolves — it must be discarded, not merged.
    await act(async () => {
      resolveRefresh(staleA)
      await refreshPromise
    })

    region = screen.getByRole('region', { name: /known spend/i })
    expect(within(region).getByText('£200')).toBeTruthy()
    expect(screen.queryByText('£999')).toBeNull()
  })
})
