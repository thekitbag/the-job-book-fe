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
    createMemoryItem: vi.fn(),
    updateMemoryItem: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-at-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
  }
})
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockCreateMemoryItem = vi.mocked(api.createMemoryItem)
const mockUpdateMemoryItem = vi.mocked(api.updateMemoryItem)

const JOB: Job = { id: 'job-at-001', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'active', createdAt: '', updatedAt: '' }

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

const EMPTY_VIEW: MemoryViewResponse = {
  job: JOB, generatedAt: '',
  sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [] }],
  stillToCheck: { count: 0, items: [] }, costSummary: undefined,
}

// One included each item so the Fix-memory flow has something to edit.
const OSB = orderedItem({ id: 'osb', summary: 'OSB', materialName: 'OSB', quantity: '5', unit: 'sheets', costAmount: '20', costQualifier: 'each', costCurrency: 'GBP', totalCostAmount: '100' })
function osbOrdered(): OrderedCostSummary {
  return {
    knownSpendAmount: '100', knownSpendCurrency: 'GBP', knownSpendLabel: '£100 known spend',
    includedMemoryItemIds: ['osb'], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [],
    rows: [{ key: 'OSB|sheets', materialName: 'OSB', quantity: '5', unit: 'sheets', lineTotalAmount: '100', lineTotalCurrency: 'GBP', lineTotalLabel: '£100 total', memoryItemIds: ['osb'] }],
    excludedRows: [],
  }
}
const OSB_VIEW: MemoryViewResponse = {
  job: JOB, generatedAt: '',
  sections: [{ key: 'ordered_materials', label: 'Ordered materials', items: [OSB] }],
  stillToCheck: { count: 0, items: [] },
  costSummary: { orderedMaterials: osbOrdered(), totalKnownCost: { knownSpendAmount: '100', knownSpendCurrency: 'GBP', knownSpendLabel: '£100 known spend', includedMemoryItemIds: ['osb'] } },
}

beforeEach(() => {
  mockGetMemoryView.mockResolvedValue(EMPTY_VIEW)
  mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
  mockCreateMemoryItem.mockResolvedValue(OSB)
  mockUpdateMemoryItem.mockResolvedValue(OSB)
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}
async function openAddSpend() {
  fireEvent.click(screen.getByRole('tab', { name: 'Spend' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Add spend' }))
  return screen.getByRole('form', { name: 'Add spend' })
}
function fill(form: HTMLElement, name: string, value: string) {
  fireEvent.change(form.querySelector(`[name="${name}"]`)!, { target: { value } })
}

describe('Auto-total — Direct Add Spend', () => {
  it('previews a derived total for a clear each line and omits totalCostAmount on save', async () => {
    renderWorkspace()
    const form = await openAddSpend()
    fill(form, 'materialName', 'OSB')
    fill(form, 'quantity', '5')
    fill(form, 'unit', 'sheets')
    fill(form, 'costAmount', '20')
    fireEvent.change(within(form).getByLabelText('Cost basis'), { target: { value: 'each' } })

    expect(within(form).getByText(/£100 total/)).toBeInTheDocument()

    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalled())
    const [, req] = mockCreateMemoryItem.mock.calls[0]
    expect(req).toMatchObject({ memoryType: 'ordered_material', costQualifier: 'each', costAmount: '20', quantity: '5', unit: 'sheets' })
    expect(req).not.toHaveProperty('totalCostAmount')
  })

  it('updates the preview when quantity or unit cost changes', async () => {
    renderWorkspace()
    const form = await openAddSpend()
    fill(form, 'materialName', 'OSB')
    fill(form, 'unit', 'sheets')
    fireEvent.change(within(form).getByLabelText('Cost basis'), { target: { value: 'each' } })
    fill(form, 'quantity', '5')
    fill(form, 'costAmount', '20')
    expect(within(form).getByText(/£100 total/)).toBeInTheDocument()
    fill(form, 'quantity', '6')
    expect(within(form).getByText(/£120 total/)).toBeInTheDocument()
    fill(form, 'costAmount', '25')
    expect(within(form).getByText(/£150 total/)).toBeInTheDocument()
  })

  it('does not preview a trusted total for an ambiguous basis (no unit)', async () => {
    renderWorkspace()
    const form = await openAddSpend()
    fill(form, 'materialName', 'sealant')
    fill(form, 'quantity', '3')
    fill(form, 'costAmount', '15')
    fireEvent.change(within(form).getByLabelText('Cost basis'), { target: { value: 'each' } })
    // no unit → not safe to derive, so no derived-total preview
    expect(form.querySelector('.cost-preview')).toBeNull()
  })
})

describe('Auto-total — Fix Memory', () => {
  it('recalculates the preview on quantity change and omits totalCostAmount on save', async () => {
    mockGetMemoryView.mockResolvedValue(OSB_VIEW)
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: 'Spend' }))
    const counted = await screen.findByRole('region', { name: /uncategorised bought/i })
    fireEvent.click(within(counted).getByRole('button', { name: /fix memory/i }))

    const editForm = screen.getByRole('form', { name: /edit memory/i })
    // change quantity 5 → 6; the derived preview follows
    fireEvent.change(editForm.querySelector('input[name="quantity"]')!, { target: { value: '6' } })
    expect(within(editForm).getByText(/£120 total/)).toBeInTheDocument()

    fireEvent.click(within(editForm).getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())
    const [, , patch] = mockUpdateMemoryItem.mock.calls[0]
    expect(patch).toMatchObject({ costQualifier: 'each', quantity: '6', costAmount: '20' })
    expect(patch).not.toHaveProperty('totalCostAmount')
  })
})
