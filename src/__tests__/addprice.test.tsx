import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-ap-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
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

const JOB: Job = { id: 'job-ap-001', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' }

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

// 12 sheets of plasterboard, no price → not counted.
const PLASTER = orderedItem({ id: 'plaster', summary: 'plasterboard', materialName: 'plasterboard', quantity: '12', unit: 'sheets' })
function ordered(over: Partial<OrderedCostSummary>): OrderedCostSummary {
  return {
    knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null,
    includedMemoryItemIds: [], missingCostCount: 1, uncertainCostCount: 0, excludedMemoryItemIds: ['plaster'],
    rows: [], excludedRows: [{ memoryItemId: 'plaster', itemLabel: 'plasterboard', materialName: 'plasterboard', quantity: '12', unit: 'sheets', reason: 'no_cost_remembered' }],
    ...over,
  }
}
function viewOf(items: MemoryViewItem[], o: OrderedCostSummary): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [{ key: 'ordered_materials', label: 'Ordered materials', items }],
    stillToCheck: { count: 0, items: [] },
    costSummary: { orderedMaterials: o, totalKnownCost: { knownSpendAmount: o.knownSpendAmount, knownSpendCurrency: o.knownSpendCurrency, knownSpendLabel: o.knownSpendLabel, includedMemoryItemIds: o.includedMemoryItemIds } },
  }
}

const V1 = () => viewOf([PLASTER], ordered({}))
// After adding a £120 total, the item is counted.
const V2 = () => viewOf(
  [orderedItem({ id: 'plaster', materialName: 'plasterboard', quantity: '12', unit: 'sheets', costAmount: '120', costQualifier: 'total', costCurrency: 'GBP', totalCostAmount: '120' })],
  ordered({
    knownSpendAmount: '120', knownSpendCurrency: 'GBP', knownSpendLabel: '£120 known spend', includedMemoryItemIds: ['plaster'], missingCostCount: 0,
    rows: [{ key: 'plasterboard|sheets', materialName: 'plasterboard', quantity: '12', unit: 'sheets', lineTotalAmount: '120', lineTotalCurrency: 'GBP', lineTotalLabel: '£120 total', memoryItemIds: ['plaster'] }],
    excludedRows: [],
  }),
)

beforeEach(() => {
  mockGetMemoryView.mockResolvedValue(V1())
  mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
  mockUpdateMemoryItem.mockResolvedValue(V2().sections[0].items[0])
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}
async function openNotCounted() {
  fireEvent.click(screen.getByRole('tab', { name: 'Spend' }))
  return screen.findByRole('region', { name: /not counted yet/i })
}

describe('Add price to a no-price bought item', () => {
  it('defaults to an explicit total → PATCH sends totalCostAmount + GBP, and it enters known spend', async () => {
    mockGetMemoryView.mockResolvedValueOnce(V1()).mockResolvedValue(V2())
    renderWorkspace()
    const area = await openNotCounted()
    const row = within(area).getByText(/plasterboard/).closest('.cost-check-item') as HTMLElement
    expect(within(row).getByText(/No price yet/i)).toBeInTheDocument()

    fireEvent.click(within(row).getByRole('button', { name: 'Add price' }))
    const form = screen.getByRole('form', { name: 'Add price' })
    fireEvent.change(form.querySelector('input[name="price"]')!, { target: { value: '120' } })
    fireEvent.click(within(form).getByRole('button', { name: /save price/i }))

    // PATCH carries the typed value as an explicit total (+ GBP), not a bare costAmount
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalledWith('job-ap-001', 'plaster', expect.objectContaining({
      costQualifier: 'total', totalCostAmount: '120', costCurrency: 'GBP', uncertaintyResolution: 'resolved',
    })))
    // authoritative summaries refetched
    await waitFor(() => expect(mockGetMemoryView.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(mockGetBudgetSummary.mock.calls.length).toBeGreaterThanOrEqual(2))
    // known spend updates and the item leaves "Not counted yet"
    await waitFor(() => expect(within(screen.getByRole('region', { name: /^known spend$/i })).getByText(/£120/)).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('region', { name: /not counted yet/i })).not.toBeInTheDocument())
  })

  it('can add a per-item price → PATCH sends each and omits totalCostAmount, with a derived preview', async () => {
    renderWorkspace()
    const area = await openNotCounted()
    const row = within(area).getByText(/plasterboard/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Add price' }))
    const form = screen.getByRole('form', { name: 'Add price' })
    fireEvent.change(within(form).getByLabelText('Price basis'), { target: { value: 'each' } })
    fireEvent.change(form.querySelector('input[name="price"]')!, { target: { value: '10' } })
    expect(within(form).getByText(/£120 total/)).toBeInTheDocument() // 12 × £10
    fireEvent.click(within(form).getByRole('button', { name: /save price/i }))

    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())
    const [, , patch] = mockUpdateMemoryItem.mock.calls[0]
    expect(patch).toMatchObject({ costQualifier: 'each', costAmount: '10', costCurrency: 'GBP', uncertaintyResolution: 'resolved' })
    expect(patch).not.toHaveProperty('totalCostAmount')
  })

  it('keeps the form and value when the save fails', async () => {
    mockUpdateMemoryItem.mockRejectedValue(new Error('network'))
    renderWorkspace()
    const area = await openNotCounted()
    const row = within(area).getByText(/plasterboard/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Add price' }))
    const form = screen.getByRole('form', { name: 'Add price' })
    fireEvent.change(form.querySelector('input[name="price"]')!, { target: { value: '120' } })
    fireEvent.click(within(form).getByRole('button', { name: /save price/i }))
    await screen.findByRole('alert')
    expect((screen.getByRole('form', { name: 'Add price' }).querySelector('input[name="price"]') as HTMLInputElement).value).toBe('120')
  })
})
