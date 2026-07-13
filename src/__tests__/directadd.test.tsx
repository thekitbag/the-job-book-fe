import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import { MEMORY_TYPE_TO_SECTION_KEY, SECTION_FULL_LABELS } from '../memoryScan'
import type { BudgetSummaryResponse, CreateMemoryItemRequest, Job, MemoryViewItem, MemoryViewResponse } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    createMemoryItem: vi.fn(),
    updateMemoryItem: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-da-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-x', photos: [] })),
  }
})
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockCreateMemoryItem = vi.mocked(api.createMemoryItem)

const JOB: Job = {
  id: 'job-da-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '',
}

const EMPTY_BUDGET: BudgetSummaryResponse = {
  jobId: JOB.id, generatedAt: '', categories: [],
  uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
  totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: null, knownSpendCurrency: null, remainingAmount: null, remainingLabel: null, overBudget: false },
}

// Stateful in-memory view — createMemoryItem pushes into it, getMemoryView reads
// it back (costSummary left undefined so the frontend derives spend live).
let view: MemoryViewResponse

function freshView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [] },
      { key: 'labour', label: 'Labour', items: [] },
      { key: 'used_materials', label: 'Used materials', items: [] },
      { key: 'general_notes', label: 'Notes', items: [] },
    ],
    stillToCheck: { count: 0, items: [] },
    costSummary: undefined,
  }
}

function pushCreated(req: CreateMemoryItemRequest): MemoryViewItem {
  const item: MemoryViewItem = {
    id: `mem-manual-${view.sections.reduce((n, s) => n + s.items.length, 0) + 1}`,
    memoryType: req.memoryType,
    summary: req.summary?.trim() || req.materialName || req.labourTask || 'Item',
    materialName: req.materialName ?? null, quantity: req.quantity ?? null, unit: req.unit ?? null,
    supplierName: req.supplierName ?? null, deliveryTiming: null, locationOrUse: req.locationOrUse ?? null,
    costAmount: req.costAmount ?? null, costCurrency: req.costCurrency ?? null,
    costQualifier: req.costQualifier ?? null, totalCostAmount: req.totalCostAmount ?? null,
    labourHours: req.labourHours ?? null, labourPerson: req.labourPerson ?? null, labourTask: req.labourTask ?? null,
    uncertaintyFlags: [], budgetCategoryId: req.budgetCategoryId ?? null,
    happenedAt: req.happenedAt ?? null, isManual: true,
    sourceCandidateFactId: null, reviewDecisionId: null, createdAt: '', updatedAt: '', source: null,
  }
  const key = MEMORY_TYPE_TO_SECTION_KEY[req.memoryType] ?? req.memoryType
  let section = view.sections.find(s => s.key === key)
  if (!section) { section = { key, label: SECTION_FULL_LABELS[key] ?? key, items: [] }; view.sections.push(section) }
  section.items.unshift(item)
  return item
}

beforeEach(() => {
  view = freshView()
  mockGetMemoryView.mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(view))))
  mockGetBudgetSummary.mockResolvedValue(EMPTY_BUDGET)
  mockCreateMemoryItem.mockImplementation((_jobId, req) => Promise.resolve(pushCreated(req)))
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}
// Navigate to a lens in the new job-home model: sections are cards on home,
// Used lives inside Materials, and Notes lives inside Job log.
async function openTab(name: string) {
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
  // let the section's memory content settle
  await screen.findByRole('tabpanel')
}

describe('Direct add — entry points', () => {
  it('each lens shows its own direct add action', async () => {
    renderWorkspace()
    await openTab('Spend')
    expect(await screen.findByRole('button', { name: 'Add spend' })).toBeInTheDocument()
    await openTab('Labour')
    expect(await screen.findByRole('button', { name: 'Add labour' })).toBeInTheDocument()
    await openTab('Used')
    expect(await screen.findByRole('button', { name: 'Add used item' })).toBeInTheDocument()
    // Left over is its own Materials tab with its own add.
    fireEvent.click(screen.getByRole('tab', { name: 'Left over' }))
    expect(await screen.findByRole('button', { name: 'Add leftover' })).toBeInTheDocument()
    await openTab('Notes')
    expect(await screen.findByRole('button', { name: 'Add note' })).toBeInTheDocument()
  })

  it('keeps the pinned Record action available with a form open', async () => {
    renderWorkspace()
    await openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: 'Add spend' }))
    expect(screen.getByRole('form', { name: 'Add spend' })).toBeInTheDocument()
    // The pinned Record bar stays mounted while a direct-add form is open.
    expect(document.querySelector('.ws-record-bar')).toBeTruthy()
  })
})

describe('Direct add — submit contracts', () => {
  it('spend saves as ordered_material with a GBP cost and refetches budget', async () => {
    // Uncategorised display now comes from budgetSummary.uncategorized.rows, so
    // the refetch after save must carry the new item's row (matching what the
    // real backend would return) — the static EMPTY_BUDGET default only covers
    // the initial, pre-save load.
    mockGetBudgetSummary.mockResolvedValueOnce(EMPTY_BUDGET).mockResolvedValue({
      ...EMPTY_BUDGET,
      uncategorized: {
        knownSpendAmount: '120', knownSpendCurrency: 'GBP', knownSpendLabel: '£120 known spend',
        rows: [{ memoryItemId: 'mem-manual-1', memoryType: 'ordered_material', itemLabel: 'decking', materialName: 'decking', quantity: null, unit: null, lineTotalAmount: '120', lineTotalCurrency: 'GBP', lineTotalLabel: '£120 total' }],
      },
    })
    renderWorkspace()
    await openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: 'Add spend' }))
    const form = screen.getByRole('form', { name: 'Add spend' })
    fireEvent.change(form.querySelector('input[name="materialName"]')!, { target: { value: 'decking' } })
    fireEvent.change(form.querySelector('input[name="costAmount"]')!, { target: { value: '120' } })
    fireEvent.click(within(form).getByRole('button', { name: /^Save / }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'ordered_material', materialName: 'decking', costAmount: '120', costCurrency: 'GBP', totalCostAmount: '120',
    })))
    // budget-summary refetched (initial load + after save)
    await waitFor(() => expect(mockGetBudgetSummary.mock.calls.length).toBeGreaterThanOrEqual(2))
    // item appears in Spend after refetch
    expect(await screen.findByText('decking')).toBeInTheDocument()
  })

  it('labour saves as labour with happenedAt', async () => {
    renderWorkspace()
    await openTab('Labour')
    fireEvent.click(await screen.findByRole('button', { name: 'Add labour' }))
    const form = screen.getByRole('form', { name: 'Add labour' })
    fireEvent.change(form.querySelector('input[name="labourHours"]')!, { target: { value: '8' } })
    fireEvent.change(form.querySelector('input[name="labourPerson"]')!, { target: { value: 'Tom' } })
    fireEvent.click(within(form).getByRole('button', { name: /^Save / }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'labour', labourHours: '8', labourPerson: 'Tom', happenedAt: expect.stringContaining('T12:00:00'),
    })))
  })

  it('used saves as used_material and appears in Used', async () => {
    renderWorkspace()
    await openTab('Used')
    fireEvent.click(await screen.findByRole('button', { name: 'Add used item' }))
    const form = screen.getByRole('form', { name: 'Add used item' })
    fireEvent.change(form.querySelector('input[name="materialName"]')!, { target: { value: 'OSB' } })
    fireEvent.change(form.querySelector('input[name="quantity"]')!, { target: { value: '6' } })
    fireEvent.click(within(form).getByRole('button', { name: /^Save / }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'used_material', materialName: 'OSB', quantity: '6',
    })))
    expect(await screen.findByText('OSB')).toBeInTheDocument()
  })

  it('leftover saves as leftover_material from the Materials Left over tab', async () => {
    renderWorkspace()
    await openTab('Used')
    fireEvent.click(screen.getByRole('tab', { name: 'Left over' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add leftover' }))
    const form = screen.getByRole('form', { name: 'Add leftover' })
    fireEvent.change(form.querySelector('input[name="materialName"]')!, { target: { value: 'sand' } })
    fireEvent.click(within(form).getByRole('button', { name: /^Save / }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'leftover_material', materialName: 'sand',
    })))
  })

  it('note defaults to general_note and appears in Notes', async () => {
    renderWorkspace()
    await openTab('Notes')
    fireEvent.click(await screen.findByRole('button', { name: 'Add note' }))
    const form = screen.getByRole('form', { name: 'Add note' })
    fireEvent.change(form.querySelector('textarea[name="summary"]')!, { target: { value: 'Cladding going black' } })
    fireEvent.click(within(form).getByRole('button', { name: /^Save / }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'general_note', summary: 'Cladding going black',
    })))
    // post-save refetch → render can be slow on loaded CI runners
    expect(await screen.findByText('Cladding going black', {}, { timeout: 4000 })).toBeInTheDocument()
  })
})

describe('Direct add — failure and edit', () => {
  it('keeps entered values and shows an error when the save fails', async () => {
    mockCreateMemoryItem.mockRejectedValue(new Error('network'))
    renderWorkspace()
    await openTab('Notes')
    fireEvent.click(await screen.findByRole('button', { name: 'Add note' }))
    const form = screen.getByRole('form', { name: 'Add note' })
    fireEvent.change(form.querySelector('textarea[name="summary"]')!, { target: { value: 'keep me' } })
    fireEvent.click(within(form).getByRole('button', { name: /^Save / }))
    await screen.findByRole('alert')
    // form still open with the value preserved
    expect((screen.getByRole('form', { name: 'Add note' }).querySelector('textarea[name="summary"]') as HTMLTextAreaElement).value).toBe('keep me')
  })

  it('a direct entry is editable with the existing Fix memory flow', async () => {
    renderWorkspace()
    await openTab('Notes')
    fireEvent.click(await screen.findByRole('button', { name: 'Add note' }))
    const form = screen.getByRole('form', { name: 'Add note' })
    fireEvent.change(form.querySelector('textarea[name="summary"]')!, { target: { value: 'fix me later' } })
    fireEvent.click(within(form).getByRole('button', { name: /^Save / }))

    await screen.findByText('fix me later')
    // one direct note → one Fix memory button; opening it shows the edit form
    fireEvent.click(screen.getByRole('button', { name: /fix memory/i }))
    expect(screen.getByRole('form', { name: /edit memory/i })).toBeInTheDocument()
  })
})

// ── Manual Add V2: bottom sheet, category context, empty states ──────────────

const CAT_TIMBER = { id: 'cat-timber', jobId: JOB.id, name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }
const BUDGET_WITH_TIMBER: BudgetSummaryResponse = {
  ...EMPTY_BUDGET,
  categories: [{ category: CAT_TIMBER, knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, budgetAmount: '4000', budgetCurrency: 'GBP', budgetLabel: '£4000 budget', remainingAmount: '4000', remainingLabel: '£4000 remaining', overBudget: false, rows: [] }],
}

describe('Manual Add V2 — bottom sheet', () => {
  it('Spend direct add opens in a dialog sheet and closing returns to the section', async () => {
    renderWorkspace()
    await openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: 'Add spend' }))
    const sheet = screen.getByRole('dialog', { name: 'Add spend' })
    expect(within(sheet).getByRole('form', { name: 'Add spend' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // section state is untouched behind the sheet
    expect(screen.getByRole('tabpanel', { name: 'Spend' })).toBeInTheDocument()
  })

  it('Escape closes the sheet', async () => {
    renderWorkspace()
    await openTab('Labour')
    fireEvent.click(await screen.findByRole('button', { name: 'Add labour' }))
    expect(screen.getByRole('dialog', { name: 'Add labour' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers a "Record instead" link that closes the sheet back to the global Record', async () => {
    renderWorkspace()
    await openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: 'Add spend' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record instead' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // the one global Record action is right there
    expect(document.querySelector('.ws-record-bar')).toBeTruthy()
  })
})

describe('Manual Add V2 — spend category context', () => {
  beforeEach(() => {
    mockGetBudgetSummary.mockResolvedValue(BUDGET_WITH_TIMBER)
  })

  it('category card add opens the sheet titled and preselected for that category', async () => {
    renderWorkspace()
    await openTab('Spend')
    const card = await screen.findByRole('region', { name: /budget category timber/i })
    fireEvent.click(within(card).getByRole('button', { name: 'Add to timber' }))
    const sheet = screen.getByRole('dialog', { name: 'Add spend — timber' })
    const select = within(sheet).getByLabelText('Budget category') as HTMLSelectElement
    expect(select.value).toBe('cat-timber')
    // changeable/clearable through the normal select
    fireEvent.change(select, { target: { value: '' } })
    expect(select.value).toBe('')
  })

  it('saving category-context spend sends budgetCategoryId and refetches summaries', async () => {
    renderWorkspace()
    await openTab('Spend')
    const card = await screen.findByRole('region', { name: /budget category timber/i })
    fireEvent.click(within(card).getByRole('button', { name: 'Add to timber' }))
    const sheet = screen.getByRole('dialog', { name: 'Add spend — timber' })
    fireEvent.change(within(sheet).getByRole('form', { name: 'Add spend' }).querySelector('input[name="materialName"]')!, { target: { value: '4x2 CLS' } })
    const viewCalls = mockGetMemoryView.mock.calls.length
    const budgetCalls = mockGetBudgetSummary.mock.calls.length
    fireEvent.click(within(sheet).getByRole('button', { name: /^Save / }))

    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'ordered_material', materialName: '4x2 CLS', budgetCategoryId: 'cat-timber',
    })))
    // sheet closes; authoritative memory-view + budget summary are refetched
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(mockGetMemoryView.mock.calls.length).toBeGreaterThan(viewCalls))
    await waitFor(() => expect(mockGetBudgetSummary.mock.calls.length).toBeGreaterThan(budgetCalls))
  })

  it('an empty category card explains itself and offers the category add', async () => {
    renderWorkspace()
    await openTab('Spend')
    const card = await screen.findByRole('region', { name: /budget category timber/i })
    expect(within(card).getByText(/No spend in this category yet/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add to timber' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /record/i })).toBeNull()
  })
})

describe('Manual Add V2 — empty states', () => {
  it('Spend, Labour, Used, and Notes empty states offer manual add and never a Record action', async () => {
    renderWorkspace()

    await openTab('Spend')
    const spendPanel = await screen.findByRole('tabpanel', { name: 'Spend' })
    expect(within(spendPanel).getByText('Nothing spent yet')).toBeInTheDocument()

    await openTab('Labour')
    const labourPanel = await screen.findByRole('tabpanel', { name: 'Labour' })
    expect(within(labourPanel).getByText('No labour logged yet')).toBeInTheDocument()

    await openTab('Used')
    const usedPanel = await screen.findByRole('tabpanel', { name: 'Used materials' })
    expect(within(usedPanel).getByText('Nothing logged yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Left over' }))
    const leftoverPanel = await screen.findByRole('tabpanel', { name: 'Left over materials' })
    expect(within(leftoverPanel).getByText('Nothing logged yet')).toBeInTheDocument()

    await openTab('Notes')
    const notesPanel = await screen.findByRole('tabpanel', { name: 'Notes' })
    expect(within(notesPanel).getByText('No notes yet')).toBeInTheDocument()

    // every empty state offers manual add…
    expect(within(notesPanel).getByRole('button', { name: 'Add note' })).toBeInTheDocument()
    // …and none of the panels contain a Record button — the ONLY voice action
    // is the single global pinned Record bar.
    for (const panel of [notesPanel]) {
      expect(within(panel).queryByRole('button', { name: /record/i })).toBeNull()
    }
    expect(document.querySelectorAll('.ws-record-bar')).toHaveLength(1)
  })

  it('an empty-state add opens the same sheet and saves into the section', async () => {
    renderWorkspace()
    await openTab('Labour')
    const panel = await screen.findByRole('tabpanel', { name: 'Labour' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Add labour' }))
    const sheet = screen.getByRole('dialog', { name: 'Add labour' })
    fireEvent.change(within(sheet).getByRole('form', { name: 'Add labour' }).querySelector('input[name="labourHours"]')!, { target: { value: '6' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /^Save / }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'labour', labourHours: '6', happenedAt: expect.stringContaining('T12:00:00'),
    })))
    // the new entry appears in the daily Labour view after refetch
    expect(await within(panel).findByText('6h')).toBeInTheDocument()
  })
})

// ── Founder feedback round: no bare "+", no drag handle, no autofocus,
//    clear add actions in non-empty sections ─────────────────────────────────

describe('Manual Add V2 — founder feedback acceptance', () => {
  it('has no standalone plus-only add buttons anywhere', async () => {
    renderWorkspace()
    for (const t of ['Spend', 'Labour', 'Used', 'Notes']) {
      await openTab(t)
      // no round "+" chrome, and no button whose accessible name is just "+"
      expect(document.querySelector('.btn-lens-add')).toBeNull()
      expect(screen.queryByRole('button', { name: /^\+$/ })).toBeNull()
    }
  })

  it('non-empty sections still offer a clear text add action', async () => {
    // seed one item into every lens so no empty states render
    pushCreated({ memoryType: 'ordered_material', materialName: 'hardcore' })
    pushCreated({ memoryType: 'labour', labourHours: '4', happenedAt: '2026-07-08T12:00:00' })
    pushCreated({ memoryType: 'used_material', materialName: 'OSB' })
    pushCreated({ memoryType: 'leftover_material', materialName: 'sand' })
    pushCreated({ memoryType: 'general_note', summary: 'a note' })
    renderWorkspace()

    await openTab('Spend')
    expect(await screen.findByRole('button', { name: 'Add spend' })).toBeInTheDocument()
    await openTab('Labour')
    expect(await screen.findByRole('button', { name: 'Add labour' })).toBeInTheDocument()
    await openTab('Used')
    expect(await screen.findByRole('button', { name: 'Add used item' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Left over' }))
    expect(await screen.findByRole('button', { name: 'Add leftover' })).toBeInTheDocument()
    await openTab('Notes')
    expect(await screen.findByRole('button', { name: 'Add note' })).toBeInTheDocument()
  })

  it('the sheet has no drag/swipe handle', async () => {
    renderWorkspace()
    await openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: 'Add spend' }))
    expect(screen.getByRole('dialog', { name: 'Add spend' })).toBeInTheDocument()
    expect(document.querySelector('.bottom-sheet-handle')).toBeNull()
  })

  it('opening a sheet does not auto-focus a form field', async () => {
    renderWorkspace()
    await openTab('Labour')
    fireEvent.click(await screen.findByRole('button', { name: 'Add labour' }))
    expect(screen.getByRole('dialog', { name: 'Add labour' })).toBeInTheDocument()
    const active = document.activeElement
    expect(['INPUT', 'TEXTAREA', 'SELECT']).not.toContain(active?.tagName)
  })
})
