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
  }
})
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockCreateMemoryItem = vi.mocked(api.createMemoryItem)

const JOB: Job = {
  id: 'job-da-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'active', createdAt: '', updatedAt: '',
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
async function openTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }))
  // let the tab's memory content settle
  await screen.findByRole('tabpanel')
}

describe('Direct add — entry points', () => {
  it('each lens shows its own direct add action', async () => {
    renderWorkspace()
    await openTab('Spend')
    expect(await screen.findByRole('button', { name: '+ Add spend' })).toBeInTheDocument()
    await openTab('Labour')
    expect(await screen.findByRole('button', { name: '+ Add labour' })).toBeInTheDocument()
    await openTab('Used')
    expect(await screen.findByRole('button', { name: '+ Add used item' })).toBeInTheDocument()
    await openTab('Notes')
    expect(await screen.findByRole('button', { name: '+ Add note' })).toBeInTheDocument()
  })

  it('keeps the pinned Record action available with a form open', async () => {
    renderWorkspace()
    await openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: '+ Add spend' }))
    expect(screen.getByRole('form', { name: 'Add spend' })).toBeInTheDocument()
    // The pinned Record bar stays mounted while a direct-add form is open.
    expect(document.querySelector('.ws-record-bar')).toBeTruthy()
  })
})

describe('Direct add — submit contracts', () => {
  it('spend saves as ordered_material with a GBP cost and refetches budget', async () => {
    renderWorkspace()
    await openTab('Spend')
    fireEvent.click(await screen.findByRole('button', { name: '+ Add spend' }))
    const form = screen.getByRole('form', { name: 'Add spend' })
    fireEvent.change(form.querySelector('input[name="materialName"]')!, { target: { value: 'decking' } })
    fireEvent.change(form.querySelector('input[name="costAmount"]')!, { target: { value: '120' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
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
    fireEvent.click(await screen.findByRole('button', { name: '+ Add labour' }))
    const form = screen.getByRole('form', { name: 'Add labour' })
    fireEvent.change(form.querySelector('input[name="labourHours"]')!, { target: { value: '8' } })
    fireEvent.change(form.querySelector('input[name="labourPerson"]')!, { target: { value: 'Tom' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'labour', labourHours: '8', labourPerson: 'Tom', happenedAt: expect.stringContaining('T12:00:00'),
    })))
  })

  it('used saves as used_material and appears in Used', async () => {
    renderWorkspace()
    await openTab('Used')
    fireEvent.click(await screen.findByRole('button', { name: '+ Add used item' }))
    const form = screen.getByRole('form', { name: 'Add used item' })
    fireEvent.change(form.querySelector('input[name="materialName"]')!, { target: { value: 'OSB' } })
    fireEvent.change(form.querySelector('input[name="quantity"]')!, { target: { value: '6' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'used_material', materialName: 'OSB', quantity: '6',
    })))
    expect(await screen.findByText('OSB')).toBeInTheDocument()
  })

  it('note defaults to general_note and appears in Notes', async () => {
    renderWorkspace()
    await openTab('Notes')
    fireEvent.click(await screen.findByRole('button', { name: '+ Add note' }))
    const form = screen.getByRole('form', { name: 'Add note' })
    fireEvent.change(form.querySelector('textarea[name="summary"]')!, { target: { value: 'Cladding going black' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockCreateMemoryItem).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      memoryType: 'general_note', summary: 'Cladding going black',
    })))
    expect(await screen.findByText('Cladding going black')).toBeInTheDocument()
  })
})

describe('Direct add — failure and edit', () => {
  it('keeps entered values and shows an error when the save fails', async () => {
    mockCreateMemoryItem.mockRejectedValue(new Error('network'))
    renderWorkspace()
    await openTab('Notes')
    fireEvent.click(await screen.findByRole('button', { name: '+ Add note' }))
    const form = screen.getByRole('form', { name: 'Add note' })
    fireEvent.change(form.querySelector('textarea[name="summary"]')!, { target: { value: 'keep me' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    // form still open with the value preserved
    expect((screen.getByRole('form', { name: 'Add note' }).querySelector('textarea[name="summary"]') as HTMLTextAreaElement).value).toBe('keep me')
  })

  it('a direct entry is editable with the existing Fix memory flow', async () => {
    renderWorkspace()
    await openTab('Notes')
    fireEvent.click(await screen.findByRole('button', { name: '+ Add note' }))
    const form = screen.getByRole('form', { name: 'Add note' })
    fireEvent.change(form.querySelector('textarea[name="summary"]')!, { target: { value: 'fix me later' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    await screen.findByText('fix me later')
    // one direct note → one Fix memory button; opening it shows the edit form
    fireEvent.click(screen.getByRole('button', { name: /fix memory/i }))
    expect(screen.getByRole('form', { name: /edit memory/i })).toBeInTheDocument()
  })
})
