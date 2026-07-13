import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import type { BudgetSummaryResponse, Job, MemoryViewItem, MemoryViewResponse, OrderedCostSummary } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    updateMemoryItem: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-cb-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-x', photos: [] })),
  }
})
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockUpdateMemoryItem = vi.mocked(api.updateMemoryItem)

const JOB: Job = { id: 'job-cb-001', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' }

const EMPTY_BUDGET: BudgetSummaryResponse = {
  jobId: JOB.id, generatedAt: '', categories: [],
  uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
  totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: null, knownSpendCurrency: null, remainingAmount: null, remainingLabel: null, overBudget: false },
}

function orderedItem(over: Partial<MemoryViewItem>): MemoryViewItem {
  return {
    id: 'x', memoryType: 'ordered_material', summary: '', materialName: null, quantity: null, unit: null,
    supplierName: null, deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    uncertaintyFlags: [], budgetCategoryId: null, sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '', updatedAt: '', source: null, ...over,
  }
}

const HARDCORE = orderedItem({ id: 'hardcore', summary: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', costAmount: '5', costQualifier: 'each', costCurrency: 'GBP', totalCostAmount: '40' })
const INSULATION = orderedItem({ id: 'insulation', summary: 'insulation', materialName: 'insulation', quantity: '4', unit: 'packs', costAmount: '120', costQualifier: 'approx', costCurrency: 'GBP' })
const SEALANT = orderedItem({ id: 'sealant', summary: 'sealant', materialName: 'sealant', costAmount: '15', costQualifier: 'unknown', costCurrency: 'GBP' })
const TIMBER = orderedItem({ id: 'timber', summary: 'timber', materialName: 'timber', quantity: '6', unit: 'lengths' })

function orderedSummary(over: Partial<OrderedCostSummary>): OrderedCostSummary {
  return {
    knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend',
    includedMemoryItemIds: ['hardcore'], missingCostCount: 1, uncertainCostCount: 2,
    excludedMemoryItemIds: ['insulation', 'sealant', 'timber'],
    rows: [{ key: 'hardcore|bags', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total', memoryItemIds: ['hardcore'] }],
    excludedRows: [
      { memoryItemId: 'insulation', itemLabel: 'insulation', materialName: 'insulation', quantity: '4', unit: 'packs', reason: 'cost_worth_checking' },
      { memoryItemId: 'sealant', itemLabel: 'sealant', materialName: 'sealant', quantity: null, unit: null, reason: 'cost_worth_checking' },
      { memoryItemId: 'timber', itemLabel: 'timber', materialName: 'timber', quantity: '6', unit: 'lengths', reason: 'no_cost_remembered' },
    ],
    ...over,
  }
}

function view(items: MemoryViewItem[], ordered: OrderedCostSummary): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [{ key: 'ordered_materials', label: 'Ordered materials', items }],
    stillToCheck: { count: 0, items: [] },
    costSummary: {
      orderedMaterials: ordered,
      totalKnownCost: { knownSpendAmount: ordered.knownSpendAmount, knownSpendCurrency: 'GBP', knownSpendLabel: ordered.knownSpendLabel, includedMemoryItemIds: ordered.includedMemoryItemIds },
    },
  }
}

const V1 = () => view([HARDCORE, INSULATION, SEALANT, TIMBER], orderedSummary({}))
// After resolving insulation: it becomes included (£160), excludedRows drop it.
const V2 = () => view(
  [HARDCORE, orderedItem({ id: 'insulation', materialName: 'insulation', quantity: '4', unit: 'packs', costAmount: '120', costQualifier: 'total', costCurrency: 'GBP', totalCostAmount: '120' }), SEALANT, TIMBER],
  orderedSummary({
    knownSpendAmount: '160', knownSpendLabel: '£160 known spend', includedMemoryItemIds: ['hardcore', 'insulation'],
    rows: [
      { key: 'hardcore|bags', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total', memoryItemIds: ['hardcore'] },
      { key: 'insulation|packs', materialName: 'insulation', quantity: '4', unit: 'packs', lineTotalAmount: '120', lineTotalCurrency: 'GBP', lineTotalLabel: '£120 total', memoryItemIds: ['insulation'] },
    ],
    excludedRows: [
      { memoryItemId: 'sealant', itemLabel: 'sealant', materialName: 'sealant', quantity: null, unit: null, reason: 'cost_worth_checking' },
      { memoryItemId: 'timber', itemLabel: 'timber', materialName: 'timber', quantity: '6', unit: 'lengths', reason: 'no_cost_remembered' },
    ],
  }),
)

beforeEach(() => {
  mockGetMemoryView.mockResolvedValue(V1())
  mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
})

function renderWorkspace(job: Job = JOB) {
  return render(<CurrentJobWorkspace job={job} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}
async function openSpend() {
  fireEvent.click(screen.getByRole('button', { name: 'Open Spend' }))
  return screen.findByRole('region', { name: /not counted yet/i })
}

describe('Spend cost-basis attention', () => {
  it('shows cost-like excluded items and asks each vs total', async () => {
    renderWorkspace()
    const area = await openSpend()
    expect(within(area).getByText(/4 insulation packs — £120/)).toBeInTheDocument()
    expect(within(area).getByText('Is £120 each or £120 total?')).toBeInTheDocument()
    expect(within(area).getByText(/sealant/)).toBeInTheDocument()
  })

  it('shows a no-cost item as no-price (not a cost-basis question)', async () => {
    renderWorkspace()
    const area = await openSpend()
    // no-cost timber shares the unified area but with an "add price" treatment,
    // not an each/total question.
    const timber = within(area).getByText(/timber/).closest('.cost-check-item') as HTMLElement
    expect(within(timber).getByText(/No price yet/i)).toBeInTheDocument()
    expect(within(timber).getByRole('button', { name: /add price/i })).toBeInTheDocument()
    expect(within(timber).queryByRole('button', { name: /each|total/i })).not.toBeInTheDocument()
  })

  it('offers unit cost only when quantity and unit are safe', async () => {
    renderWorkspace()
    const area = await openSpend()
    const insulation = within(area).getByText(/4 insulation packs/).closest('.cost-check-item') as HTMLElement
    const sealant = within(area).getByText(/^sealant/).closest('.cost-check-item') as HTMLElement
    expect(within(insulation).getByRole('button', { name: 'Set as £120 each' })).toBeInTheDocument()
    // sealant has no safe quantity → total only, no unit-cost action
    expect(within(sealant).queryByRole('button', { name: /each/i })).not.toBeInTheDocument()
    expect(within(sealant).getByRole('button', { name: 'Confirm £15 total' })).toBeInTheDocument()
  })

  it('Confirm as total patches and refetches authoritative summaries', async () => {
    mockGetMemoryView.mockResolvedValueOnce(V1()).mockResolvedValue(V2())
    mockUpdateMemoryItem.mockResolvedValue(V2().sections[0].items[1]) // updated insulation
    renderWorkspace()
    const area = await openSpend()
    const insulation = within(area).getByText(/4 insulation packs/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(insulation).getByRole('button', { name: 'Confirm £120 total' }))

    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalledWith('job-cb-001', 'insulation', expect.objectContaining({
      costQualifier: 'total', totalCostAmount: '120', costCurrency: 'GBP', uncertaintyResolution: 'resolved',
    })))
    // refetched: memory-view (mount + refresh) and budget-summary (mount + after)
    await waitFor(() => expect(mockGetMemoryView.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(mockGetBudgetSummary.mock.calls.length).toBeGreaterThanOrEqual(2))
    // insulation leaves the attention area once the backend counts it
    await waitFor(() => expect(screen.queryByText(/4 insulation packs/)).not.toBeInTheDocument())
  })

  it('Set as unit cost sends each and does not invent a local total', async () => {
    mockUpdateMemoryItem.mockResolvedValue(V2().sections[0].items[1])
    renderWorkspace()
    const area = await openSpend()
    const insulation = within(area).getByText(/4 insulation packs/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(insulation).getByRole('button', { name: 'Set as £120 each' }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())
    const [, , patch] = mockUpdateMemoryItem.mock.calls[mockUpdateMemoryItem.mock.calls.length - 1]
    expect(patch).toEqual(expect.objectContaining({
      costQualifier: 'each', costAmount: '120', uncertaintyResolution: 'resolved',
    }))
    expect(patch).not.toHaveProperty('totalCostAmount')
  })

  it('keeps the item visible with an error when the patch fails', async () => {
    mockUpdateMemoryItem.mockRejectedValue(new Error('network'))
    renderWorkspace()
    const area = await openSpend()
    const insulation = within(area).getByText(/4 insulation packs/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(insulation).getByRole('button', { name: 'Confirm £120 total' }))
    await within(insulation).findByRole('alert')
    expect(within(insulation).getByText(/4 insulation packs/)).toBeInTheDocument()
  })

  it('keeps last totals and shows a retry banner when refetch fails after a patch', async () => {
    mockGetMemoryView.mockResolvedValueOnce(V1()).mockRejectedValue(new Error('offline'))
    mockUpdateMemoryItem.mockResolvedValue(V2().sections[0].items[1])
    renderWorkspace()
    const area = await openSpend()
    const insulation = within(area).getByText(/4 insulation packs/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(insulation).getByRole('button', { name: 'Confirm £120 total' }))
    await screen.findByText(/couldn’t refresh/i)
    // last server-confirmed hero figure is preserved
    expect(within(screen.getByRole('region', { name: /^known spend$/i })).getByText(/£40/)).toBeInTheDocument()
  })

  it('ignores a resolution refetch that resolves after a job switch', async () => {
    const JOB_B: Job = { ...JOB, id: 'job-cb-002', title: 'Extension' }
    let releaseRefresh!: (v: MemoryViewResponse) => void
    const deferred = new Promise<MemoryViewResponse>(r => { releaseRefresh = r })
    mockGetMemoryView
      .mockResolvedValueOnce(V1())          // job A mount
      .mockReturnValueOnce(deferred)         // job A resolution refetch (in-flight)
      .mockResolvedValue(view([HARDCORE], orderedSummary({ excludedRows: [] }))) // job B
    mockUpdateMemoryItem.mockResolvedValue(V2().sections[0].items[1])

    const { rerender } = renderWorkspace(JOB)
    const area = await openSpend()
    const insulation = within(area).getByText(/4 insulation packs/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(insulation).getByRole('button', { name: 'Confirm £120 total' }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())

    rerender(<CurrentJobWorkspace job={JOB_B} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Extension')).toBeInTheDocument())

    // stale job-A refetch resolves late — must not repaint job B
    const staleForA = view([HARDCORE, orderedItem({ id: 'insulation', materialName: 'STALE-INSULATION' })], orderedSummary({}))
    await act(async () => { releaseRefresh(staleForA); await deferred })
    expect(screen.queryByText(/STALE-INSULATION/)).not.toBeInTheDocument()
  })
})
