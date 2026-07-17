import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import SourceHistory, { formatSavedStamp } from '../SourceHistory'
import * as api from '../api'
import { makeNote } from './helpers'
import type { BudgetCategory, BudgetSummaryResponse, Job, MemoryViewItem, MemoryViewResponse } from '../types'

// The SPENT / BUDGET / LEFT columns state a bare figure under their own kicker
// label, so a figure is identified by its column rather than by a phrase that
// used to repeat the label ("£280 known spend").
function figure(scope: HTMLElement, label: string, value: string) {
  const col = within(scope).getAllByText(label, { selector: 'dt' })[0].closest('.budget-figure') as HTMLElement
  return expect(within(col).getByText(value))
}
async function figureAsync(scope: HTMLElement, label: string, value: string) {
  const col = (await within(scope).findAllByText(label, { selector: 'dt' }))[0].closest('.budget-figure') as HTMLElement
  return expect(within(col).getByText(value))
}


vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    createMemoryItem: vi.fn(),
    updateMemoryItem: vi.fn(),
    patchJob: vi.fn(),
    createBudgetCategory: vi.fn(),
    patchBudgetCategory: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-lc-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-x', photos: [] })),
  }
})
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockPatchJob = vi.mocked(api.patchJob)

const JOB: Job = {
  id: 'job-lc-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '',
}

function item(over: Partial<MemoryViewItem>): MemoryViewItem {
  return {
    id: 'x', memoryType: 'ordered_material', summary: '', materialName: null, quantity: null, unit: null,
    supplierName: null, deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    uncertaintyFlags: [], budgetCategoryId: null, sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '', updatedAt: '', source: null, ...over,
  }
}

const CAT_LABOUR: BudgetCategory = { id: 'c-lab', jobId: JOB.id, name: 'labour', budgetAmount: '1500', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }
const CAT_TIMBER: BudgetCategory = { id: 'c-timber', jobId: JOB.id, name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP', sortOrder: 1, isArchived: false, createdAt: '', updatedAt: '' }

const LAB_ROW = { memoryItemId: 'lab-1', memoryType: 'labour', itemLabel: 'electrics', materialName: null, quantity: null, unit: null, labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics', lineTotalAmount: '280', lineTotalCurrency: 'GBP', lineTotalLabel: '£280 total' }
const HIST_ROW = { memoryItemId: 'hist-1', memoryType: 'ordered_material', itemLabel: 'agency invoice', materialName: 'agency invoice', quantity: null, unit: null, lineTotalAmount: '150', lineTotalCurrency: 'GBP', lineTotalLabel: '£150 total' }

function memoryView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [
        // historical non-labour spend assigned to the Labour category
        item({ id: 'hist-1', summary: 'Paid agency invoice, £150', materialName: 'agency invoice', costAmount: '150', costCurrency: 'GBP', costQualifier: 'total', totalCostAmount: '150', budgetCategoryId: 'c-lab' }),
      ] },
      { key: 'labour', label: 'Labour', items: [
        item({ id: 'lab-1', memoryType: 'labour', summary: 'Tom 8h electrics', labourPerson: 'Tom', labourTask: 'electrics', labourHours: '8', costAmount: '35', costQualifier: 'per_hour', costCurrency: 'GBP', totalCostAmount: '280', budgetCategoryId: 'c-lab', happenedAt: '2026-07-10T12:00:00' }),
      ] },
    ],
    stillToCheck: { count: 0, items: [] },
  }
}

function budgetSummary(): BudgetSummaryResponse {
  return {
    jobId: JOB.id, generatedAt: '',
    categories: [
      { category: CAT_LABOUR, knownSpendAmount: '430', knownSpendCurrency: 'GBP', knownSpendLabel: '£430 known spend', budgetAmount: '1500', budgetCurrency: 'GBP', budgetLabel: '£1500 budget', remainingAmount: '1070', remainingLabel: '£1070 remaining', overBudget: false, rows: [LAB_ROW, HIST_ROW] },
      { category: CAT_TIMBER, knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, budgetAmount: '4000', budgetCurrency: 'GBP', budgetLabel: '£4000 budget', remainingAmount: '4000', remainingLabel: '£4000 remaining', overBudget: false, rows: [] },
    ],
    uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
    totals: { budgetAmount: '5500', budgetCurrency: 'GBP', knownSpendAmount: '430', knownSpendCurrency: 'GBP', remainingAmount: '5070', remainingLabel: '£5070 remaining', overBudget: false },
    labour: {
      knownSpendAmount: '280', knownSpendCurrency: 'GBP', knownSpendLabel: '£280 known spend',
      budgetCategory: CAT_LABOUR, budgetAmount: '1500', budgetCurrency: 'GBP', budgetLabel: '£1500 budget',
      remainingAmount: '1220', remainingLabel: '£1220 remaining', overBudget: false,
      rows: [LAB_ROW],
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMemoryView.mockResolvedValue(memoryView())
  mockGetBudgetSummary.mockResolvedValue(budgetSummary())
})

const onJobUpdated = vi.fn()
function renderWorkspace(job: Job = JOB) {
  return render(<CurrentJobWorkspace job={job} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} onJobUpdated={onJobUpdated} />)
}
function openTab(name: string) {
  const back = screen.queryByRole('button', { name: /job home/i })
  if (back) fireEvent.click(back)
  fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }))
}

describe('Labour tab — budget context from budgetSummary.labour', () => {
  it('shows labour cost, labour budget, and remaining', async () => {
    renderWorkspace()
    openTab('Labour')
    const money = await screen.findByRole('region', { name: 'Labour cost' })
    figure(money, 'Cost', '£280').toBeInTheDocument()
    figure(money, 'Budget', '£1500').toBeInTheDocument()
    figure(money, 'Left', '£1220').toBeInTheDocument()
  })

  it('without a labour budget, still shows cost and never implies it is excluded', async () => {
    const bs = budgetSummary()
    bs.labour = { ...bs.labour!, budgetCategory: null, budgetAmount: null, budgetCurrency: null, budgetLabel: null, remainingAmount: null, remainingLabel: null, overBudget: false }
    mockGetBudgetSummary.mockResolvedValue(bs)
    renderWorkspace()
    openTab('Labour')
    const money = await screen.findByRole('region', { name: 'Labour cost' })
    figure(money, 'Cost', '£280').toBeInTheDocument()
    // No budget set, yet the cost is still stated — that is the claim.
    expect(within(money).queryByText(/Budget/)).toBeNull()
  })

  it('labour add stays available from Labour and creates memoryType labour', async () => {
    const mockCreate = vi.mocked(api.createMemoryItem)
    mockCreate.mockResolvedValue(item({ id: 'new-lab', memoryType: 'labour', labourHours: '5' }))
    renderWorkspace()
    openTab('Labour')
    fireEvent.click(await screen.findByRole('button', { name: 'Add labour' }))
    const sheet = screen.getByRole('dialog', { name: 'Add labour' })
    fireEvent.change(within(sheet).getByRole('form', { name: 'Add labour' }).querySelector('input[name="labourHours"]')!, { target: { value: '5' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /^Save / }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(JOB.id, expect.objectContaining({ memoryType: 'labour', labourHours: '5' })))
  })
})

describe('Spend — labour entry point discouraged, historical spend safe', () => {
  it('generic Add spend does not offer the labour category', async () => {
    renderWorkspace()
    openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: 'Add spend' }))
    const sheet = screen.getByRole('dialog', { name: 'Add spend' })
    const options = Array.from(within(sheet).getByLabelText('Budget category').querySelectorAll('option')).map(o => o.textContent)
    expect(options).toContain('timber')
    expect(options).not.toContain('labour')
  })

  it('the Labour group has no add action and guides to the Labour tab', async () => {
    renderWorkspace()
    openTab('Spend')
    const group = await screen.findByRole('region', { name: /^labour spend$/i })
    expect(within(group).queryByRole('button', { name: /add/i })).toBeNull()
    // The standing "add labour on the Labour tab" guidance is gone entirely —
    // static prose the theme asks us to cut. The absence of an add action here
    // is what steers entry to the Labour tab now.
    // and no separate "budget category labour" card offering Add to labour
    expect(screen.queryByRole('region', { name: /budget category labour/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add to labour' })).toBeNull()
  })

  // Regression guard for the budget-before-spend fix (PR #51): moving the
  // Budget categories section out of the hasSpendContent ternary must not
  // introduce a second "+ Add budget category" control, and the Labour
  // category must still be presented only via the Labour group — never as
  // an additional ordinary "Budget category Labour" card alongside it.
  it('with spend and a Labour category both present, there is exactly one Add-category control and no duplicate Labour card', async () => {
    renderWorkspace()
    openTab('Spend')
    await screen.findByRole('region', { name: /^labour spend$/i })

    expect(screen.getAllByRole('button', { name: /add budget category/i })).toHaveLength(1)
    // the ordinary "timber" category still renders as its own card…
    expect(screen.getByRole('region', { name: /budget category timber/i })).toBeInTheDocument()
    // …but Labour never renders as a second, duplicate ordinary category card
    expect(screen.queryByRole('region', { name: /budget category labour/i })).toBeNull()
    expect(screen.getAllByRole('heading', { name: 'Labour', level: 3 })).toHaveLength(1)
  })

  // Bug report: the Spend tab's "⋯" menu on the Labour group sometimes
  // appeared and sometimes didn't for what should be the same state. Root
  // cause: budgetSummary.labour.budgetCategory can come back null from the
  // backend even though an active "Labour" category genuinely exists in
  // budgetSummary.categories — the frontend's `??` fallback only covers a
  // wholly-missing `labour` object, not a present-but-incomplete one, so it
  // trusted the null. useJobMemory now reconciles budgetCategory against
  // categories whenever the backend didn't attach one.
  it('shows the ⋯ menu on the Labour group even when the backend labour summary omits budgetCategory', async () => {
    mockGetBudgetSummary.mockResolvedValue({ ...budgetSummary(), labour: { ...budgetSummary().labour!, budgetCategory: null } })
    renderWorkspace()
    openTab('Spend')
    const group = await screen.findByRole('region', { name: /^labour spend$/i })
    expect(within(group).getByRole('button', { name: /actions for labour/i })).toBeInTheDocument()
  })

  it('historical non-labour Labour-category spend is visible once, with Fix memory', async () => {
    renderWorkspace()
    openTab('Spend')
    const group = await screen.findByRole('region', { name: /^labour spend$/i })
    const hist = within(group).getByRole('group', { name: /existing spend in the labour category/i })
    expect(within(hist).getByText('agency invoice')).toBeInTheDocument()
    // The "why is this here" explanation is gone; the heading and the rows'
    // own Fix memory action carry it.
    expect(within(hist).getByRole('button', { name: /fix memory/i })).toBeInTheDocument()
    // shown exactly once across the whole Spend tab
    expect(screen.getAllByText('agency invoice')).toHaveLength(1)
    // and the proper labour row is not in it
    expect(within(hist).queryByText(/electrics/)).toBeNull()
  })

  it('category cards show the full trio: spent, budget, and remaining', async () => {
    renderWorkspace()
    openTab('Spend')
    const timber = await screen.findByRole('region', { name: /budget category timber/i })
    figure(timber, 'Budget', '£4000').toBeInTheDocument()
    figure(timber, 'Left', '£4000').toBeInTheDocument()
    const labour = screen.getByRole('region', { name: /^labour spend$/i })
    figure(labour, 'Spent', '£280').toBeInTheDocument()
    figure(labour, 'Budget', '£1500').toBeInTheDocument()
    figure(labour, 'Left', '£1220').toBeInTheDocument()
  })
})

describe('Job title editing', () => {
  it('rename success updates the header and notifies the app to refresh caches', async () => {
    mockPatchJob.mockResolvedValue({ ...JOB, title: 'Patel Garden Room' })
    const { rerender } = renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /rename job/i }))
    const input = screen.getByLabelText('Job title') as HTMLInputElement
    expect(input.value).toBe('Garden Room')
    fireEvent.change(input, { target: { value: '  Patel Garden Room  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockPatchJob).toHaveBeenCalledWith(JOB.id, { title: 'Patel Garden Room' }))
    expect(onJobUpdated).toHaveBeenCalledWith(expect.objectContaining({ title: 'Patel Garden Room' }))
    // the app re-renders with the updated job — header shows the new title
    rerender(<CurrentJobWorkspace job={{ ...JOB, title: 'Patel Garden Room' }} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} onJobUpdated={onJobUpdated} />)
    expect(screen.getByRole('heading', { name: 'Patel Garden Room' })).toBeInTheDocument()
  })

  it('rename failure keeps the old title and shows a retryable error', async () => {
    mockPatchJob.mockRejectedValue(new Error('boom'))
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /rename job/i }))
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'New name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not rename/i)
    expect(onJobUpdated).not.toHaveBeenCalled()
    // cancel restores the untouched title
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Garden Room' })).toBeInTheDocument()
  })

  it('blank titles cannot be submitted', async () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /rename job/i }))
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(mockPatchJob).not.toHaveBeenCalled()
  })
})

describe('Saved voice notes show date and time', () => {
  it('formatSavedStamp gives today/date + time', () => {
    const now = new Date('2026-07-10T15:00:00')
    expect(formatSavedStamp('2026-07-10T08:41:00', now)).toBe('today, 08:41')
    expect(formatSavedStamp('2026-07-08T08:41:00', now)).toBe('8 Jul, 08:41')
    expect(formatSavedStamp('2025-12-31T08:41:00', now)).toBe('31 Dec 2025, 08:41')
  })

  it('the source history note shows Saved with date and time, not time only', () => {
    const note = makeNote({ capturedAt: '2026-07-08T08:41:00', localState: 'uploaded' })
    render(
      <SourceHistory notes={[note]} online facts={[]} factsLoadFailed={false} onRetry={vi.fn()} onRefresh={vi.fn()} open onToggle={vi.fn()} />,
    )
    expect(screen.getByText('Saved 8 Jul, 08:41')).toBeInTheDocument()
  })
})

// ── One user-facing Labour concept: set/edit the Labour budget without Mike
//    knowing whether a manual Labour category exists ─────────────────────────

describe('Labour budget — one concept, set/edit from Labour', () => {
  const mockCreateCategory = vi.mocked(api.createBudgetCategory)
  const mockPatchCategory = vi.mocked(api.patchBudgetCategory)

  it('with no Labour category, Set Labour budget creates a category named Labour on save', async () => {
    const noCat = budgetSummary()
    noCat.categories = [noCat.categories[1]] // timber only
    noCat.labour = { ...noCat.labour!, budgetCategory: null, budgetAmount: null, budgetCurrency: null, budgetLabel: null, remainingAmount: null, remainingLabel: null, overBudget: false }
    const withCat = budgetSummary()
    mockGetBudgetSummary.mockResolvedValueOnce(noCat).mockResolvedValue(withCat)
    mockCreateCategory.mockResolvedValue(CAT_LABOUR)

    renderWorkspace()
    openTab('Labour')
    const money = await screen.findByRole('region', { name: 'Labour cost' })
    fireEvent.click(within(money).getByRole('button', { name: 'Set Labour budget' }))
    fireEvent.change(within(money).getByLabelText('Labour budget (£)'), { target: { value: '1500' } })
    fireEvent.click(within(money).getByRole('button', { name: 'Save budget' }))

    await waitFor(() => expect(mockCreateCategory).toHaveBeenCalledWith(JOB.id, { name: 'Labour', budgetAmount: '1500' }))
    // the refetched authoritative summary now shows the Labour budget
    const budget = await figureAsync(money, 'Budget', '£1500')
    budget.toBeInTheDocument()
    figure(money, 'Left', '£1220').toBeInTheDocument()
  })

  it('with a Labour category, Edit Labour budget patches the existing category', async () => {
    mockPatchCategory.mockResolvedValue({ ...CAT_LABOUR, budgetAmount: '2000' })
    renderWorkspace()
    openTab('Labour')
    const money = await screen.findByRole('region', { name: 'Labour cost' })
    fireEvent.click(within(money).getByRole('button', { name: 'Edit Labour budget' }))
    const input = within(money).getByLabelText('Labour budget (£)') as HTMLInputElement
    expect(input.value).toBe('1500') // prefilled from the existing category
    fireEvent.change(input, { target: { value: '2000' } })
    fireEvent.click(within(money).getByRole('button', { name: 'Save budget' }))
    await waitFor(() => expect(mockPatchCategory).toHaveBeenCalledWith(JOB.id, 'c-lab', { name: 'labour', budgetAmount: '2000' }))
    expect(mockCreateCategory).not.toHaveBeenCalled()
  })

  // Bug report: the "⋯" trigger changed shape depending on whether a Labour
  // budget existed (button vs menu), which read as flaky/inconsistent UX.
  // The "⋯" is now always the entry point; only the menu contents adapt.
  it('the Spend Labour group always uses the ⋯ trigger, offering "Set budget" when no category exists yet', async () => {
    const noCat = budgetSummary()
    noCat.categories = [noCat.categories[1]]
    noCat.labour = { ...noCat.labour!, budgetCategory: null, budgetAmount: null, budgetCurrency: null, budgetLabel: null, remainingAmount: null, remainingLabel: null, overBudget: false }
    mockGetBudgetSummary.mockResolvedValue(noCat)
    renderWorkspace()
    openTab('Spend')
    const group = await screen.findByRole('region', { name: /^labour spend$/i })

    // no standalone "Set Labour budget" button — only the ⋯ trigger
    expect(within(group).queryByRole('button', { name: /set labour budget/i })).toBeNull()
    const menuBtn = within(group).getByRole('button', { name: /actions for labour/i })
    fireEvent.click(menuBtn)
    fireEvent.click(within(group).getByRole('menuitem', { name: 'Set budget' }))
    expect(within(group).getByLabelText('Labour budget (£)')).toBeInTheDocument()

    // exactly one Labour bucket on the page
    expect(screen.queryByRole('region', { name: /budget category labour/i })).toBeNull()
  })

  it('the Spend Labour group ⋯ trigger stays in place once a category exists, with Edit/Remove budget', async () => {
    renderWorkspace()
    openTab('Spend')
    const group = await screen.findByRole('region', { name: /^labour spend$/i })
    const menuBtn = within(group).getByRole('button', { name: /actions for labour/i })
    fireEvent.click(menuBtn)
    expect(within(group).getByRole('menuitem', { name: /edit budget/i })).toBeInTheDocument()
    expect(within(group).getByRole('menuitem', { name: /remove budget/i })).toBeInTheDocument()
    expect(within(group).queryByRole('menuitem', { name: /^set budget$/i })).toBeNull()
  })
})
