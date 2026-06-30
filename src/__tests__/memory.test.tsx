import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JobMemoryScreen from '../JobMemoryScreen'
import * as api from '../api'
import type { BudgetCategory, BudgetSummaryResponse, Job, MemoryViewItem, MemoryViewResponse } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    updateMemoryItem: vi.fn(),
    verifyMemoryItem: vi.fn(),
    getBudgetSummary: vi.fn(),
    assignMemoryItemCategory: vi.fn(),
    createBudgetCategory: vi.fn(),
    patchBudgetCategory: vi.fn(),
  }
})

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockUpdateMemoryItem = vi.mocked(api.updateMemoryItem)
const mockVerifyMemoryItem = vi.mocked(api.verifyMemoryItem)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockAssignMemoryItemCategory = vi.mocked(api.assignMemoryItemCategory)
const mockCreateBudgetCategory = vi.mocked(api.createBudgetCategory)
const mockPatchBudgetCategory = vi.mocked(api.patchBudgetCategory)

const JOB: Job = {
  id: 'job-mem-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'active', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-10T09:00:00Z',
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

// Rich fixture: cladding (£2000, plasterboard £1200 + uncertain battens),
// electrics (no budget, cable £200), uncategorised hardcore £40 (counted),
// uncategorised timber (no price, not counted), plus used + watch-out.
function memoryView(): MemoryViewResponse {
  return {
    job: JOB,
    generatedAt: '2026-06-13T10:00:00.000Z',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [
        orderedItem({ id: 'mem-clad', summary: 'plasterboard', materialName: 'plasterboard', quantity: '24', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP', totalCostAmount: '1200', budgetCategoryId: 'c1',
          source: { candidateFactId: 'f1', noteId: 'n1', transcriptId: 't1', capturedAt: '2026-06-13T09:00:00.000Z', transcriptText: 'Plasterboard from Jewson.' } }),
        orderedItem({ id: 'mem-battens', summary: 'battens', materialName: 'battens', quantity: '20', unit: 'lengths', costAmount: '140', costQualifier: 'approx', costCurrency: 'GBP', uncertaintyFlags: ['cost_uncertain'], budgetCategoryId: 'c1' }),
        orderedItem({ id: 'mem-cable', summary: 'cable', materialName: 'cable', quantity: '100', unit: 'm', totalCostAmount: '200', costCurrency: 'GBP', budgetCategoryId: 'c2' }),
        orderedItem({ id: 'mem-hardcore', summary: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', totalCostAmount: '40', costCurrency: 'GBP', budgetCategoryId: null }),
        orderedItem({ id: 'mem-timber', summary: 'timber', materialName: 'timber', quantity: '6', unit: 'lengths', budgetCategoryId: null }),
      ] },
      { key: 'used_materials', label: 'Used materials', items: [
        orderedItem({ id: 'mem-osb', memoryType: 'used_material', summary: 'Used OSB on the back wall', materialName: 'OSB', locationOrUse: 'back wall' }),
      ] },
      { key: 'leftovers', label: 'Leftovers', items: [] },
      { key: 'supplier_delivery_notes', label: 'Supplier delivery notes', items: [] },
      { key: 'customer_changes', label: 'Customer changes', items: [] },
      { key: 'watch_outs', label: 'Watch outs', items: [
        orderedItem({ id: 'mem-watch', memoryType: 'watch_out', summary: 'Uneven floor near back door', locationOrUse: 'near back door' }),
      ] },
    ],
    stillToCheck: { count: 2, items: [{ id: 'stc-1', sectionKey: 'unclear_items', summary: 'Something about extra cable', kind: 'unclear_prompt', timeLabel: 'Today' }] },
    costSummary: { orderedMaterials: {
      knownSpendAmount: '1440', knownSpendCurrency: 'GBP', knownSpendLabel: '£1440 known spend',
      includedMemoryItemIds: ['mem-clad', 'mem-cable', 'mem-hardcore'], missingCostCount: 1, uncertainCostCount: 1,
      excludedMemoryItemIds: ['mem-timber', 'mem-battens'],
      rows: [
        { key: 'plasterboard|sheets', materialName: 'plasterboard', quantity: '24', unit: 'sheets', lineTotalAmount: '1200', lineTotalCurrency: 'GBP', lineTotalLabel: '£1200 total', memoryItemIds: ['mem-clad'] },
        { key: 'cable|m', materialName: 'cable', quantity: '100', unit: 'm', lineTotalAmount: '200', lineTotalCurrency: 'GBP', lineTotalLabel: '£200 total', memoryItemIds: ['mem-cable'] },
        { key: 'hardcore|bags', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total', memoryItemIds: ['mem-hardcore'] },
      ],
      excludedRows: [
        { memoryItemId: 'mem-timber', itemLabel: 'timber', materialName: 'timber', quantity: '6', unit: 'lengths', reason: 'no_cost_remembered' },
        { memoryItemId: 'mem-battens', itemLabel: 'battens', materialName: 'battens', quantity: '20', unit: 'lengths', reason: 'cost_worth_checking' },
      ],
    } },
  }
}

const CAT_CLAD: BudgetCategory = { id: 'c1', jobId: 'job-mem-001', name: 'cladding', budgetAmount: '2000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }
const CAT_ELEC: BudgetCategory = { id: 'c2', jobId: 'job-mem-001', name: 'electrics', budgetAmount: null, budgetCurrency: null, sortOrder: 1, isArchived: false, createdAt: '', updatedAt: '' }

function budgetSummary(): BudgetSummaryResponse {
  return {
    jobId: 'job-mem-001', generatedAt: '',
    categories: [
      { category: CAT_CLAD, knownSpendAmount: '1200', knownSpendCurrency: 'GBP', knownSpendLabel: '£1200 known spend', budgetAmount: '2000', budgetCurrency: 'GBP', budgetLabel: '£2000 budget', remainingAmount: '800', remainingLabel: '£800 remaining', overBudget: false, rows: [] },
      { category: CAT_ELEC, knownSpendAmount: '200', knownSpendCurrency: 'GBP', knownSpendLabel: '£200 known spend', budgetAmount: null, budgetCurrency: null, budgetLabel: null, remainingAmount: null, remainingLabel: null, overBudget: false, rows: [] },
    ],
    uncategorized: { knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend', rows: [] },
    totals: { budgetAmount: '2000', budgetCurrency: 'GBP', knownSpendAmount: '1440', knownSpendCurrency: 'GBP', remainingAmount: '560', remainingLabel: '£560 remaining', overBudget: false },
  }
}

const EMPTY_MEMORY_VIEW: MemoryViewResponse = {
  ...memoryView(),
  sections: memoryView().sections.map(s => ({ ...s, items: [] })),
  stillToCheck: { count: 0, items: [] },
  costSummary: undefined,
}
const EMPTY_BUDGET: BudgetSummaryResponse = {
  jobId: 'job-mem-001', generatedAt: '', categories: [],
  uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
  totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: null, knownSpendCurrency: null, remainingAmount: null, remainingLabel: null, overBudget: false },
}

const onClose = vi.fn()
const onOpenReviewQueue = vi.fn()

beforeEach(() => {
  onClose.mockReset(); onOpenReviewQueue.mockReset()
  mockGetMemoryView.mockResolvedValue(memoryView())
  mockGetBudgetSummary.mockResolvedValue(budgetSummary())
  window.confirm = vi.fn(() => true)
})

function renderScreen() {
  return render(<JobMemoryScreen job={JOB} onClose={onClose} onOpenReviewQueue={onOpenReviewQueue} />)
}
const boughtTab = () => screen.findByRole('region', { name: /^known spend$/i })

describe('JobMemoryScreen — shell', () => {
  it('shows heading, job, and the three tabs', async () => {
    renderScreen()
    await boughtTab()
    expect(screen.getByText('Job memory')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Spend' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /used & left over/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /notes/i })).toBeTruthy()
  })

  it('shows a retryable error on load failure', async () => {
    mockGetMemoryView.mockRejectedValue(new Error('Network error'))
    renderScreen()
    await screen.findByRole('alert')
    expect(screen.getByText(/Network error/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  })

  it('renders the empty state and links to Things to check', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
    renderScreen()
    await screen.findByText(/No trusted memory yet/)
    fireEvent.click(screen.getByText('Go to Things to check'))
    expect(onOpenReviewQueue).toHaveBeenCalled()
  })

  it('shows the Still to check alert and opens the queue', async () => {
    renderScreen()
    await screen.findByText('2 still to check')
    fireEvent.click(screen.getByText('Review Things to check'))
    expect(onOpenReviewQueue).toHaveBeenCalled()
  })

  it('calls onClose from Back', async () => {
    renderScreen()
    await boughtTab()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('JobMemoryScreen — Bought tab', () => {
  it('shows one job-level Known spend, against the total budget', async () => {
    renderScreen()
    const hero = await boughtTab()
    expect(within(hero).getByText(/£1440/)).toBeTruthy()
    expect(within(hero).getByText(/of £2000/)).toBeTruthy()
    expect(within(hero).getByText(/£560 remaining/)).toBeTruthy()
  })

  it('renders a category card with spend and remaining, and No budget set when none', async () => {
    renderScreen()
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    expect(within(clad).getByText('£1200 known spend')).toBeTruthy()
    expect(within(clad).getByText('£800 remaining')).toBeTruthy()
    const elec = screen.getByRole('region', { name: /budget category electrics/i })
    expect(within(elec).getByText('No budget set')).toBeTruthy()
  })

  it('expands a category to its notes, each with Fix memory', async () => {
    renderScreen()
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    expect(within(clad).queryByText(/Fix memory/)).toBeNull()
    fireEvent.click(within(clad).getByRole('button', { name: /show notes \(2\)/i }))
    expect(within(clad).getAllByRole('button', { name: /fix memory/i }).length).toBe(2)
    expect(within(clad).getByText(/not in known spend yet/i)).toBeTruthy()
    expect(within(clad).getByRole('button', { name: /this is right/i })).toBeTruthy()
  })

  it('lists uncategorised counted spend and not-counted bought items separately', async () => {
    renderScreen()
    const counted = await screen.findByRole('region', { name: /uncategorised bought/i })
    expect(within(counted).getByText(/hardcore/)).toBeTruthy()
    const notCounted = screen.getByRole('region', { name: /not in known spend/i })
    expect(within(notCounted).getByText(/timber/)).toBeTruthy()
    expect(within(notCounted).getByText(/No cost remembered/i)).toBeTruthy()
  })

  it('switches to Used and Notes tabs', async () => {
    renderScreen()
    await boughtTab()
    fireEvent.click(screen.getByRole('tab', { name: /used & left over/i }))
    expect(screen.getByText('OSB')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /notes/i }))
    expect(screen.getByText('Uneven floor near back door')).toBeTruthy()
  })
})

describe('JobMemoryScreen — manage budgets (bought tab)', () => {
  it('adds a budget category and refreshes the summary', async () => {
    mockGetBudgetSummary.mockResolvedValueOnce(budgetSummary()).mockResolvedValue(budgetSummary())
    mockCreateBudgetCategory.mockResolvedValue(CAT_CLAD)
    renderScreen()
    await boughtTab()
    fireEvent.click(screen.getByRole('button', { name: /add budget category/i }))
    const form = screen.getByRole('form', { name: /budget category/i })
    fireEvent.change(form.querySelector('input[name="categoryName"]')!, { target: { value: 'roofing' } })
    fireEvent.change(form.querySelector('input[name="budgetAmount"]')!, { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /save category/i }))
    await waitFor(() => expect(mockCreateBudgetCategory).toHaveBeenCalledWith('job-mem-001', { name: 'roofing', budgetAmount: '1500' }))
    await waitFor(() => expect(mockGetBudgetSummary).toHaveBeenCalledTimes(2))
  })

  it('edits a category budget', async () => {
    mockPatchBudgetCategory.mockResolvedValue({ ...CAT_CLAD, budgetAmount: '2500' })
    renderScreen()
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: /edit budget/i }))
    const form = screen.getByRole('form', { name: /budget category/i })
    fireEvent.change(form.querySelector('input[name="budgetAmount"]')!, { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: /save category/i }))
    await waitFor(() => expect(mockPatchBudgetCategory).toHaveBeenCalledWith('job-mem-001', 'c1', { name: 'cladding', budgetAmount: '2500' }))
  })

  it('removes a category after confirming', async () => {
    mockPatchBudgetCategory.mockResolvedValue({ ...CAT_CLAD, isArchived: true })
    renderScreen()
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: 'Remove' }))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(mockPatchBudgetCategory).toHaveBeenCalledWith('job-mem-001', 'c1', { isArchived: true }))
  })

  it('does not remove a category if the confirm is cancelled', async () => {
    window.confirm = vi.fn(() => false)
    renderScreen()
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: 'Remove' }))
    expect(mockPatchBudgetCategory).not.toHaveBeenCalled()
  })
})

describe('JobMemoryScreen — assign / fix / verify', () => {
  it('assigns an uncategorised item to a category and refreshes the breakdown', async () => {
    mockAssignMemoryItemCategory.mockResolvedValue(orderedItem({ id: 'mem-hardcore', budgetCategoryId: 'c1' }))
    renderScreen()
    const counted = await screen.findByRole('region', { name: /uncategorised bought/i })
    fireEvent.change(within(counted).getByLabelText(/budget category for hardcore/i), { target: { value: 'c1' } })
    await waitFor(() => expect(mockAssignMemoryItemCategory).toHaveBeenCalledWith('job-mem-001', 'mem-hardcore', 'c1'))
    await waitFor(() => expect(mockGetBudgetSummary).toHaveBeenCalledTimes(2))
  })

  it('fixes a memory item via the uncategorised not-counted section', async () => {
    mockUpdateMemoryItem.mockResolvedValue(orderedItem({ id: 'mem-timber', materialName: 'timber', quantity: '6', unit: 'lengths', costAmount: '10', costQualifier: 'each', costCurrency: 'GBP', budgetCategoryId: null }))
    renderScreen()
    const notCounted = await screen.findByRole('region', { name: /not in known spend/i })
    const card = within(notCounted).getByText('timber').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalledWith('job-mem-001', 'mem-timber', expect.objectContaining({ costAmount: '10' })))
  })

  it('verifies a worth-checking note (This is right) inside a category', async () => {
    mockVerifyMemoryItem.mockResolvedValue({ uncertaintyFlags: [] })
    renderScreen()
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: /show notes/i }))
    fireEvent.click(within(clad).getByRole('button', { name: /this is right/i }))
    await waitFor(() => expect(mockVerifyMemoryItem).toHaveBeenCalledWith('job-mem-001', 'mem-battens'))
  })

  it('adopts the refetched costSummary after an edit (authoritative spend)', async () => {
    const after = memoryView()
    after.costSummary = {
      orderedMaterials: { ...memoryView().costSummary!.orderedMaterials, knownSpendAmount: '1500', knownSpendLabel: '£1500 known spend' },
      totalKnownCost: { knownSpendAmount: '1500', knownSpendCurrency: 'GBP', knownSpendLabel: '£1500 known spend', includedMemoryItemIds: [] },
    }
    mockGetMemoryView.mockResolvedValueOnce(memoryView()).mockResolvedValue(after)
    mockUpdateMemoryItem.mockResolvedValue(orderedItem({ id: 'mem-timber', materialName: 'timber', costAmount: '10', costQualifier: 'each', costCurrency: 'GBP' }))
    renderScreen()
    const hero = await boughtTab()
    expect(within(hero).getByText(/£1440/)).toBeTruthy()
    const notCounted = screen.getByRole('region', { name: /not in known spend/i })
    const card = within(notCounted).getByText('timber').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: /^known spend$/i })).getByText(/£1500/)).toBeTruthy())
  })

  it('on refetch failure keeps the last spend and offers retry', async () => {
    mockGetMemoryView.mockResolvedValueOnce(memoryView()).mockRejectedValue(new Error('offline'))
    mockUpdateMemoryItem.mockResolvedValue(orderedItem({ id: 'mem-timber', materialName: 'timber' }))
    renderScreen()
    const notCounted = await screen.findByRole('region', { name: /not in known spend/i })
    const card = within(notCounted).getByText('timber').closest('.mem-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => screen.getByText(/couldn’t refresh spend/i))
    expect(within(screen.getByRole('region', { name: /^known spend$/i })).getByText(/£1440/)).toBeTruthy()
  })

  it('ignores a budget refresh that resolves after a job switch', async () => {
    const JOB_B: Job = { ...JOB, id: 'job-mem-002', title: 'Extension' }
    let resolveB!: (v: BudgetSummaryResponse) => void
    const deferred = new Promise<BudgetSummaryResponse>(r => { resolveB = r })
    const stale = budgetSummary()
    stale.categories = [{ ...stale.categories[0], category: { ...CAT_CLAD, name: 'STALE' } }]
    mockGetBudgetSummary.mockReturnValueOnce(deferred).mockResolvedValue(budgetSummary())
    const { rerender } = renderScreen()
    rerender(<JobMemoryScreen job={JOB_B} onClose={onClose} onOpenReviewQueue={onOpenReviewQueue} />)
    await waitFor(() => expect(mockGetBudgetSummary).toHaveBeenCalledTimes(2))
    await act(async () => { resolveB(stale); await deferred })
    expect(screen.queryByText('STALE')).toBeNull()
  })
})

// ── Labour in Job memory (Spend tab) ────────────────────────────────────────

function labourItem(over: Partial<MemoryViewItem>): MemoryViewItem {
  return orderedItem({ memoryType: 'labour', ...over })
}

function labourView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [
        orderedItem({ id: 'mem-hardcore', summary: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', totalCostAmount: '40', costCurrency: 'GBP' }),
      ] },
      { key: 'labour', label: 'Labour', items: [
        labourItem({ id: 'lab-hours', summary: '6 hours fitting cladding', labourHours: '6', labourTask: 'fitting cladding' }),
        labourItem({ id: 'lab-rated', summary: 'Tom 8h electrics', labourPerson: 'Tom', labourTask: 'electrics', labourHours: '8', costAmount: '35', costQualifier: 'per_hour', costCurrency: 'GBP', totalCostAmount: '280' }),
      ] },
      { key: 'used_materials', label: 'Used materials', items: [] },
      { key: 'leftovers', label: 'Leftovers', items: [] },
      { key: 'supplier_delivery_notes', label: 'Supplier delivery notes', items: [] },
      { key: 'customer_changes', label: 'Customer changes', items: [] },
      { key: 'watch_outs', label: 'Watch outs', items: [] },
    ],
    stillToCheck: { count: 0, items: [] },
    costSummary: {
      orderedMaterials: { knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend', includedMemoryItemIds: ['mem-hardcore'], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [{ key: 'hardcore|bags', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total', memoryItemIds: ['mem-hardcore'] }], excludedRows: [] },
      labour: {
        knownSpendAmount: '280', knownSpendCurrency: 'GBP', knownSpendLabel: '£280 known spend',
        includedMemoryItemIds: ['lab-rated'],
        rows: [{ memoryItemId: 'lab-rated', itemLabel: 'electrics', labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics', lineTotalAmount: '280', lineTotalCurrency: 'GBP', lineTotalLabel: '£280 total' }],
        excludedRows: [{ memoryItemId: 'lab-hours', itemLabel: 'fitting cladding', labourHours: '6', labourPerson: null, labourTask: 'fitting cladding', reason: 'no_rate_or_cost' }],
      },
      totalKnownCost: { knownSpendAmount: '320', knownSpendCurrency: 'GBP', knownSpendLabel: '£320 known spend', includedMemoryItemIds: ['mem-hardcore', 'lab-rated'] },
    },
  }
}

describe('JobMemoryScreen — labour', () => {
  beforeEach(() => {
    mockGetMemoryView.mockResolvedValue(labourView())
    mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
  })

  it('hero Known spend is bought + rated labour (excludes hours-only)', async () => {
    renderScreen()
    const hero = await boughtTab()
    expect(within(hero).getByText(/£320/)).toBeTruthy()
  })

  it('shows a Labour section separate from bought materials, with hours and person', async () => {
    renderScreen()
    const labour = await screen.findByRole('region', { name: /^labour$/i })
    expect(within(labour).getByText('Tom')).toBeTruthy()
    expect(within(labour).getByText('electrics')).toBeTruthy()
    // hours-only labour is shown but flagged as not counted
    expect(within(labour).getByText(/Hours only — no cost/i)).toBeTruthy()
    // labour is NOT under the bought sections
    expect(screen.queryByRole('region', { name: /uncategorised bought/i })).toBeTruthy()
  })

  it('labour notes show their hours', async () => {
    renderScreen()
    const labour = await screen.findByRole('region', { name: /^labour$/i })
    expect(within(labour).getByText('6')).toBeTruthy()
    expect(within(labour).getByText('8')).toBeTruthy()
  })
})
