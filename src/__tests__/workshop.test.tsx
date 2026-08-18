import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import { ToastProvider } from '../Toast'
import { getJobs } from '../api'
import { MOCK_JOBS } from '../api/mock/jobs'
import { mockBudgetSummary } from '../api/mock/budget'
import { mockGetJobMoney } from '../api/mock/money'
import { mockMemoryView } from '../api/mock/memory'
import {
  _resetMockWorkshopForTesting, mockGetWorkshop,
} from '../api/mock/workshop'
import { _resetMockMemoryForTesting } from '../api/mock/state'
import type { BudgetSummaryResponse, Job } from '../types'

// Workshop — availability memory across jobs, driven against the same stateful
// mock backend the app talks to in mock mode.
//
// Nothing here asserts a hand-written list: the expected order, count and
// preview are read back out of `mockGetWorkshop()`, so a test can only pass
// when the screen agrees with the response it was given. The money invariant is
// proved the same way — Budget and Money are snapshotted straight from their
// own mock read models before and after each Workshop action.

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return { ...actual, saveNote: vi.fn(), getNotesForJob: vi.fn(() => Promise.resolve([])) }
})

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))
vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  getSupportedMimeType: () => 'audio/webm',
  useRecorder: () => ({ state: 'idle', elapsedMs: 0, mimeType: 'audio/webm', permissionError: null, start: vi.fn(), stop: vi.fn() }),
}))

vi.mock('../AuthScreen', () => ({
  default: () => <div data-testid="auth-screen" />,
  getResetToken: () => null,
}))

// Every Workshop call goes to the stateful mock backend, so a write a test
// performs is really recorded and every read afterwards derives from it. The
// job-side reads (memory view, Budget, Money) come from their own mock modules
// for the same reason: the invariant is only worth asserting against the
// backend's own arithmetic.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  const workshop = await import('../api/mock/workshop')
  const memory = await import('../api/mock/memory')
  const budget = await import('../api/mock/budget')
  const money = await import('../api/mock/money')
  return {
    ...actual,
    getJobs: vi.fn(),
    getCurrentUser: vi.fn(() => Promise.resolve({ id: 'u1', email: 'mike@test', name: 'Mike', role: 'PILOT' })),
    onUnauthorized: vi.fn(),
    getBookMoney: vi.fn(() => Promise.resolve({
      generatedAt: '', bookHome: { showMoneyRow: false }, toPayOnAccounts: null, owedToMe: null,
    })),
    getWorkshop: vi.fn(async () => workshop.mockGetWorkshop()),
    moveLeftoverToWorkshop: vi.fn(async (jobId: string, itemId: string) =>
      workshop.mockMoveLeftoverToWorkshop(jobId, itemId, {})),
    createWorkshopItem: vi.fn(async (req: { materialName: string; roughAmount?: string | null }) =>
      workshop.mockAddManualWorkshopItem(req)),
    patchWorkshopItem: vi.fn(async (id: string, req: { materialName?: string; roughAmount?: string | null }) =>
      workshop.mockPatchWorkshopItem(id, req)),
    undoWorkshopMove: vi.fn(async (id: string) => workshop.mockUndoWorkshopMove(id)),
    markWorkshopItemUsedUp: vi.fn(async (id: string) => workshop.mockWorkshopUsedUp(id)),
    markWorkshopItemWasntThere: vi.fn(async (id: string) => workshop.mockWorkshopWasntThere(id)),
    putBackWorkshopItem: vi.fn(async (id: string) => workshop.mockPutBackWorkshopItem(id)),
    getMemoryView: vi.fn(async (jobId: string) => memory.mockMemoryView(jobId)),
    getBudgetSummary: vi.fn(async (jobId: string) => budget.mockBudgetSummary(jobId)),
    getJobMoney: vi.fn(async (jobId: string) => money.mockGetJobMoney(jobId)),
    getJobPayments: vi.fn(() => Promise.reject(new Error('none'))),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: '', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: '', photos: [] })),
    getJobReceipts: vi.fn(() => Promise.resolve({ jobId: '', receipts: [] })),
  }
})

const GARDEN = MOCK_JOBS.find(j => j.id === 'job-pilot-garden-room-001')!
const KITCHEN = MOCK_JOBS.find(j => j.id === 'job-pilot-extension-002')!
const WHITMORE = MOCK_JOBS.find(j => j.id === 'job-pilot-finished-005')!
const LIVE_JOBS = MOCK_JOBS.filter(j => j.status !== 'archived')

const SELECTED_ID_KEY = 'job-book-selected-job-id'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  _resetMockMemoryForTesting()
  _resetMockWorkshopForTesting()
  vi.mocked(getJobs).mockResolvedValue(LIVE_JOBS)
})

/** Budget as the backend currently states it, minus the moving parts of a read. */
function budgetShape(jobId: string): Partial<BudgetSummaryResponse> {
  return { ...mockBudgetSummary(jobId), generatedAt: undefined }
}

function moneyShape(jobId: string) {
  return { ...mockGetJobMoney(jobId), generatedAt: undefined }
}

// ── The Workshop page and Book Home, through the whole app ──────────────────

describe('Workshop across jobs', () => {
  async function launch(scenario = 'default') {
    _resetMockWorkshopForTesting(scenario)
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: /the job book/i })).toBeInTheDocument())
  }

  async function gotoBookHome(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /the job book/i }))
    await screen.findByRole('heading', { name: 'The Job Book' })
  }

  async function gotoWorkshop(user: ReturnType<typeof userEvent.setup>) {
    await gotoBookHome(user)
    await user.click(await screen.findByRole('button', { name: /^Workshop/ }))
    await screen.findByRole('heading', { name: /^Workshop/ })
  }

  function openItem(user: ReturnType<typeof userEvent.setup>, name: string) {
    return user.click(screen.getByRole('button', { name: `Open ${name}` }))
  }

  it('shows the count and a preview of the first three available items on Book Home', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)

    const expected = mockGetWorkshop().bookHome
    expect(screen.getByRole('button', { name: new RegExp(`^Workshop.*${expected.availableLabel}`) })).toBeInTheDocument()
    // The preview is the backend's first three, not a separate pick. Scoped to
    // the preview block, since a source job's name also appears in the job list
    // above — which is the point: the preview names jobs Mike already knows.
    expect(expected.previewItems).toHaveLength(3)
    const preview = document.querySelector('.book-workshop-preview') as HTMLElement
    const rows = within(preview).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expected.previewItems.forEach((item, i) => {
      expect(rows[i]).toHaveTextContent(item.materialName)
      expect(rows[i]).toHaveTextContent(item.sourceLabel)
      if (item.roughAmount) expect(rows[i]).toHaveTextContent(item.roughAmount)
    })
  })

  it('keeps a bare Workshop row when the workshop is empty, with no zero and no Record', async () => {
    const user = userEvent.setup()
    await launch('workshop-empty')
    await gotoBookHome(user)

    expect(screen.getByRole('button', { name: /^Workshop/ })).toBeInTheDocument()
    expect(screen.queryByText(/0 things/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record/i })).not.toBeInTheDocument()
  })

  it('lists available items newest entered first, with rough words and provenance', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)

    const expected = mockGetWorkshop().availableItems
    const rendered = screen.getAllByRole('button', { name: /^Open / }).map(b => b.getAttribute('aria-label'))
    expect(rendered).toEqual(expected.map(i => `Open ${i.materialName}`))

    // Rough words survive exactly as they were said.
    expect(screen.getByText('about 3 sheets')).toBeInTheDocument()
    expect(screen.getByText('half a box')).toBeInTheDocument()
    // A hand-added item says so where a source job would be.
    expect(screen.getAllByText(/Added by hand/).length).toBeGreaterThan(0)
    // A finished source job is named as one.
    expect(screen.getByText(new RegExp(`${WHITMORE.title}.*finished job`))).toBeInTheDocument()
  })

  it('shows no amount at all — never a zero — for an item with no rough amount', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)

    const row = screen.getByRole('button', { name: 'Open Insulation, 100mm' })
    expect(within(row).queryByText('0')).not.toBeInTheDocument()
    expect(row.querySelector('.ws-row-amount')).toBeNull()
  })

  it('offers no Record action and no voice copy anywhere in the Workshop', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)

    expect(screen.queryByRole('button', { name: /record/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/say it|voice|stock check/i)).not.toBeInTheDocument()
  })

  it('shows only the two empty-state lines when there is nothing in there', async () => {
    const user = userEvent.setup()
    await launch('workshop-empty')
    await gotoWorkshop(user)

    expect(screen.getByText('Nothing in the workshop yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add one by hand/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/leftover/i)).not.toBeInTheDocument()
  })

  it('a source-linked item drawer offers the source job and the undo-move', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)
    await openItem(user, 'OSB')

    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.getByRole('button', { name: /Change what's there/ })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: /All used up/ })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: new RegExp(`Open ${KITCHEN.title}`) })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: /Undo move to the Workshop/ })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: /Wasn't there after all/ })).toBeInTheDocument()
  })

  it('a hand-added item drawer omits the source job and the undo-move', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)
    await openItem(user, 'Sand')

    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.getByRole('button', { name: /Change what's there/ })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: /All used up/ })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: /Wasn't there after all/ })).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: /^Open / })).not.toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: /Undo move/ })).not.toBeInTheDocument()
    // No reassurance about a job keeping its cost: there is no job.
    expect(sheet.queryByText(/keeps its cost/)).not.toBeInTheDocument()
  })

  it('adds by hand from two fields only, and asks for nothing else', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)
    await user.click(screen.getByRole('button', { name: 'Add by hand' }))

    const form = screen.getByRole('form', { name: 'Add by hand' })
    expect(within(form).getAllByRole('textbox')).toHaveLength(2)
    expect(within(form).getByLabelText('What it is')).toBeInTheDocument()
    expect(within(form).getByLabelText('Rough amount (optional)')).toBeInTheDocument()
    for (const absent of [/supplier/i, /price/i, /categor/i, /location/i, /unit/i, /job/i]) {
      expect(within(form).queryByLabelText(absent)).not.toBeInTheDocument()
    }

    await user.type(within(form).getByLabelText('What it is'), 'Insulation, 50mm')
    await user.type(within(form).getByLabelText('Rough amount (optional)'), 'a bit')
    await user.click(within(form).getByRole('button', { name: 'Add to the workshop' }))

    await screen.findByRole('button', { name: 'Open Insulation, 50mm' })
    // Newest first, so a fresh hand-added item leads the list.
    expect(mockGetWorkshop().availableItems[0].materialName).toBe('Insulation, 50mm')
    expect(screen.getByText('a bit')).toBeInTheDocument()
  })

  it('adds by hand with no rough amount at all', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)
    await user.click(screen.getByRole('button', { name: 'Add by hand' }))

    const form = screen.getByRole('form', { name: 'Add by hand' })
    await user.type(within(form).getByLabelText('What it is'), 'Trims')
    await user.click(within(form).getByRole('button', { name: 'Add to the workshop' }))

    const row = await screen.findByRole('button', { name: 'Open Trims' })
    expect(row.querySelector('.ws-row-amount')).toBeNull()
  })

  it('changes what is there without sharpening the words', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)
    await openItem(user, 'OSB')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Change what's there/ }))

    const form = screen.getByRole('form', { name: "Change what's there" })
    const amount = within(form).getByLabelText('Rough amount')
    await user.clear(amount)
    await user.type(amount, 'a couple of sheets, maybe 3')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('a couple of sheets, maybe 3')).toBeInTheDocument())
    // Stored verbatim — not parsed into a number, not rounded, not split.
    expect(mockGetWorkshop().availableItems.find(i => i.id === 'ws-osb')!.roughAmount)
      .toBe('a couple of sheets, maybe 3')
  })

  it('marks an item all used up, drops it from the list, and undoes it back', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)
    const before = mockGetWorkshop().bookHome.availableCount

    await openItem(user, 'Membrane')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /All used up/ }))

    const result = within(await screen.findByRole('dialog', { name: 'All used up' }))
    expect(result.getByText(/Membrane · part of a roll/)).toBeInTheDocument()
    await waitFor(() => expect(mockGetWorkshop().bookHome.availableCount).toBe(before - 1))

    await user.click(result.getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(mockGetWorkshop().bookHome.availableCount).toBe(before))
    // Same item, same rough words — never a second Workshop item.
    expect(mockGetWorkshop().availableItems.filter(i => i.materialName === 'Membrane')).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'Open Membrane' })).toBeInTheDocument()
  })

  it('records "wasn\'t there after all" as a different outcome, with its own undo', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)

    await openItem(user, 'Membrane')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Wasn't there after all/ }))

    await screen.findByRole('dialog', { name: /Wasn.t there after all/ })
    // Distinct backend state — not shared with used up.
    await waitFor(() => {
      const item = mockGetWorkshop().availableItems.find(i => i.id === 'ws-membrane')
      expect(item).toBeUndefined()
    })

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Undo/ }))
    expect(await screen.findByRole('button', { name: 'Open Membrane' })).toBeInTheDocument()
  })

  it('undoes a move from the Workshop, returning the material to its job alone', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoWorkshop(user)
    await openItem(user, 'OSB')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Undo move to the Workshop/ }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open OSB' })).not.toBeInTheDocument())
    // The source leftover is a plain leftover again, with no Workshop state.
    const source = mockMemoryView(KITCHEN.id).sections
      .find(s => s.key === 'leftovers')!.items.find(i => i.id === 'mem-kitchen-left-1')!
    expect(source.workshopState).toBe('not_moved')
  })

  it('opens the source job at the leftover the Workshop item came from', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, WHITMORE.id)
    await launch()
    await gotoWorkshop(user)
    await openItem(user, 'Fence posts')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(`Open ${WHITMORE.title}`) }))

    // Materials → Left over, with the source row's action drawer already open.
    expect(await screen.findByRole('tabpanel', { name: 'Left over materials' })).toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: /Fence posts/ })).toBeInTheDocument()
  })

  it('leaves a failed action with nothing changed and says so', async () => {
    const user = userEvent.setup()
    await launch('workshop-fails')
    await gotoWorkshop(user)
    const before = mockGetWorkshop().availableItems.map(i => i.id)

    await openItem(user, 'OSB')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /All used up/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing changed/i)
    expect(mockGetWorkshop().availableItems.map(i => i.id)).toEqual(before)
  })
})

// ── The source job: moving a leftover in, and living with the result ────────

describe('Workshop from the source job', () => {
  // Wrapped in the toast provider because that is where a failed Workshop
  // action is reported: the drawer has already closed by then, so the toast is
  // the only thing that can say nothing moved.
  function renderJob(job: Job) {
    return render(
      <ToastProvider>
        <CurrentJobWorkspace job={job} onOpenReviewQueue={vi.fn()} onOpenBookHome={vi.fn()} onOpenWorkshop={vi.fn()} />
      </ToastProvider>,
    )
  }

  async function openLeftovers() {
    fireEvent.click(await screen.findByRole('button', { name: 'Open Materials' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Left over' }))
    return screen.findByRole('tabpanel', { name: 'Left over materials' })
  }

  async function openRow(name: string) {
    const row = await screen.findByRole('button', { name: `Open actions for ${name}` })
    fireEvent.click(row)
    return within(await screen.findByRole('dialog'))
  }

  it('offers the move on a confirmed leftover, with the consequence stated once', async () => {
    renderJob(GARDEN)
    await openLeftovers()
    const sheet = await openRow('fence posts')

    const move = sheet.getByRole('button', { name: /Move to the Workshop/ })
    expect(move).toHaveTextContent('No new cost. Budget and Money stay as they are.')
    // The consequence is stated on the action, not repeated as a totals panel.
    expect(sheet.queryByText(/£/)).not.toBeInTheDocument()
  })

  it('moves a leftover from a Finished job without reopening it or touching the money', async () => {
    const budgetBefore = budgetShape(WHITMORE.id)
    const moneyBefore = moneyShape(WHITMORE.id)

    renderJob(WHITMORE)
    await openLeftovers()
    const sheet = await openRow('Gravel boards')
    fireEvent.click(sheet.getByRole('button', { name: /Move to the Workshop/ }))

    // The result names what moved and where it came from — and no totals.
    const result = within(await screen.findByRole('dialog', { name: /Moved to the Workshop/ }))
    expect(result.getByText(/Gravel boards · a couple/)).toBeInTheDocument()
    expect(result.getByText(`From ${WHITMORE.title}`)).toBeInTheDocument()
    expect(result.getByRole('button', { name: /See in the Workshop/ })).toBeInTheDocument()
    expect(result.getByRole('button', { name: /Undo move to the Workshop/ })).toBeInTheDocument()
    expect(result.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    // The job is still finished, and every figure is exactly as it was.
    expect(MOCK_JOBS.find(j => j.id === WHITMORE.id)!.status).toBe('finished')
    expect(budgetShape(WHITMORE.id)).toEqual(budgetBefore)
    expect(moneyShape(WHITMORE.id)).toEqual(moneyBefore)
  })

  it('keeps the moved leftover on its job, marked IN WORKSHOP', async () => {
    renderJob(WHITMORE)
    await openLeftovers()
    const sheet = await openRow('Gravel boards')
    fireEvent.click(sheet.getByRole('button', { name: /Move to the Workshop/ }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: /Moved to the Workshop/ })).getByRole('button', { name: 'Done' }))

    const row = await screen.findByRole('button', { name: 'Open actions for Gravel boards' })
    expect(within(row).getByText('IN WORKSHOP')).toBeInTheDocument()
    expect(within(row).getByText(/in the workshop since/)).toBeInTheDocument()
  })

  it('does not offer the move a second time while the leftover is already in there', async () => {
    renderJob(WHITMORE)
    await openLeftovers()
    // Fence posts is seeded as already in the Workshop.
    const sheet = await openRow('Fence posts')
    expect(sheet.queryByRole('button', { name: /Move to the Workshop/ })).not.toBeInTheDocument()
  })

  it('shows USED UP and WASN\'T THERE as different states on the source rows', async () => {
    renderJob(WHITMORE)
    await openLeftovers()
    const cementBoard = await screen.findByRole('button', { name: 'Open actions for Cement board' })
    expect(within(cementBoard).getByText("WASN'T THERE")).toBeInTheDocument()
    expect(within(cementBoard).getByText(/corrected/)).toBeInTheDocument()
    // Never dimmed: the row is a fact Mike recorded, not a deactivated record.
    expect(cementBoard.closest('.mem-card')!.className).not.toMatch(/faded|muted/)
  })

  it('puts a terminal outcome back in the Workshop from its source job, without a duplicate', async () => {
    renderJob(WHITMORE)
    await openLeftovers()
    const sheet = await openRow('Cement board')
    fireEvent.click(sheet.getByRole('button', { name: /Put back in the Workshop/ }))

    await waitFor(() => {
      const row = screen.getByRole('button', { name: 'Open actions for Cement board' })
      expect(within(row).getByText('IN WORKSHOP')).toBeInTheDocument()
    })
    expect(mockGetWorkshop().availableItems.filter(i => i.materialName === 'Cement board')).toHaveLength(1)
  })

  it('leaves Budget and Money untouched through move, undo and put-back', async () => {
    const budgetBefore = budgetShape(WHITMORE.id)
    const moneyBefore = moneyShape(WHITMORE.id)

    renderJob(WHITMORE)
    await openLeftovers()

    fireEvent.click((await openRow('Gravel boards')).getByRole('button', { name: /Move to the Workshop/ }))
    const result = within(await screen.findByRole('dialog', { name: /Moved to the Workshop/ }))
    expect(budgetShape(WHITMORE.id)).toEqual(budgetBefore)

    fireEvent.click(result.getByRole('button', { name: /Undo move to the Workshop/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(budgetShape(WHITMORE.id)).toEqual(budgetBefore)

    fireEvent.click((await openRow('Cement board')).getByRole('button', { name: /Put back in the Workshop/ }))
    await waitFor(() => {
      const row = screen.getByRole('button', { name: 'Open actions for Cement board' })
      expect(within(row).getByText('IN WORKSHOP')).toBeInTheDocument()
    })
    expect(budgetShape(WHITMORE.id)).toEqual(budgetBefore)
    expect(moneyShape(WHITMORE.id)).toEqual(moneyBefore)
  })

  it('says nothing changed when a move fails, and leaves the leftover as it was', async () => {
    _resetMockWorkshopForTesting('workshop-fails')
    renderJob(WHITMORE)
    await openLeftovers()
    fireEvent.click((await openRow('Gravel boards')).getByRole('button', { name: /Move to the Workshop/ }))

    expect(await screen.findByText(/Nothing changed/)).toBeInTheDocument()
    const row = await screen.findByRole('button', { name: 'Open actions for Gravel boards' })
    expect(within(row).queryByText('IN WORKSHOP')).not.toBeInTheDocument()
  })
})
