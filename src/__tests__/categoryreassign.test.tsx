import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import type { BudgetCategory, BudgetSummaryResponse, Job, JobMoneyResponse, MemoryViewItem, MemoryViewResponse } from '../types'

// Correcting an item's Budget category from inside Fix memory.
//
// The regression this file protects: cards were given the category list only on
// the surface that offered the one-tap "Pick category" shortcut — the
// uncategorised list. Everywhere else the list arrived empty, which silently
// hid the Budget category field inside Fix memory, so an item could be filed
// once and never corrected again.
//
// Recategorising redistributes the same cost between categories. It never
// changes the job's overall cost, never touches paid state, and never moves
// money — it only re-captions the Money out row the item already had.

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    updateMemoryItem: vi.fn(),
    verifyMemoryItem: vi.fn(),
    assignMemoryItemCategory: vi.fn(),
    getJobMoney: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-cat-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-cat-001', photos: [] })),
    getJobReceipts: vi.fn(() => Promise.resolve({ jobId: 'job-cat-001', receipts: [] })),
    getLabourPeople: vi.fn(() => Promise.resolve({ jobId: 'job-cat-001', people: [] })),
  }
})

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockUpdateMemoryItem = vi.mocked(api.updateMemoryItem)
const mockGetJobMoney = vi.mocked(api.getJobMoney)

const JOB: Job = {
  id: 'job-cat-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-10T09:00:00Z',
}

const CLADDING: BudgetCategory = { id: 'c1', jobId: JOB.id, name: 'cladding', budgetAmount: '2000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }
const ELECTRICS: BudgetCategory = { id: 'c2', jobId: JOB.id, name: 'electrics', budgetAmount: '1000', budgetCurrency: 'GBP', sortOrder: 1, isArchived: false, createdAt: '', updatedAt: '' }

// A paid, categorised cost item — the case in the ticket. Paid state and its
// linked Money out must survive the move untouched.
function cable(over: Partial<MemoryViewItem> = {}): MemoryViewItem {
  return {
    id: 'mem-cable', memoryType: 'ordered_material', summary: 'cable',
    materialName: 'cable', quantity: '100', unit: 'm', supplierName: 'Jewson',
    deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: 'GBP', costQualifier: 'total', totalCostAmount: '200',
    uncertaintyFlags: [], budgetCategoryId: CLADDING.id, sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '', updatedAt: '',
    source: { candidateFactId: 'f', noteId: 'n', transcriptId: 't', capturedAt: '2026-07-08T09:00:00.000Z', transcriptText: 'got the cable from Jewson' },
    ...over,
  }
}

// A used material — not category-assignable, so Fix memory must not offer the field.
function offcuts(): MemoryViewItem {
  return {
    id: 'mem-offcuts', memoryType: 'used_material', summary: 'offcuts',
    materialName: 'offcuts', quantity: '3', unit: 'sheets', supplierName: null,
    deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    uncertaintyFlags: [], budgetCategoryId: null, sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '', updatedAt: '', source: null,
  }
}

function memoryView(item: MemoryViewItem = cable()): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [item] },
      { key: 'used_materials', label: 'Used materials', items: [offcuts()] },
    ],
    stillToCheck: { count: 0, items: [] },
    costSummary: {
      orderedMaterials: { knownSpendAmount: '200', knownSpendCurrency: 'GBP', knownSpendLabel: '£200 known spend', includedMemoryItemIds: ['mem-cable'], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [], excludedRows: [] },
      totalKnownCost: { knownSpendAmount: '200', knownSpendCurrency: 'GBP', knownSpendLabel: '£200 known spend', includedMemoryItemIds: ['mem-cable'] },
    },
  }
}

// The cable's £200 sits in whichever category owns it; the job total is £200
// either way, which is the invariant these tests keep checking.
function budgetSummary(owner: 'cladding' | 'electrics' | 'none'): BudgetSummaryResponse {
  const row = {
    memoryItemId: 'mem-cable', memoryType: 'ordered_material', itemLabel: 'cable',
    materialName: 'cable', quantity: '100', unit: 'm',
    lineTotalAmount: '200', lineTotalCurrency: 'GBP', lineTotalLabel: '£200 total',
    paymentState: 'paid' as const, paidMoneyEventId: 'money-1', eligibleForPaymentState: true,
  }
  const empty = {
    rows: [], knownSpendAmount: '0', knownSpendCurrency: 'GBP', knownSpendLabel: '£0 known spend',
    paymentState: null, paymentStateReason: 'no_eligible_items' as const,
  }
  // The category's paid summary travels with the cost, so it has to land on
  // whichever category owns the row after the move.
  const filled = {
    rows: [row], knownSpendAmount: '200', knownSpendCurrency: 'GBP', knownSpendLabel: '£200 known spend',
    paymentState: 'paid' as const, paidAmount: '200', paidCurrency: 'GBP' as const, paidLabel: '£200 paid',
    paymentStateReason: 'eligible_items' as const,
  }
  const clad = owner === 'cladding' ? filled : empty
  const elec = owner === 'electrics' ? filled : empty
  return {
    jobId: JOB.id, generatedAt: '',
    categories: [
      { category: CLADDING, ...clad, budgetAmount: '2000', budgetCurrency: 'GBP', budgetLabel: '£2000 budget', remainingAmount: '1800', remainingLabel: '£1800 remaining', overBudget: false },
      { category: ELECTRICS, ...elec, budgetAmount: '1000', budgetCurrency: 'GBP', budgetLabel: '£1000 budget', remainingAmount: '800', remainingLabel: '£800 remaining', overBudget: false },
    ],
    uncategorized: owner === 'none'
      ? { knownSpendAmount: '200', knownSpendCurrency: 'GBP', knownSpendLabel: '£200 known spend', rows: [row] }
      : { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
    totals: {
      budgetAmount: '3000', budgetCurrency: 'GBP',
      knownSpendAmount: '200', knownSpendCurrency: 'GBP',
      remainingAmount: '2800', remainingLabel: '£2800 remaining', overBudget: false,
      notPaidAmount: '0', notPaidCurrency: 'GBP', notPaidLabel: '£0 not paid',
      allKnownCostsPaid: true, hasKnownPayableCosts: true, hasMissingPriceAttention: false,
    },
  }
}

function money(categoryName: string | null): JobMoneyResponse {
  return {
    jobId: JOB.id, generatedAt: '',
    customerTotalAmount: null, customerTotalCurrency: null, customerTotalLabel: null,
    moneyInAmount: '0', moneyInCurrency: 'GBP', moneyInLabel: '£0 received',
    moneyOutAmount: '200', moneyOutCurrency: 'GBP', moneyOutLabel: '£200 paid out',
    stillOwedAmount: null, stillOwedCurrency: null, stillOwedLabel: null,
    overpaid: false, overpaidAmount: null, overpaidLabel: null,
    rows: [{
      id: 'money-1', jobId: JOB.id, direction: 'out', kind: 'cost_paid',
      amount: '200', currency: 'GBP', amountLabel: '-£200',
      occurredAt: '2026-07-09T09:00:00Z', note: null, reference: null,
      sourceMemoryItemId: 'mem-cable', sourceItemLabel: 'cable', sourceMemoryType: 'ordered_material',
      sourceBudgetCategoryId: categoryName === 'cladding' ? CLADDING.id : categoryName === 'electrics' ? ELECTRICS.id : null,
      sourceBudgetCategoryName: categoryName,
      editable: false, removable: true, createdAt: '', updatedAt: '',
    }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMemoryView.mockResolvedValue(memoryView())
  mockGetBudgetSummary.mockResolvedValue(budgetSummary('cladding'))
  mockGetJobMoney.mockResolvedValue(money('cladding'))
  mockUpdateMemoryItem.mockResolvedValue(cable({ budgetCategoryId: ELECTRICS.id }))
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}

function openSection(name: string) {
  const back = screen.queryByRole('button', { name: /job home/i })
  if (back) fireEvent.click(back)
  fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }))
}

// Budget → cladding → expand → tap the cable row → the item action drawer.
async function openCableDrawer() {
  renderWorkspace()
  openSection('Budget')
  const band = await screen.findByRole('region', { name: /budget category cladding/i })
  fireEvent.click(within(band).getByRole('button', { name: /show items/i }))
  fireEvent.click(band.querySelector('.mem-row-tap') as HTMLElement)
  return within(screen.getByRole('dialog'))
}

async function openFixMemory() {
  const drawer = await openCableDrawer()
  fireEvent.click(drawer.getByRole('button', { name: /fix memory/i }))
  return within(screen.getByRole('form', { name: 'Edit memory' }))
}

function categorySelect() {
  return screen.getByLabelText('Budget category') as HTMLSelectElement
}

describe('Fix memory — Budget category selector', () => {
  it('shows the item’s current category on a categorised cost item', async () => {
    await openFixMemory()
    expect(categorySelect().value).toBe(CLADDING.id)
  })

  it('offers every active category plus an explicit Uncategorised option', async () => {
    await openFixMemory()
    const options = Array.from(categorySelect().querySelectorAll('option'))
    expect(options.map(o => o.textContent)).toEqual(['Uncategorised', 'cladding', 'electrics'])
    // The clear option carries no id — that is what sends null.
    expect(options[0].getAttribute('value')).toBe('')
  })

  it('is not offered for an item type that cannot carry a category', async () => {
    renderWorkspace()
    openSection('Materials')
    fireEvent.click(await screen.findByRole('tab', { name: 'Used' }))
    const row = document.querySelector('.mem-row-tap') as HTMLElement
    fireEvent.click(row)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /fix memory/i }))
    expect(screen.queryByLabelText('Budget category')).toBeNull()
  })
})

describe('Fix memory — saving a category correction', () => {
  it('PATCHes the existing item with the chosen category and keeps its cost', async () => {
    const form = await openFixMemory()
    fireEvent.change(categorySelect(), { target: { value: ELECTRICS.id } })
    fireEvent.click(form.getByRole('button', { name: /save memory/i }))

    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalledWith(
      JOB.id, 'mem-cable', expect.objectContaining({ budgetCategoryId: ELECTRICS.id }),
    ))
    // Same item, same money: a recategorisation is not a new item and not a
    // cost edit.
    expect(mockUpdateMemoryItem).toHaveBeenCalledTimes(1)
    const [, , payload] = mockUpdateMemoryItem.mock.calls[0]
    expect(payload.totalCostAmount ?? payload.costAmount).toBe('200')
  })

  it('clearing to Uncategorised sends budgetCategoryId: null', async () => {
    const form = await openFixMemory()
    fireEvent.change(categorySelect(), { target: { value: '' } })
    fireEvent.click(form.getByRole('button', { name: /save memory/i }))

    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalledWith(
      JOB.id, 'mem-cable', expect.objectContaining({ budgetCategoryId: null }),
    ))
  })

  it('moves the row to the new category and leaves the job total alone', async () => {
    mockGetBudgetSummary
      .mockResolvedValueOnce(budgetSummary('cladding'))
      .mockResolvedValue(budgetSummary('electrics'))
    const form = await openFixMemory()
    fireEvent.change(categorySelect(), { target: { value: ELECTRICS.id } })
    fireEvent.click(form.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())

    // Authoritative Budget refetched, and the row is now under electrics.
    const elec = await screen.findByRole('region', { name: /budget category electrics/i })
    await waitFor(() => expect(within(elec).getByText(/£200/)).toBeInTheDocument())
    const clad = screen.getByRole('region', { name: /budget category cladding/i })
    expect(within(clad).queryByText(/£200/)).toBeNull()
    // Redistribution, not a change in what the job has cost.
    const hero = screen.getByRole('region', { name: /^budget$/i })
    expect(within(hero).getByText(/£200/)).toBeInTheDocument()
  })

  it('refetches Money so the paid row shows its corrected category', async () => {
    mockGetJobMoney
      .mockResolvedValueOnce(money('cladding'))
      .mockResolvedValue(money('electrics'))
    const form = await openFixMemory()
    const moneyCallsBefore = mockGetJobMoney.mock.calls.length
    fireEvent.change(categorySelect(), { target: { value: ELECTRICS.id } })
    fireEvent.click(form.getByRole('button', { name: /save memory/i }))

    await waitFor(() => expect(mockGetJobMoney.mock.calls.length).toBeGreaterThan(moneyCallsBefore))
    openSection('Money')
    const row = await screen.findByText('electrics')
    expect(row).toBeInTheDocument()
    expect(screen.queryByText('cladding')).toBeNull()
  })

  it('preserves the item’s paid state', async () => {
    mockGetBudgetSummary
      .mockResolvedValueOnce(budgetSummary('cladding'))
      .mockResolvedValue(budgetSummary('electrics'))
    const form = await openFixMemory()
    fireEvent.change(categorySelect(), { target: { value: ELECTRICS.id } })
    fireEvent.click(form.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())

    // Paid state is the backend's, carried on the budget row — the correction
    // must not have cleared it, and must not have re-marked anything.
    const elec = await screen.findByRole('region', { name: /budget category electrics/i })
    await waitFor(() => expect(within(elec).getByText(/paid/i)).toBeInTheDocument())
  })

  it('an unrelated text correction does not refetch Money', async () => {
    const form = await openFixMemory()
    mockUpdateMemoryItem.mockResolvedValue(cable({ supplierName: 'Travis Perkins' }))
    const moneyCallsBefore = mockGetJobMoney.mock.calls.length
    fireEvent.change(form.getByRole('textbox', { name: /supplier/i }), { target: { value: 'Travis Perkins' } })
    fireEvent.click(form.getByRole('button', { name: /save memory/i }))

    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())
    expect(mockGetJobMoney.mock.calls.length).toBe(moneyCallsBefore)
  })
})

describe('Fix memory — cancel and failure', () => {
  it('cancelling sends no PATCH and leaves the category alone', async () => {
    const form = await openFixMemory()
    fireEvent.change(categorySelect(), { target: { value: ELECTRICS.id } })
    fireEvent.click(form.getByRole('button', { name: /cancel/i }))

    expect(mockUpdateMemoryItem).not.toHaveBeenCalled()
    const clad = screen.getByRole('region', { name: /budget category cladding/i })
    expect(within(clad).getAllByText(/£200/).length).toBeGreaterThan(0)
  })

  it('a failed save leaves the item where it was, with a retryable error', async () => {
    mockUpdateMemoryItem.mockRejectedValue(new Error('boom'))
    const form = await openFixMemory()
    fireEvent.change(categorySelect(), { target: { value: ELECTRICS.id } })
    fireEvent.click(form.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalled())

    // No optimistic move: Budget still shows the cost under its old category,
    // and Money was never told about a change that didn't happen.
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    expect(within(clad).getAllByText(/£200/).length).toBeGreaterThan(0)
    expect(screen.getByText(/could not save/i)).toBeInTheDocument()
  })
})
