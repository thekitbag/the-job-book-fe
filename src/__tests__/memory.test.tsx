import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import type { BudgetCategory, BudgetSummaryResponse, Job, MemoryViewItem, MemoryViewResponse } from '../types'

// The SPENT / BUDGET / LEFT columns state a bare figure under their own kicker
// label, so a figure is identified by its column rather than by a phrase that
// used to repeat the label ("£1200 known spend").
function figure(scope: HTMLElement, label: string, value: string) {
  const col = within(scope).getAllByText(label, { selector: 'dt' })[0].closest('.budget-figure') as HTMLElement
  return expect(within(col).getByText(value))
}


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
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-mem-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-x', photos: [] })),
  }
})

// Memory-tab tests don't exercise capture; stub the background sync/poll hooks
// so no upload/transcript microtask lingers past teardown.
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockUpdateMemoryItem = vi.mocked(api.updateMemoryItem)
const mockVerifyMemoryItem = vi.mocked(api.verifyMemoryItem)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockAssignMemoryItemCategory = vi.mocked(api.assignMemoryItemCategory)
const mockCreateBudgetCategory = vi.mocked(api.createBudgetCategory)
const mockPatchBudgetCategory = vi.mocked(api.patchBudgetCategory)

const JOB: Job = {
  id: 'job-mem-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-10T09:00:00Z',
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
    },
    // Job-level total drives the Overview known-spend + Spend hero.
    totalKnownCost: { knownSpendAmount: '1440', knownSpendCurrency: 'GBP', knownSpendLabel: '£1440 known spend', includedMemoryItemIds: ['mem-clad', 'mem-cable', 'mem-hardcore'] },
    },
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
    uncategorized: {
      knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend',
      rows: [{ memoryItemId: 'mem-hardcore', memoryType: 'ordered_material', itemLabel: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total' }],
    },
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

const onOpenReviewQueue = vi.fn()
const onSwitchJob = vi.fn()

beforeEach(() => {
  onOpenReviewQueue.mockReset(); onSwitchJob.mockReset()
  mockGetMemoryView.mockResolvedValue(memoryView())
  mockGetBudgetSummary.mockResolvedValue(budgetSummary())
  window.confirm = vi.fn(() => true)
})

function renderWorkspace(job: Job = JOB) {
  return render(<CurrentJobWorkspace job={job} onOpenReviewQueue={onOpenReviewQueue} onSwitchJob={onSwitchJob} />)
}
// Navigate to a lens in the new job-home model: sections are cards on home,
// Used lives inside Materials, and Notes lives inside Job log.
function openTab(name: string) {
  const back = screen.queryByRole('button', { name: /job home/i })
  if (back) fireEvent.click(back)
  if (name === 'Used') {
    fireEvent.click(screen.getByRole('button', { name: 'Open Materials' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Used' }))
  } else if (name === 'Notes') {
    fireEvent.click(screen.getByRole('button', { name: 'Open Job log' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
  } else {
    fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }))
  }
}
// The Spend tab's Known-spend hero region.
const spendHero = () => screen.findByRole('region', { name: /^budget$/i })

describe('Workspace — shell / home', () => {
  it('shows the job title and the stable section cards', async () => {
    renderWorkspace()
    expect(screen.getByRole('heading', { name: 'Garden Room' })).toBeTruthy()
    for (const card of ['Open Budget', 'Open Labour', 'Open Materials', 'Open Job log']) {
      expect(screen.getByRole('button', { name: card })).toBeTruthy()
    }
  })

  it('opens on job home by default with no global tab strip', async () => {
    renderWorkspace()
    expect(screen.queryByRole('tab', { name: 'Overview' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open Budget' })).toBeTruthy()
  })

  it('Switch calls onSwitchJob', async () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /switch/i }))
    expect(onSwitchJob).toHaveBeenCalled()
  })

  it('shows a retryable error on the Spend tab when memory fails to load', async () => {
    mockGetMemoryView.mockRejectedValue(new Error('Network error'))
    renderWorkspace()
    openTab('Budget')
    await screen.findAllByRole('alert')
    expect(screen.getByText(/Network error/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
  })

  it('Spend tab shows an empty state when nothing is remembered', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
    renderWorkspace()
    openTab('Budget')
    await screen.findByText(/No costs yet/i)
  })
})

describe('Workspace — Spend tab', () => {
  it('shows one job-level Known spend, against the total budget', async () => {
    renderWorkspace()
    openTab('Budget')
    const hero = await spendHero()
    expect(within(hero).getByText(/£1440/)).toBeTruthy()
    expect(within(hero).getByText(/of £2000/)).toBeTruthy()
    expect(within(hero).getByText(/£560 remaining/)).toBeTruthy()
  })

  it('renders a category card with spend and remaining, and No budget set when none', async () => {
    renderWorkspace()
    openTab('Budget')
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    figure(clad, 'Cost', '£1200').toBeTruthy()
    figure(clad, 'Remaining', '£800').toBeTruthy()
    const elec = screen.getByRole('region', { name: /budget category electrics/i })
    figure(elec, 'Budget', 'Not set').toBeTruthy()
  })

  it('expands a category to tappable entry rows, with Fix memory in the drawer', async () => {
    renderWorkspace()
    openTab('Budget')
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    expect(within(clad).queryByText(/Fix memory/)).toBeNull()
    fireEvent.click(within(clad).getByRole('button', { name: /show items \(2\)/i }))
    // Two clean tappable ledger rows — no repeated inline Fix memory CTA.
    expect(clad.querySelectorAll('.mem-row-tap').length).toBe(2)
    expect(within(clad).queryByRole('button', { name: /fix memory/i })).toBeNull()
    // A cost item not counted in Budget still says so on the row.
    expect(within(clad).getByText(/not counted yet/i)).toBeTruthy()
    // Worth-checking keeps its inline verify prompt (a question, not a CTA).
    expect(within(clad).getByRole('button', { name: /this is right/i })).toBeTruthy()
    // Fix memory lives in the row's tap-to-open drawer.
    fireEvent.click(clad.querySelectorAll('.mem-row-tap')[0] as HTMLElement)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /fix memory/i })).toBeInTheDocument()
  })

  it('lists uncategorised counted spend and not-counted bought items separately', async () => {
    renderWorkspace()
    openTab('Budget')
    const counted = await screen.findByRole('region', { name: /uncategorised cost/i })
    expect(within(counted).getByText(/hardcore/)).toBeTruthy()
    // no-price items live in the unified "Not counted yet" area
    const notCounted = screen.getByRole('region', { name: /not counted yet/i })
    fireEvent.click(within(notCounted).getByRole('button', { name: /add prices/i }))
    expect(within(notCounted).getByText(/timber/)).toBeTruthy()
    expect(within(notCounted).getByText(/No price yet/i)).toBeTruthy()
  })

  // Regression: uncategorised spend must be driven by budgetSummary.uncategorized.rows
  // (authoritative, includes labour), not re-derived from ordered_materials alone.
  // Also proves active categories with empty rows do not swallow/hide the
  // uncategorised detail — the bug this test protects failed silently: the hero
  // total was right, but none of the contributing rows were visible anywhere.
  it('shows uncategorised mixed material/labour spend even when active categories have no rows', async () => {
    const CAT_MATERIALS: BudgetCategory = { id: 'c-materials', jobId: 'job-mem-001', name: 'materials', budgetAmount: null, budgetCurrency: null, sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }
    const CAT_TIMBER: BudgetCategory = { id: 'c-timber', jobId: 'job-mem-001', name: 'timber', budgetAmount: null, budgetCurrency: null, sortOrder: 1, isArchived: false, createdAt: '', updatedAt: '' }

    const HARDCORE = orderedItem({ id: 'mem-hardcore2', summary: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', totalCostAmount: '40', costCurrency: 'GBP', budgetCategoryId: null })
    const ELECTRICS = orderedItem({ id: 'lab-electrics', memoryType: 'labour', summary: 'electrics', labourTask: 'electrics', labourPerson: 'Tom', labourHours: '8', costAmount: '35', costQualifier: 'per_hour', totalCostAmount: '280', costCurrency: 'GBP', budgetCategoryId: null })
    const ROOF = orderedItem({ id: 'lab-roof', memoryType: 'labour', summary: 'roof', labourTask: 'roof', totalCostAmount: '600', costCurrency: 'GBP', budgetCategoryId: null })

    mockGetMemoryView.mockResolvedValue({
      job: JOB, generatedAt: '',
      sections: [
        { key: 'ordered_materials', label: 'Ordered materials', items: [HARDCORE] },
        { key: 'labour', label: 'Labour', items: [ELECTRICS, ROOF] },
        { key: 'used_materials', label: 'Used materials', items: [] },
        { key: 'leftovers', label: 'Leftovers', items: [] },
        { key: 'supplier_delivery_notes', label: 'Supplier delivery notes', items: [] },
        { key: 'customer_changes', label: 'Customer changes', items: [] },
        { key: 'watch_outs', label: 'Watch outs', items: [] },
      ],
      stillToCheck: { count: 0, items: [] },
      costSummary: {
        orderedMaterials: { knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend', includedMemoryItemIds: ['mem-hardcore2'], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [{ key: 'hardcore|bags', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total', memoryItemIds: ['mem-hardcore2'] }], excludedRows: [] },
        labour: {
          knownSpendAmount: '880', knownSpendCurrency: 'GBP', knownSpendLabel: '£880 known spend',
          includedMemoryItemIds: ['lab-electrics', 'lab-roof'],
          rows: [
            { memoryItemId: 'lab-electrics', itemLabel: 'electrics', labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics', lineTotalAmount: '280', lineTotalCurrency: 'GBP', lineTotalLabel: '£280 total' },
            { memoryItemId: 'lab-roof', itemLabel: 'roof', labourHours: null, labourPerson: null, labourTask: 'roof', lineTotalAmount: '600', lineTotalCurrency: 'GBP', lineTotalLabel: '£600 total' },
          ],
          excludedRows: [],
        },
        totalKnownCost: { knownSpendAmount: '920', knownSpendCurrency: 'GBP', knownSpendLabel: '£920 known spend', includedMemoryItemIds: ['mem-hardcore2', 'lab-electrics', 'lab-roof'] },
      },
    })
    mockGetBudgetSummary.mockResolvedValue({
      jobId: JOB.id, generatedAt: '',
      categories: [
        { category: CAT_MATERIALS, knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, budgetAmount: null, budgetCurrency: null, budgetLabel: null, remainingAmount: null, remainingLabel: null, overBudget: false, rows: [] },
        { category: CAT_TIMBER, knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, budgetAmount: null, budgetCurrency: null, budgetLabel: null, remainingAmount: null, remainingLabel: null, overBudget: false, rows: [] },
      ],
      uncategorized: {
        knownSpendAmount: '920', knownSpendCurrency: 'GBP', knownSpendLabel: '£920 known spend',
        rows: [
          { memoryItemId: 'mem-hardcore2', memoryType: 'ordered_material', itemLabel: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total' },
          { memoryItemId: 'lab-electrics', memoryType: 'labour', itemLabel: 'electrics', materialName: null, quantity: null, unit: null, labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics', lineTotalAmount: '280', lineTotalCurrency: 'GBP', lineTotalLabel: '£280 total' },
          { memoryItemId: 'lab-roof', memoryType: 'labour', itemLabel: 'roof', materialName: null, quantity: null, unit: null, labourTask: 'roof', lineTotalAmount: '600', lineTotalCurrency: 'GBP', lineTotalLabel: '£600 total' },
        ],
      },
      totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: '920', knownSpendCurrency: 'GBP', remainingAmount: null, remainingLabel: null, overBudget: false },
    })

    renderWorkspace()
    openTab('Budget')

    // Hero shows the authoritative known-spend total.
    const hero = await spendHero()
    expect(within(hero).getByText(/£920/)).toBeTruthy()

    // The empty-rows categories render (and don't error/hide anything) —
    // they just don't swallow the uncategorised spend below.
    expect(await screen.findByRole('region', { name: /budget category materials/i })).toBeTruthy()
    expect(screen.getByRole('region', { name: /budget category timber/i })).toBeTruthy()

    // Uncategorised spend section is visible under its own (non bought-only) name
    // — the exact, anchored match fails if it's still "Bought · uncategorised" —
    // and shows the bought row. Labour rows are NOT duplicated here: they render
    // once under the Labour group (derived fallback, since budgetSummary.labour
    // is absent on this older-shaped response).
    const section = screen.getByRole('region', { name: /^uncategorised cost$/i })
    expect(within(section).getByText(/hardcore/)).toBeTruthy()
    expect(within(section).getByText('£40')).toBeTruthy()
    expect(within(section).queryByText(/electrics/)).toBeNull()
    expect(within(section).queryByText(/roof/)).toBeNull()

    // Labour group carries the trusted labour cost once (280 + 600 = 880),
    // with no manual Labour category required.
    const labourGroup = screen.getByRole('region', { name: /^labour$/i })
    figure(labourGroup, 'Cost', '£880').toBeTruthy()
    figure(labourGroup, 'Budget', 'Not set').toBeTruthy()
    fireEvent.click(within(labourGroup).getByRole('button', { name: /show items/i }))
    expect(within(labourGroup).getByText('electrics')).toBeTruthy()
    expect(within(labourGroup).getByText('roof')).toBeTruthy()
  })
})

describe('Workspace — Used and Notes tabs', () => {
  it('Used tab shows used materials', async () => {
    renderWorkspace()
    openTab('Used')
    expect(await screen.findByText('OSB')).toBeTruthy()
  })

  it('Notes tab shows watch-outs', async () => {
    renderWorkspace()
    openTab('Notes')
    expect(await screen.findByText('Uneven floor near back door')).toBeTruthy()
  })
})

describe('Workspace — manage budgets (Spend tab)', () => {
  it('adds a budget category and refreshes the summary', async () => {
    mockGetBudgetSummary.mockResolvedValueOnce(budgetSummary()).mockResolvedValue(budgetSummary())
    mockCreateBudgetCategory.mockResolvedValue(CAT_CLAD)
    renderWorkspace()
    openTab('Budget')
    await spendHero()
    fireEvent.click(screen.getByRole('button', { name: /add budget category/i }))
    const form = screen.getByRole('form', { name: /budget category/i })
    fireEvent.change(form.querySelector('input[name="categoryName"]')!, { target: { value: 'roofing' } })
    fireEvent.change(form.querySelector('input[name="budgetAmount"]')!, { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /save category/i }))
    await waitFor(() => expect(mockCreateBudgetCategory).toHaveBeenCalledWith('job-mem-001', { name: 'roofing', budgetAmount: '1500' }))
    await waitFor(() => expect(mockGetBudgetSummary).toHaveBeenCalledTimes(2))
  })

  it('edits a category budget (via the ⋯ menu)', async () => {
    mockPatchBudgetCategory.mockResolvedValue({ ...CAT_CLAD, budgetAmount: '2500' })
    renderWorkspace()
    openTab('Budget')
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: /actions for cladding/i }))
    fireEvent.click(within(clad).getByRole('menuitem', { name: /edit budget/i }))
    const form = screen.getByRole('form', { name: /budget category/i })
    fireEvent.change(form.querySelector('input[name="budgetAmount"]')!, { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: /save category/i }))
    await waitFor(() => expect(mockPatchBudgetCategory).toHaveBeenCalledWith('job-mem-001', 'c1', { name: 'cladding', budgetAmount: '2500' }))
  })

  it('removes a category from the ⋯ menu after confirming', async () => {
    mockPatchBudgetCategory.mockResolvedValue({ ...CAT_CLAD, isArchived: true })
    renderWorkspace()
    openTab('Budget')
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: /actions for cladding/i }))
    fireEvent.click(within(clad).getByRole('menuitem', { name: /remove category/i }))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(mockPatchBudgetCategory).toHaveBeenCalledWith('job-mem-001', 'c1', { isArchived: true }))
  })

  it('does not remove a category if the confirm is cancelled', async () => {
    window.confirm = vi.fn(() => false)
    renderWorkspace()
    openTab('Budget')
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: /actions for cladding/i }))
    fireEvent.click(within(clad).getByRole('menuitem', { name: /remove category/i }))
    expect(mockPatchBudgetCategory).not.toHaveBeenCalled()
  })

  // Regression guard for the budget-before-spend fix (PR #51): the Budget
  // categories section now renders unconditionally rather than only inside
  // the hasSpendContent branch — confirm that doesn't leave a second
  // "+ Add budget category" control behind when spend already exists.
  it('shows exactly one Add-budget-category control when spend already exists', async () => {
    renderWorkspace()
    openTab('Budget')
    await spendHero()
    expect(screen.getAllByRole('button', { name: /add budget category/i })).toHaveLength(1)
  })
})

// Regression: budget setup must not require spend to exist first — a job
// with no ordered/labour spend and no categories yet still needs a way to
// create its first budget category.
describe('Workspace — budget setup before spend', () => {
  const CAT_MATERIALS: BudgetCategory = { id: 'c-new', jobId: 'job-mem-001', name: 'Materials', budgetAmount: '500', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }
  const BUDGET_WITH_EMPTY_CATEGORY: BudgetSummaryResponse = {
    jobId: 'job-mem-001', generatedAt: '',
    categories: [{ category: CAT_MATERIALS, knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, budgetAmount: '500', budgetCurrency: 'GBP', budgetLabel: '£500 budget', remainingAmount: '500', remainingLabel: '£500 remaining', overBudget: false, rows: [] }],
    uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
    totals: { budgetAmount: '500', budgetCurrency: 'GBP', knownSpendAmount: null, knownSpendCurrency: null, remainingAmount: '500', remainingLabel: '£500 remaining', overBudget: false },
  }

  it('a job with no spend and no categories still shows a way to add a budget category', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
    renderWorkspace()
    openTab('Budget')
    await screen.findByText(/No costs yet/i)
    expect(screen.getByRole('button', { name: /add budget category/i })).toBeInTheDocument()
  })

  it('adding a category before any spend renders an empty category card with budget copy and an Add-to action', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    mockGetBudgetSummary.mockResolvedValueOnce(EMPTY_BUDGET).mockResolvedValue(BUDGET_WITH_EMPTY_CATEGORY)
    mockCreateBudgetCategory.mockResolvedValue(CAT_MATERIALS)
    renderWorkspace()
    openTab('Budget')
    await screen.findByText(/No costs yet/i)

    fireEvent.click(screen.getByRole('button', { name: /add budget category/i }))
    const form = screen.getByRole('form', { name: /budget category/i })
    fireEvent.change(form.querySelector('input[name="categoryName"]')!, { target: { value: 'Materials' } })
    fireEvent.change(form.querySelector('input[name="budgetAmount"]')!, { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /save category/i }))

    await waitFor(() => expect(mockCreateBudgetCategory).toHaveBeenCalledWith('job-mem-001', { name: 'Materials', budgetAmount: '500' }))
    const card = await screen.findByRole('region', { name: /budget category materials/i })
    expect(within(card).getByText('None yet')).toBeInTheDocument()
    figure(card, 'Budget', '£500').toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /add to materials/i })).toBeInTheDocument()
  })

  it('category creation failure keeps the form open with entered values and shows a retryable error', async () => {
    mockGetMemoryView.mockResolvedValue(EMPTY_MEMORY_VIEW)
    mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
    mockCreateBudgetCategory.mockRejectedValue(new Error('network error'))
    renderWorkspace()
    openTab('Budget')
    await screen.findByText(/No costs yet/i)

    fireEvent.click(screen.getByRole('button', { name: /add budget category/i }))
    const form = screen.getByRole('form', { name: /budget category/i })
    fireEvent.change(form.querySelector('input[name="categoryName"]')!, { target: { value: 'Materials' } })
    fireEvent.change(form.querySelector('input[name="budgetAmount"]')!, { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /save category/i }))

    await screen.findByText(/could not add category/i)
    // the form is still open with the entered values, not reset/closed
    const stillOpenForm = screen.getByRole('form', { name: /budget category/i })
    expect((stillOpenForm.querySelector('input[name="categoryName"]') as HTMLInputElement).value).toBe('Materials')
    expect((stillOpenForm.querySelector('input[name="budgetAmount"]') as HTMLInputElement).value).toBe('500')
    // Record stays available throughout (this test env has no mic support,
    // so the bar renders its "not supported" copy rather than the button —
    // the point is the bar itself is never hidden by the category failure).
    expect(document.querySelector('.ws-record-bar')).toBeInTheDocument()
  })
})

describe('Workspace — assign / fix / verify', () => {
  it('assigns an uncategorised item to a category and refreshes the breakdown', async () => {
    mockAssignMemoryItemCategory.mockResolvedValue(orderedItem({ id: 'mem-hardcore', budgetCategoryId: 'c1' }))
    renderWorkspace()
    openTab('Budget')
    const counted = await screen.findByRole('region', { name: /uncategorised cost/i })
    // Uncategorised rows are tappable; category assignment lives in the drawer,
    // not as an inline control in the middle of the ledger.
    fireEvent.click(counted.querySelector('.mem-row-tap') as HTMLElement)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /choose category/i }))
    fireEvent.click(within(screen.getByRole('dialog', { name: /choose a category/i })).getByRole('button', { name: 'cladding' }))
    await waitFor(() => expect(mockAssignMemoryItemCategory).toHaveBeenCalledWith('job-mem-001', 'mem-hardcore', 'c1'))
    await waitFor(() => expect(mockGetBudgetSummary).toHaveBeenCalledTimes(2))
  })

  it('fixes a memory item via the uncategorised not-counted section', async () => {
    mockUpdateMemoryItem.mockResolvedValue(orderedItem({ id: 'mem-timber', materialName: 'timber', quantity: '6', unit: 'lengths', costAmount: '10', costQualifier: 'each', costCurrency: 'GBP', budgetCategoryId: null }))
    renderWorkspace()
    openTab('Budget')
    const notCounted = await screen.findByRole('region', { name: /not counted yet/i })
    fireEvent.click(within(notCounted).getByRole('button', { name: /add prices/i }))
    const card = within(notCounted).getByText(/timber/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(mockUpdateMemoryItem).toHaveBeenCalledWith('job-mem-001', 'mem-timber', expect.objectContaining({ costAmount: '10' })))
  })

  it('verifies a worth-checking note (This is right) inside a category', async () => {
    mockVerifyMemoryItem.mockResolvedValue({ uncertaintyFlags: [] })
    renderWorkspace()
    openTab('Budget')
    const clad = await screen.findByRole('region', { name: /budget category cladding/i })
    fireEvent.click(within(clad).getByRole('button', { name: /show items/i }))
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
    renderWorkspace()
    openTab('Budget')
    const hero = await spendHero()
    expect(within(hero).getByText(/£1440/)).toBeTruthy()
    const notCounted = screen.getByRole('region', { name: /not counted yet/i })
    fireEvent.click(within(notCounted).getByRole('button', { name: /add prices/i }))
    const card = within(notCounted).getByText(/timber/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: /^budget$/i })).getByText(/£1500/)).toBeTruthy())
  })

  it('on refetch failure keeps the last spend and offers retry', async () => {
    mockGetMemoryView.mockResolvedValueOnce(memoryView()).mockRejectedValue(new Error('offline'))
    mockUpdateMemoryItem.mockResolvedValue(orderedItem({ id: 'mem-timber', materialName: 'timber' }))
    renderWorkspace()
    openTab('Budget')
    const notCounted = await screen.findByRole('region', { name: /not counted yet/i })
    fireEvent.click(within(notCounted).getByRole('button', { name: /add prices/i }))
    const card = within(notCounted).getByText(/timber/).closest('.cost-check-item') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /fix memory/i }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    await waitFor(() => screen.getByText(/couldn’t refresh/i))
    expect(within(screen.getByRole('region', { name: /^budget$/i })).getByText(/£1440/)).toBeTruthy()
  })

  it('ignores a budget refresh that resolves after a job switch', async () => {
    const JOB_B: Job = { ...JOB, id: 'job-mem-002', title: 'Extension' }
    let resolveB!: (v: BudgetSummaryResponse) => void
    const deferred = new Promise<BudgetSummaryResponse>(r => { resolveB = r })
    const stale = budgetSummary()
    stale.categories = [{ ...stale.categories[0], category: { ...CAT_CLAD, name: 'STALE' } }]
    mockGetBudgetSummary.mockReturnValueOnce(deferred).mockResolvedValue(budgetSummary())
    const { rerender } = renderWorkspace()
    openTab('Budget')
    rerender(<CurrentJobWorkspace job={JOB_B} onOpenReviewQueue={onOpenReviewQueue} onSwitchJob={onSwitchJob} />)
    await waitFor(() => expect(mockGetBudgetSummary).toHaveBeenCalledTimes(2))
    await act(async () => { resolveB(stale); await deferred })
    expect(screen.queryByText('STALE')).toBeNull()
  })
})

// ── Labour lens ──────────────────────────────────────────────────────────────

function labourItem(over: Partial<MemoryViewItem>): MemoryViewItem {
  return orderedItem({ memoryType: 'labour', ...over })
}

// Local-noon stamps for today/yesterday so day grouping is deterministic in the
// device timezone the component groups by.
function localNoon(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T12:00:00`
}

function labourView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [
        orderedItem({ id: 'mem-hardcore', summary: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', totalCostAmount: '40', costCurrency: 'GBP' }),
      ] },
      { key: 'labour', label: 'Labour', items: [
        // Two people extracted from ONE note, both today.
        labourItem({ id: 'lab-mike', summary: 'Mike worked 4 hours', labourPerson: 'Mike', labourHours: '4', happenedAt: localNoon(0) }),
        labourItem({ id: 'lab-kurt', summary: 'Kurt worked 6 hours', labourPerson: 'Kurt', labourHours: '6', happenedAt: localNoon(0) }),
        labourItem({ id: 'lab-rated', summary: 'Tom 8h electrics', labourPerson: 'Tom', labourTask: 'electrics', labourHours: '8', costAmount: '35', costQualifier: 'per_hour', costCurrency: 'GBP', totalCostAmount: '280', happenedAt: localNoon(0) }),
        // Hours-only, no named person, yesterday.
        labourItem({ id: 'lab-hours', summary: '6 hours fitting cladding', labourHours: '6', labourTask: 'fitting cladding', happenedAt: localNoon(1) }),
        // Worth checking: visible, but never totalled.
        labourItem({ id: 'lab-check', summary: 'Apprentice about 5 hours', labourPerson: 'Apprentice', labourHours: 'about 5', labourTask: 'clearing up', uncertaintyFlags: ['uncertain_hours'], happenedAt: localNoon(0) }),
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

describe('Workspace — Labour tab', () => {
  beforeEach(() => {
    mockGetMemoryView.mockResolvedValue(labourView())
    mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
  })

  it('Spend hero Known spend is bought + rated labour (excludes hours-only)', async () => {
    renderWorkspace()
    openTab('Budget')
    const hero = await spendHero()
    expect(within(hero).getByText(/£320/)).toBeTruthy()
  })

  it('groups labour by day with day totals and a job total', async () => {
    renderWorkspace()
    openTab('Labour')
    const labour = await screen.findByRole('tabpanel', { name: /labour/i })
    // Safe hours only: today 4 + 6 + 8 = 18h, yesterday 6h → 24h job total.
    expect(within(labour).getByText('24h')).toBeTruthy()
    const today = within(labour).getByRole('region', { name: 'Labour Today' })
    expect(within(today).getByText('18h day total')).toBeTruthy()
    const yesterday = within(labour).getByRole('region', { name: 'Labour Yesterday' })
    expect(within(yesterday).getByText('6h day total')).toBeTruthy()
  })

  it('renders multiple people from one note under the same day', async () => {
    renderWorkspace()
    openTab('Labour')
    const labour = await screen.findByRole('tabpanel', { name: /labour/i })
    const today = within(labour).getByRole('region', { name: 'Labour Today' })
    expect(within(today).getByText('Mike')).toBeTruthy()
    expect(within(today).getByText('Kurt')).toBeTruthy()
    expect(within(today).getByText('4h')).toBeTruthy()
  })

  it('shows person, hours, task; money stays secondary (rated total or No cost added)', async () => {
    renderWorkspace()
    openTab('Labour')
    const labour = await screen.findByRole('tabpanel', { name: /labour/i })
    expect(within(labour).getByText('Tom')).toBeTruthy()
    expect(within(labour).getByText('electrics')).toBeTruthy()
    expect(within(labour).getByText('8h')).toBeTruthy()
    // rated labour shows its trusted line total; hours-only shows No cost added
    expect(within(labour).getByText('£280')).toBeTruthy()
    expect(within(labour).getAllByText('No cost added').length).toBeGreaterThan(0)
  })

  it('renders an entry without a named person safely, and keeps worth-checking visible but untotalled', async () => {
    renderWorkspace()
    openTab('Labour')
    const labour = await screen.findByRole('tabpanel', { name: /labour/i })
    // no named person → neutral "Labour" headline, hours still visible
    const yesterday = within(labour).getByRole('region', { name: 'Labour Yesterday' })
    expect(within(yesterday).getByText('Labour')).toBeTruthy()
    expect(within(yesterday).getByText('6h')).toBeTruthy()
    // worth-checking entry stays visible with its said-hours, excluded from totals
    expect(within(labour).getByText('Apprentice')).toBeTruthy()
    expect(within(labour).getByText('about 5')).toBeTruthy()
    expect(within(labour).getByText(/worth checking — not counted in totals/i)).toBeTruthy()
    // job total ignores it (still 24h)
    expect(within(labour).getByText('24h')).toBeTruthy()
  })

  it('prefers the backend labourHoursSummary over local derivation when present', async () => {
    const view = labourView()
    view.labourHoursSummary = {
      totalHours: '99', totalLabel: '99h job total',
      days: [{ date: '2026-07-01', totalHours: '99', totalLabel: '99h day total', items: [
        { memoryItemId: 'lab-rated', labourPerson: 'Tom', labourTask: 'electrics', labourHours: '99', hoursLabel: '99h', happenedAt: '2026-07-01T12:00:00', includedInHourTotal: true, worthChecking: false, lineTotalAmount: null, lineTotalCurrency: null, lineTotalLabel: null },
      ] }],
    }
    mockGetMemoryView.mockResolvedValue(view)
    renderWorkspace()
    openTab('Labour')
    const labour = await screen.findByRole('tabpanel', { name: /labour/i })
    const jobTotal = within(labour).getByRole('region', { name: 'Labour hours' })
    expect(within(jobTotal).getByText('99h')).toBeTruthy()
    expect(within(jobTotal).queryByText('24h')).toBeNull()
  })
})

// ── Spend Labour group ───────────────────────────────────────────────────────

describe('Workspace — Spend Labour group', () => {
  const CAT_LABOUR: BudgetCategory = { id: 'c-labour', jobId: 'job-mem-001', name: 'labour', budgetAmount: '1500', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }
  const LAB_RATED_ROW = { memoryItemId: 'lab-rated', memoryType: 'labour', itemLabel: 'electrics', materialName: null, quantity: null, unit: null, labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics', lineTotalAmount: '280', lineTotalCurrency: 'GBP', lineTotalLabel: '£280 total' }

  function budgetWithLabourGroup(): BudgetSummaryResponse {
    return {
      jobId: 'job-mem-001', generatedAt: '',
      // Backward-compatible: the labour row also appears under its category —
      // the frontend must de-duplicate and show it only under Labour.
      categories: [
        { category: CAT_LABOUR, knownSpendAmount: '280', knownSpendCurrency: 'GBP', knownSpendLabel: '£280 known spend', budgetAmount: '1500', budgetCurrency: 'GBP', budgetLabel: '£1500 budget', remainingAmount: '1220', remainingLabel: '£1220 remaining', overBudget: false, rows: [LAB_RATED_ROW] },
      ],
      uncategorized: {
        knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend',
        rows: [{ memoryItemId: 'mem-hardcore', memoryType: 'ordered_material', itemLabel: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total' }],
      },
      totals: { budgetAmount: '1500', budgetCurrency: 'GBP', knownSpendAmount: '320', knownSpendCurrency: 'GBP', remainingAmount: '1180', remainingLabel: '£1180 remaining', overBudget: false },
      labour: {
        knownSpendAmount: '280', knownSpendCurrency: 'GBP', knownSpendLabel: '£280 known spend',
        budgetCategory: CAT_LABOUR, budgetAmount: '1500', budgetCurrency: 'GBP', budgetLabel: '£1500 budget',
        remainingAmount: '1220', remainingLabel: '£1220 remaining', overBudget: false,
        rows: [LAB_RATED_ROW],
      },
    }
  }

  beforeEach(() => {
    mockGetMemoryView.mockResolvedValue(labourView())
    mockGetBudgetSummary.mockResolvedValue(budgetWithLabourGroup())
  })

  it('shows trusted labour once under Labour, with the existing category budget/remaining', async () => {
    renderWorkspace()
    openTab('Budget')
    const group = await screen.findByRole('region', { name: /^labour$/i })
    figure(group, 'Cost', '£280').toBeTruthy()
    figure(group, 'Remaining', '£1220').toBeTruthy()
    // the manual labour category card is suppressed — one Labour home, not two
    expect(screen.queryByRole('region', { name: /budget category labour/i })).toBeNull()
    // the labour row renders under Labour, not under Uncategorised
    fireEvent.click(within(group).getByRole('button', { name: /show items/i }))
    expect(within(group).getByText(/Tom/)).toBeTruthy()
    const uncat = screen.getByRole('region', { name: /^uncategorised cost$/i })
    expect(within(uncat).queryByText(/electrics/)).toBeNull()
    expect(within(uncat).getByText(/hardcore/)).toBeTruthy()
  })

  it('shows the Labour group with no budget when there is no labour category', async () => {
    const bs = budgetWithLabourGroup()
    bs.categories = []
    bs.labour = { ...bs.labour!, budgetCategory: null, budgetAmount: null, budgetCurrency: null, budgetLabel: null, remainingAmount: null, remainingLabel: null, overBudget: false }
    mockGetBudgetSummary.mockResolvedValue(bs)
    renderWorkspace()
    openTab('Budget')
    const group = await screen.findByRole('region', { name: /^labour$/i })
    figure(group, 'Cost', '£280').toBeTruthy()
    figure(group, 'Budget', 'Not set').toBeTruthy()
  })

  it('hours-only labour never appears as spend', async () => {
    renderWorkspace()
    openTab('Budget')
    const group = await screen.findByRole('region', { name: /^labour$/i })
    fireEvent.click(within(group).getByRole('button', { name: /show items/i }))
    // Mike/Kurt (hours-only) are not monetary rows anywhere in Spend
    expect(within(group).queryByText('Mike')).toBeNull()
    const uncat = screen.getByRole('region', { name: /^uncategorised cost$/i })
    expect(within(uncat).queryByText('Mike')).toBeNull()
  })
})
