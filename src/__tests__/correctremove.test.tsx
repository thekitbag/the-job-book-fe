import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import { MEMORY_TYPE_TO_SECTION_KEY, SECTION_FULL_LABELS } from '../memoryScan'
import { openRowActions } from './helpers'
import type { Job, MemoryViewItem, MemoryViewResponse, BudgetSummaryResponse } from '../types'

// Correct/remove confirmed job items: item-level Remove with confirmation,
// Used ↔ Left over moves, spend dates, and authoritative refetch after every
// mutation. The stateful in-memory view mirrors the backend: removal hides the
// item from active sections; totals recalculate from active items only.

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    updateMemoryItem: vi.fn(),
    removeMemoryItem: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-cr-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-cr-001', photos: [] })),
    getJobPayments: vi.fn(() => Promise.resolve({
      jobId: 'job-cr-001', generatedAt: '',
      customerTotalAmount: null, customerTotalCurrency: null, customerTotalLabel: null,
      totalPaidAmount: null, totalPaidCurrency: null, totalPaidLabel: null,
      stillOwedAmount: null, stillOwedCurrency: null, stillOwedLabel: null,
      overpaid: false, overpaidAmount: null, overpaidLabel: null, payments: [],
    })),
  }
})
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))
vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  getSupportedMimeType: () => 'audio/webm',
  useRecorder: () => ({ state: 'idle', elapsedMs: 0, mimeType: 'audio/webm', permissionError: null, start: vi.fn(), stop: vi.fn() }),
}))

const JOB: Job = {
  id: 'job-cr-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '',
}

const EMPTY_BUDGET: BudgetSummaryResponse = {
  jobId: JOB.id, generatedAt: '', categories: [],
  uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
  totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: null, knownSpendCurrency: null, remainingAmount: null, remainingLabel: null, overBudget: false },
}

function memItem(overrides: Partial<MemoryViewItem>): MemoryViewItem {
  return {
    id: 'mem-x', memoryType: 'ordered_material', summary: '',
    materialName: null, quantity: null, unit: null, supplierName: null,
    deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    labourHours: null, labourPerson: null, labourTask: null,
    uncertaintyFlags: [], budgetCategoryId: null, happenedAt: null,
    sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '2026-07-01T09:00:00.000Z', updatedAt: '', source: null,
    ...overrides,
  }
}

// Stateful view: remove/move mutate it; getMemoryView reads it back so the
// workspace adopts authoritative state after refetch (like the real backend).
let view: MemoryViewResponse

function buildView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      {
        key: 'ordered_materials', label: 'Ordered materials',
        items: [memItem({
          id: 'buy-1', summary: 'plasterboard', materialName: 'plasterboard',
          totalCostAmount: '600', costCurrency: 'GBP',
          happenedAt: '2026-07-08T12:00:00.000Z',
          source: { candidateFactId: 'f1', noteId: 'n1', transcriptId: 't1', capturedAt: '2026-07-08T09:00:00.000Z', transcriptText: 'bought plasterboard' },
        })],
      },
      { key: 'used_materials', label: 'Used materials', items: [memItem({ id: 'used-1', memoryType: 'used_material', summary: 'OSB', materialName: 'OSB' })] },
      { key: 'leftovers', label: 'Leftovers', items: [memItem({ id: 'left-1', memoryType: 'leftover_material', summary: 'sand', materialName: 'sand' })] },
      { key: 'general_notes', label: 'Notes', items: [memItem({ id: 'note-1', memoryType: 'general_note', summary: 'Customer wants extra spots', source: { candidateFactId: 'f2', noteId: 'n2', transcriptId: 't2', capturedAt: '2026-07-09T09:00:00.000Z', transcriptText: 'extra spots' } })] },
    ],
    stillToCheck: { count: 0, items: [] },
    costSummary: undefined, // frontend derives from sections → removal moves totals
  }
}

function removeFromView(id: string) {
  for (const s of view.sections) s.items = s.items.filter(it => it.id !== id)
}

function moveInView(id: string, type: MemoryViewItem['memoryType']) {
  let found: MemoryViewItem | undefined
  for (const s of view.sections) {
    found = found ?? s.items.find(it => it.id === id)
    s.items = s.items.filter(it => it.id !== id)
  }
  if (!found) return
  const updated = { ...found, memoryType: type }
  const key = MEMORY_TYPE_TO_SECTION_KEY[type]
  let section = view.sections.find(s => s.key === key)
  if (!section) { section = { key, label: SECTION_FULL_LABELS[key] ?? key, items: [] }; view.sections.push(section) }
  section.items.unshift(updated)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  view = buildView()
  vi.mocked(api.getMemoryView).mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(view))))
  vi.mocked(api.getBudgetSummary).mockResolvedValue(EMPTY_BUDGET)
  vi.mocked(api.removeMemoryItem).mockImplementation((_jobId, id) => { removeFromView(id); return Promise.resolve() })
  vi.mocked(api.updateMemoryItem).mockImplementation((_jobId, id, edit) => {
    moveInView(id, edit.memoryType)
    return Promise.resolve(memItem({ id, memoryType: edit.memoryType }))
  })
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}

function goHomeIfNeeded() {
  const back = screen.queryByRole('button', { name: /job home/i })
  if (back) fireEvent.click(back)
}
async function openSection(name: string, innerTab?: string) {
  goHomeIfNeeded()
  fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }))
  if (innerTab) fireEvent.click(screen.getByRole('tab', { name: innerTab }))
  await screen.findByRole('tabpanel')
}

const card = (text: string) => {
  const el = screen.getByText(text).closest('.mem-card') as HTMLElement
  expect(el).toBeTruthy()
  return el
}

// ── Spend dates ───────────────────────────────────────────────────────────────

describe('Correct/remove — spend item dates', () => {
  it('shows the happenedAt date on a spend item', async () => {
    await renderWorkspace()
    await openSection('Materials')
    await screen.findByText('plasterboard')
    expect(within(card('plasterboard')).getByText('8 Jul')).toBeInTheDocument()
  })

  it('falls back to the source capturedAt when happenedAt is missing', async () => {
    view.sections[0].items[0].happenedAt = null
    renderWorkspace()
    await openSection('Materials')
    await screen.findByText('plasterboard')
    expect(within(card('plasterboard')).getByText('8 Jul')).toBeInTheDocument()
  })

  it('falls back to createdAt when there is no happenedAt or source', async () => {
    view.sections[0].items[0].happenedAt = null
    view.sections[0].items[0].source = null
    renderWorkspace()
    await openSection('Materials')
    await screen.findByText('plasterboard')
    expect(within(card('plasterboard')).getByText('1 Jul')).toBeInTheDocument()
  })
})

// ── Remove ────────────────────────────────────────────────────────────────────

describe('Correct/remove — remove confirmed items', () => {
  it('removing a spend item needs confirmation, explains known spend + kept source, then updates totals', async () => {
    renderWorkspace()
    await openSection('Budget')
    // seeded spend total (600) visible before removal
    await screen.findByText(/£600/)
    await openSection('Materials')
    await screen.findByText('plasterboard')
    fireEvent.click(openRowActions(card('plasterboard')).getByRole('button', { name: 'Remove item' }))
    expect(api.removeMemoryItem).not.toHaveBeenCalled()
    const confirm = within(card('plasterboard'))
    expect(confirm.getByText(/remove this item\?/i)).toBeInTheDocument()
    expect(confirm.getByText(/no longer count towards budget/i)).toBeInTheDocument()
    expect(confirm.getByText(/original voice note will be kept/i)).toBeInTheDocument()
    fireEvent.click(confirm.getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(api.removeMemoryItem).toHaveBeenCalledWith(JOB.id, 'buy-1'))
    await waitFor(() => expect(screen.queryByText('plasterboard')).not.toBeInTheDocument())
    // budget refetched because spend totals changed
    expect(vi.mocked(api.getBudgetSummary).mock.calls.length).toBeGreaterThan(1)
  })

  it('cancelling the confirmation removes nothing', async () => {
    renderWorkspace()
    await openSection('Materials')
    await screen.findByText('plasterboard')
    fireEvent.click(openRowActions(card('plasterboard')).getByRole('button', { name: 'Remove item' }))
    fireEvent.click(within(card('plasterboard')).getByRole('button', { name: /cancel/i }))
    expect(api.removeMemoryItem).not.toHaveBeenCalled()
    expect(screen.getByText('plasterboard')).toBeInTheDocument()
  })

  it('removes a Used item', async () => {
    renderWorkspace()
    await openSection('Materials', 'Used')
    await screen.findByText('OSB')
    fireEvent.click(openRowActions(card('OSB')).getByRole('button', { name: 'Remove item' }))
    fireEvent.click(within(card('OSB')).getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(api.removeMemoryItem).toHaveBeenCalledWith(JOB.id, 'used-1'))
    await waitFor(() => expect(screen.queryByText('OSB')).not.toBeInTheDocument())
  })

  it('removes a Left over item', async () => {
    renderWorkspace()
    await openSection('Materials', 'Left over')
    await screen.findByText('sand')
    fireEvent.click(openRowActions(card('sand')).getByRole('button', { name: 'Remove item' }))
    fireEvent.click(within(card('sand')).getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(api.removeMemoryItem).toHaveBeenCalledWith(JOB.id, 'left-1'))
    await waitFor(() => expect(screen.queryByText('sand')).not.toBeInTheDocument())
  })

  it('removes a Job log note item with note-specific copy', async () => {
    renderWorkspace()
    await openSection('Job log', 'Notes')
    await screen.findByText('Customer wants extra spots')
    const noteCard = card('Customer wants extra spots')
    fireEvent.click(openRowActions(noteCard).getByRole('button', { name: 'Remove item' }))
    expect(within(noteCard).getByText(/removed from the job log/i)).toBeInTheDocument()
    expect(within(noteCard).getByText(/original voice note will be kept/i)).toBeInTheDocument()
    fireEvent.click(within(noteCard).getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(api.removeMemoryItem).toHaveBeenCalledWith(JOB.id, 'note-1'))
    await waitFor(() => expect(screen.queryByText('Customer wants extra spots')).not.toBeInTheDocument())
  })

  // Correcting the record is admin; capture is the product. Removing an item
  // must never cost Mike the Record button.
  it('leaves Record visible and usable after a removal', async () => {
    renderWorkspace()
    await openSection('Materials', 'Used')
    await screen.findByText('OSB')
    fireEvent.click(openRowActions(card('OSB')).getByRole('button', { name: 'Remove item' }))
    fireEvent.click(within(card('OSB')).getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(screen.queryByText('OSB')).not.toBeInTheDocument())
    goHomeIfNeeded()
    const record = screen.getByRole('button', { name: /record/i })
    expect(record).toBeInTheDocument()
    expect(record).toBeEnabled()
  })

  it('a failed removal keeps the item visible with retryable copy', async () => {
    vi.mocked(api.removeMemoryItem).mockRejectedValue(new Error('boom'))
    renderWorkspace()
    await openSection('Materials', 'Used')
    await screen.findByText('OSB')
    fireEvent.click(openRowActions(card('OSB')).getByRole('button', { name: 'Remove item' }))
    fireEvent.click(within(card('OSB')).getByRole('button', { name: /^remove$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not remove/i)
    expect(screen.getByText('OSB')).toBeInTheDocument()
  })
})

// ── Move ──────────────────────────────────────────────────────────────────────

describe('Correct/remove — move Used ↔ Left over', () => {
  it('moves a Used item to Left over and it appears only in the target after refetch', async () => {
    renderWorkspace()
    await openSection('Materials', 'Used')
    await screen.findByText('OSB')
    fireEvent.click(openRowActions(card('OSB')).getByRole('button', { name: /move to left over/i }))
    await waitFor(() => expect(api.updateMemoryItem).toHaveBeenCalledWith(
      JOB.id, 'used-1', expect.objectContaining({ memoryType: 'leftover_material' })))
    await waitFor(() => expect(screen.queryByText('OSB')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: 'Left over' }))
    expect(await screen.findByText('OSB')).toBeInTheDocument()
  })

  it('moves a Left over item to Used', async () => {
    renderWorkspace()
    await openSection('Materials', 'Left over')
    await screen.findByText('sand')
    fireEvent.click(openRowActions(card('sand')).getByRole('button', { name: /move to used/i }))
    await waitFor(() => expect(api.updateMemoryItem).toHaveBeenCalledWith(
      JOB.id, 'left-1', expect.objectContaining({ memoryType: 'used_material' })))
    await waitFor(() => expect(screen.queryByText('sand')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: 'Used' }))
    expect(await screen.findByText('sand')).toBeInTheDocument()
  })

  it('spend and note items offer no move action', async () => {
    renderWorkspace()
    await openSection('Materials')
    await screen.findByText('plasterboard')
    expect(within(card('plasterboard')).queryByRole('button', { name: /move to/i })).not.toBeInTheDocument()
    await openSection('Job log', 'Notes')
    await screen.findByText('Customer wants extra spots')
    expect(within(card('Customer wants extra spots')).queryByRole('button', { name: /move to/i })).not.toBeInTheDocument()
  })
})
