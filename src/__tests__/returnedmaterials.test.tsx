import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import SupportModePage from '../SupportModePage'
import * as api from '../api'
import { ApiError } from '../api'
import type { AuthUser, BudgetSummaryResponse, Job, MemoryViewItem, MemoryViewResponse, ReturnMaterialRequest, SupportUser } from '../types'

// Returned materials: Returned is a real Materials state, not a delete. A
// return moves quantity out of Left over, leaves the original bought row
// alone, and a trusted refund reduces net known spend visibly.
//
// The stateful view below mirrors the backend's return transaction so the tests
// exercise what the workspace does with authoritative state after refetch —
// including refusing an over-return without mutating anything.

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    returnMemoryItem: vi.fn(),
    removeMemoryItem: vi.fn(),
    getCurrentUser: vi.fn(),
    getSupportUsers: vi.fn(),
    getSupportUserJobs: vi.fn(),
    getSupportMemoryView: vi.fn(),
    getSupportBudgetSummary: vi.fn(),
    getSupportReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-rm-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getSupportPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-rm-001', photos: [] })),
    getSupportJobInspection: vi.fn(() => Promise.reject(new Error('none'))),
    getSupportJobPayments: vi.fn(() => Promise.reject(new Error('none'))),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-rm-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-rm-001', photos: [] })),
    getJobPayments: vi.fn(() => Promise.reject(new Error('none'))),
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
  id: 'job-rm-001', title: 'Fencing job', jobType: 'other',
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
    refundAmount: null, refundCurrency: null, returnedFromMemoryItemId: null,
    labourHours: null, labourPerson: null, labourTask: null,
    uncertaintyFlags: [], budgetCategoryId: null, happenedAt: null,
    sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '2026-07-01T09:00:00.000Z', updatedAt: '', source: null,
    ...overrides,
  }
}

// £920 of trusted bought spend, and 6 fence posts left over from it.
let view: MemoryViewResponse

function buildView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      {
        key: 'ordered_materials', label: 'Ordered materials',
        items: [
          memItem({
            id: 'buy-posts', summary: 'fence posts', materialName: 'fence posts',
            quantity: '20', costAmount: '20', costQualifier: 'total', totalCostAmount: '400', costCurrency: 'GBP',
            happenedAt: '2026-07-02T12:00:00.000Z',
            source: { candidateFactId: 'f1', noteId: 'n1', transcriptId: 't1', capturedAt: '2026-07-02T09:00:00.000Z', transcriptText: 'twenty fence posts from Jewson' },
          }),
          memItem({
            id: 'buy-panels', summary: 'fence panels', materialName: 'fence panels',
            totalCostAmount: '520', costQualifier: 'total', costCurrency: 'GBP',
          }),
        ],
      },
      { key: 'used_materials', label: 'Used materials', items: [] },
      {
        key: 'leftovers', label: 'Leftovers',
        items: [memItem({
          id: 'left-posts', memoryType: 'leftover_material', summary: '6 fence posts left over',
          materialName: 'fence posts', quantity: '6', supplierName: 'Jewson',
        })],
      },
      { key: 'returned_materials', label: 'Returned materials', items: [] },
    ],
    stillToCheck: { count: 0, items: [] },
    // Undefined → the frontend derives gross/refunds/net from sections, so a
    // return moves the totals exactly as the backend rules would.
    costSummary: undefined,
  }
}

let returnSeq = 0

// Mirrors the backend return transaction, including its refusals.
function returnInView(memoryItemId: string, req: ReturnMaterialRequest) {
  const leftovers = view.sections.find(s => s.key === 'leftovers')!
  const source = leftovers.items.find(it => it.id === memoryItemId)
  if (!source) throw new ApiError('Memory item not found', 404)
  const available = parseFloat(source.quantity!)
  const returning = parseFloat(req.quantity)
  if (!(returning > 0)) throw new ApiError('Invalid returned quantity', 400)
  if (returning > available) throw new ApiError('More than is left over', 400)

  const returnedItem = memItem({
    id: `ret-${++returnSeq}`,
    memoryType: 'returned_material',
    summary: `Returned ${req.quantity} ${source.materialName}`,
    materialName: source.materialName,
    quantity: req.quantity,
    unit: req.unit ?? source.unit,
    supplierName: req.supplierName ?? null,
    refundAmount: req.refundAmount ?? null,
    refundCurrency: req.refundAmount ? 'GBP' : null,
    returnedFromMemoryItemId: source.id,
    happenedAt: req.happenedAt ?? null,
  })
  if (returning === available) leftovers.items = leftovers.items.filter(it => it.id !== memoryItemId)
  else source.quantity = String(available - returning)
  view.sections.find(s => s.key === 'returned_materials')!.items.unshift(returnedItem)
  return { returnedItem, remainingLeftoverItem: returning === available ? null : { ...source } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  view = buildView()
  returnSeq = 0
  vi.mocked(api.getMemoryView).mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(view))))
  vi.mocked(api.getBudgetSummary).mockResolvedValue(EMPTY_BUDGET)
  vi.mocked(api.returnMemoryItem).mockImplementation((_jobId, id, req) => {
    try { return Promise.resolve(returnInView(id, req)) } catch (e) { return Promise.reject(e) }
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

// Open the return sheet from the Left over fence posts and fill it in.
async function openReturnSheet() {
  await openSection('Materials', 'Left over')
  await screen.findByText('fence posts')
  fireEvent.click(within(card('fence posts')).getByRole('button', { name: /mark as returned/i }))
  return within(await screen.findByRole('dialog', { name: /mark as returned/i }))
}

function fillReturn(sheet: ReturnType<typeof within>, { quantity, refund }: { quantity: string; refund?: string }) {
  fireEvent.change(sheet.getByRole('textbox', { name: /how many did you take back/i }), { target: { value: quantity } })
  if (refund !== undefined) fireEvent.change(sheet.getByRole('textbox', { name: /refund/i }), { target: { value: refund } })
}

// ── Materials: Returned is a peer state ──────────────────────────────────────

describe('Returned materials — Materials navigation', () => {
  it('Materials offers Returned alongside Bought, Used and Left over', async () => {
    renderWorkspace()
    await openSection('Materials')
    for (const name of ['Bought', 'Used', 'Left over', 'Returned']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
  })

  it('an empty Returned tab points back at Left over rather than offering its own add', async () => {
    renderWorkspace()
    await openSection('Materials', 'Returned')
    expect(await screen.findByText(/nothing returned yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add returned/i })).not.toBeInTheDocument()
  })

  it('a Left over item offers Mark as returned', async () => {
    renderWorkspace()
    await openSection('Materials', 'Left over')
    await screen.findByText('fence posts')
    expect(within(card('fence posts')).getByRole('button', { name: /mark as returned/i })).toBeInTheDocument()
  })

  it('bought items offer no return action — only a leftover can be taken back', async () => {
    renderWorkspace()
    await openSection('Materials')
    await screen.findByText('fence panels')
    expect(within(card('fence panels')).queryByRole('button', { name: /mark as returned/i })).not.toBeInTheDocument()
  })
})

// ── Partial and full returns ─────────────────────────────────────────────────

describe('Returned materials — returning a leftover', () => {
  it('a partial return leaves the remaining quantity in Left over and lists the returned quantity', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '4', refund: '80' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))

    await waitFor(() => expect(api.returnMemoryItem).toHaveBeenCalledWith(
      JOB.id, 'left-posts', expect.objectContaining({ quantity: '4', refundAmount: '80', supplierName: 'Jewson' })))

    // Left over now reads 2 — from the refetched backend state, not a local patch.
    await waitFor(() => expect(within(card('fence posts')).getByText('2')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: 'Returned' }))
    const returned = within(await screen.findByRole('tabpanel', { name: /returned materials/i }))
    expect(returned.getByText('4')).toBeInTheDocument()
    expect(returned.getByText('Jewson')).toBeInTheDocument()
    expect(returned.getByText('£80 refund')).toBeInTheDocument()
  })

  it('a full return takes the item out of Left over entirely', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '6', refund: '120' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /mark as returned/i })).not.toBeInTheDocument())
    expect(await screen.findByText(/nothing logged yet|nothing remembered here yet/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Returned' }))
    const returned = within(await screen.findByRole('tabpanel', { name: /returned materials/i }))
    expect(returned.getByText('fence posts')).toBeInTheDocument()
    expect(returned.getByText('6')).toBeInTheDocument()
  })

  it('the return date is recorded and shown on the returned item', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '4', refund: '80' })
    fireEvent.change(sheet.getByLabelText(/date returned/i), { target: { value: '2026-07-08' } })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))

    await waitFor(() => expect(api.returnMemoryItem).toHaveBeenCalledWith(
      JOB.id, 'left-posts', expect.objectContaining({ happenedAt: '2026-07-08T12:00:00' })))
    fireEvent.click(screen.getByRole('tab', { name: 'Returned' }))
    const returned = within(await screen.findByRole('tabpanel', { name: /returned materials/i }))
    expect(returned.getByText('8 Jul')).toBeInTheDocument()
  })

  // The whole point of Returned over Remove: the purchase really happened.
  it('the original bought row stays visible after a return', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '6', refund: '120' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))
    await waitFor(() => expect(api.returnMemoryItem).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('tab', { name: 'Bought' }))
    expect(await screen.findByText('fence posts')).toBeInTheDocument()
    expect(within(card('fence posts')).getByText('£400')).toBeInTheDocument()
  })
})

// ── Spend ────────────────────────────────────────────────────────────────────

describe('Returned materials — spend', () => {
  it('a trusted refund reduces net known spend and says why', async () => {
    renderWorkspace()
    await openSection('Spend')
    expect(await screen.findByText('£920')).toBeInTheDocument() // gross, before any return

    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '4', refund: '80' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))
    await waitFor(() => expect(api.returnMemoryItem).toHaveBeenCalled())

    await openSection('Spend')
    const hero = within(await screen.findByRole('region', { name: /known spend/i }))
    expect(hero.getByText('£840')).toBeInTheDocument()
    // The drop is never silent: gross and refund are both on the hero.
    expect(hero.getByText('£920')).toBeInTheDocument()
    expect(hero.getByText('−£80')).toBeInTheDocument()
  })

  it('lists the refund as money back, not as another spend row', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '4', refund: '80' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))
    await waitFor(() => expect(api.returnMemoryItem).toHaveBeenCalled())

    await openSection('Spend')
    const refunds = within(await screen.findByRole('region', { name: /^refunds$/i }))
    expect(refunds.getByText('4 fence posts')).toBeInTheDocument()
    expect(refunds.getByText(/returned to jewson/i)).toBeInTheDocument()
    // Signed, so it can't be misread as £80 more spent.
    expect(refunds.getByText('−£80')).toBeInTheDocument()
  })

  // "I took them back but haven't been paid yet" is not money back.
  it('a return with no refund leaves spend untouched', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '4' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))
    await waitFor(() => expect(api.returnMemoryItem).toHaveBeenCalledWith(
      JOB.id, 'left-posts', expect.objectContaining({ refundAmount: null })))

    await openSection('Spend')
    const hero = within(await screen.findByRole('region', { name: /known spend/i }))
    expect(hero.getByText('£920')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^refunds$/i })).not.toBeInTheDocument()

    // Still visible in Returned, and honest about the money.
    await openSection('Materials', 'Returned')
    const returned = within(await screen.findByRole('tabpanel', { name: /returned materials/i }))
    expect(returned.getByText(/none recorded — spend is unchanged/i)).toBeInTheDocument()
  })
})

// ── Failure ──────────────────────────────────────────────────────────────────

describe('Returned materials — failure', () => {
  it('returning more than is left over keeps the form, the values, and the leftover', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '9', refund: '180' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))

    expect(await sheet.findByRole('alert')).toHaveTextContent(/more than is left over/i)
    // Nothing typed is lost.
    expect(sheet.getByRole('textbox', { name: /how many did you take back/i })).toHaveValue('9')
    expect(sheet.getByRole('textbox', { name: /refund/i })).toHaveValue('180')
    // And nothing moved.
    fireEvent.click(sheet.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(within(card('fence posts')).getByText('6')).toBeInTheDocument())
    await openSection('Materials', 'Returned')
    expect(await screen.findByText(/nothing returned yet/i)).toBeInTheDocument()
  })

  it('a failed return leaves spend alone', async () => {
    vi.mocked(api.returnMemoryItem).mockRejectedValue(new ApiError('boom', 500))
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '4', refund: '80' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))
    expect(await sheet.findByRole('alert')).toHaveTextContent(/could not save the return/i)

    fireEvent.click(sheet.getByRole('button', { name: /cancel/i }))
    await openSection('Spend')
    expect(await screen.findByText('£920')).toBeInTheDocument()
  })

  // Correcting the record is admin; capture is the product.
  it('leaves Record visible and usable after a return', async () => {
    renderWorkspace()
    const sheet = await openReturnSheet()
    fillReturn(sheet, { quantity: '4', refund: '80' })
    fireEvent.click(sheet.getByRole('button', { name: /save return/i }))
    await waitFor(() => expect(api.returnMemoryItem).toHaveBeenCalled())
    goHomeIfNeeded()
    const record = screen.getByRole('button', { name: /record/i })
    expect(record).toBeInTheDocument()
    expect(record).toBeEnabled()
  })
})

// ── Support mode ─────────────────────────────────────────────────────────────

describe('Returned materials — support view-as', () => {
  const INTERNAL: AuthUser = { id: 'u-f', email: 'f@t', name: 'Founder', role: 'INTERNAL' }
  const SUPPORT_MIKE: SupportUser = {
    id: 'u-mike', email: 'mike@test', name: 'Mike', role: 'PILOT',
    createdAt: '', updatedAt: '', jobCount: 1, lastActivityAt: null,
  }

  async function openViewAs() {
    vi.mocked(api.getCurrentUser).mockResolvedValue(INTERNAL)
    vi.mocked(api.getSupportUsers).mockResolvedValue({ users: [SUPPORT_MIKE] })
    vi.mocked(api.getSupportUserJobs).mockResolvedValue({
      user: SUPPORT_MIKE,
      jobs: [{ id: JOB.id, ownerUserId: 'u-mike', title: JOB.title, jobType: 'other', status: 'started', roughLocationOrLabel: null, createdAt: '', updatedAt: '' }],
    })
    // A job that already has a returned item with a trusted refund: £920
    // bought, £80 back, so support should see £840 net.
    returnInView('left-posts', { quantity: '4', supplierName: 'Jewson', refundAmount: '80', refundCurrency: 'GBP', happenedAt: null })
    vi.mocked(api.getSupportMemoryView).mockResolvedValue(JSON.parse(JSON.stringify(view)))
    vi.mocked(api.getSupportBudgetSummary).mockResolvedValue({
      ...EMPTY_BUDGET,
      totals: { ...EMPTY_BUDGET.totals, knownSpendAmount: '840', knownSpendCurrency: 'GBP' },
    })
    render(<SupportModePage />)
    fireEvent.click(await screen.findByRole('button', { name: /mike/i }))
    fireEvent.click(await screen.findByRole('button', { name: /view as/i }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Used' }))
  }

  it('shows returned materials and the refund adjustment, with no way to change either', async () => {
    await openViewAs()
    // The returned item is on screen, with its merchant and refund.
    const returnedCard = (await screen.findByText('£80 refund')).closest('.mem-card') as HTMLElement
    expect(within(returnedCard).getByText('fence posts')).toBeInTheDocument()
    expect(within(returnedCard).getByText('Jewson')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark as returned/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fix memory/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove item/i })).not.toBeInTheDocument()
  })

  it('shows the refund coming off known spend', async () => {
    await openViewAs()
    fireEvent.click(await screen.findByRole('tab', { name: 'Spend' }))
    const hero = within(await screen.findByRole('region', { name: /known spend/i }))
    expect(hero.getByText(/£80 refunded — net of refunds/i)).toBeInTheDocument()
  })
})
