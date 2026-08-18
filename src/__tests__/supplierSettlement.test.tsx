import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { getJobs } from '../api'
import {
  _resetMockBookMoneyForTesting, _setMockSettlementGateForTesting, mockGetBookMoney,
} from '../api/mock/bookMoney'
import { mockBudgetSummary } from '../api/mock/budget'
import { mockGetJobMoney } from '../api/mock/money'
import { MOCK_JOBS } from '../api/mock/jobs'
import type { BookMoneyResponse, BudgetSummaryResponse, Job } from '../types'

// Supplier account settlement, driven through the app against the mock backend.
//
// Nothing here asserts a hand-written figure: the expected totals, counts and
// allocations are read back out of the same mock read models the screens were
// given, so a test can only pass when the receipt agrees with the account it
// came from. The job workspace is stubbed and reports where it was opened,
// which is how navigation out of a receipt is proved.

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return { ...actual, saveNote: vi.fn(), getNotesForJob: vi.fn(() => Promise.resolve([])) }
})

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  const mock = await import('../api/mock/bookMoney')
  // The settlement endpoints go straight to the stateful mock backend, so every
  // write a test performs is really recorded and every read afterwards — the
  // account, the jobs' Money, Budget, the history — is derived from it.
  const backend = await import('../api/mock/supplierPayments')
  return {
    getJobs: vi.fn(),
    createJob: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
    getCurrentUser: vi.fn(() => Promise.resolve({ id: 'u1', email: 'mike@test', name: 'Mike', role: 'PILOT' })),
    onUnauthorized: vi.fn(),
    ApiError: actual.ApiError,
    getBookMoney: vi.fn(() => Promise.resolve(mock.mockGetBookMoney())),
    createSupplierPayment: vi.fn(async (req: Parameters<typeof backend.mockCreateSupplierPayment>[0]) =>
      backend.mockCreateSupplierPayment(req)),
    getSupplierPayment: vi.fn(async (id: string) => backend.mockGetSupplierPayment(id)),
    patchSupplierPaymentDate: vi.fn(async (id: string, req: { paidAt: string }) =>
      backend.mockPatchSupplierPaymentDate(id, req)),
    undoSupplierPayment: vi.fn(async (id: string) => { backend.mockUndoSupplierPayment(id) }),
    isSettlementUnavailable: actual.isSettlementUnavailable,
  }
})

vi.mock('../CurrentJobWorkspace', () => ({
  default: ({ job, entry, onOpenBookHome }: {
    job: Job
    entry: { section?: string; focusItemId?: string } | null
    onOpenBookHome: () => void
  }) => (
    <div
      data-testid="workspace-screen"
      data-job-id={job.id}
      data-section={entry?.section ?? 'home'}
      data-focus-item={entry?.focusItemId ?? ''}
    >
      <h1>{job.title}</h1>
      <button onClick={onOpenBookHome}>‹ The Job Book</button>
    </div>
  ),
}))

vi.mock('../AuthScreen', () => ({
  default: () => <div data-testid="auth-screen" />,
  getResetToken: () => null,
}))

const mockGetJobs = vi.mocked(getJobs)
const LIVE_JOBS = MOCK_JOBS.filter(j => j.status !== 'archived')

const KITCHEN = 'job-pilot-extension-002'
const GRANT = 'job-pilot-planning-003'
const WHITMORE = 'job-pilot-finished-005'

// The rich account in the fixture: four recorded costs across three jobs, one
// of them a finished job, which is the whole point of settling across jobs.
const ACCOUNT = 'Sydenhams'

async function launch(scenario = 'default') {
  _resetMockBookMoneyForTesting(scenario)
  render(<App />)
  await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
}

async function gotoMoney(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /the job book/i }))
  await screen.findByRole('heading', { name: 'The Job Book' })
  await user.click(await screen.findByRole('button', { name: /^Money/ }))
  await screen.findByRole('heading', { name: /^Money/ })
}

async function openAccount(user: ReturnType<typeof userEvent.setup>, name = ACCOUNT) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^Open ${name},`) }))
  await screen.findByRole('heading', { name: new RegExp(name) })
}

/** The account as the backend currently describes it. */
function account(name = ACCOUNT) {
  return mockGetBookMoney().toPayOnAccounts!.supplierGroups.find(g => g.displayName === name)!
}

function bookMoney(): BookMoneyResponse {
  return mockGetBookMoney()
}

function tick(label: string) {
  return screen.getByRole('checkbox', { name: new RegExp(`^Include ${label}`) })
}

/** The sticky summary, which is the running description of the payment. */
function bar() {
  return screen.getByRole('group', { name: 'Record a payment' })
}

/** Budget, with only the moving parts of a read stripped out. */
function budgetShape(jobId: string): Partial<BudgetSummaryResponse> {
  const summary = mockBudgetSummary(jobId)
  return { ...summary, generatedAt: undefined }
}

async function settle(user: ReturnType<typeof userEvent.setup>, labels: string[]) {
  for (const label of labels) await user.click(tick(label))
  await user.click(within(bar()).getByRole('button', { name: /^Mark .* paid$/ }))
  return screen.findByRole('dialog', { name: new RegExp(`to ${ACCOUNT}$`) })
}

describe('Supplier account settlement across jobs', () => {
  beforeEach(() => {
    mockGetJobs.mockResolvedValue(LIVE_JOBS)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  // ── Selection ─────────────────────────────────────────────────────────────

  it('starts with nothing selected and the account total intact', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)

    expect(screen.getByText('Tick what a payment covers')).toBeInTheDocument()
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked()

    const summary = bar()
    expect(within(summary).getByText('Nothing selected')).toBeInTheDocument()
    expect(within(summary).getByText(`${account().totalLabel} on the account`)).toBeInTheDocument()
    // Present, so the screen's purpose is legible — but not yet a payment.
    expect(within(summary).getByRole('button', { name: 'Mark paid' })).toBeDisabled()
  })

  it('a tick selects the whole line, and tapping the line opens the cost instead', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)

    await user.click(tick('Timber, 3 packs'))
    expect(tick('Timber, 3 packs')).toBeChecked()
    await user.click(tick('Timber, 3 packs'))
    expect(tick('Timber, 3 packs')).not.toBeChecked()

    // Reading a cost must never quietly add it to a payment.
    await user.click(screen.getByRole('button', { name: /^Open Timber, 3 packs on / }))
    const workspace = await screen.findByTestId('workspace-screen')
    expect(workspace).toHaveAttribute('data-job-id', KITCHEN)
    expect(workspace).toHaveAttribute('data-focus-item', 'mem-x-kitchen-2')
  })

  it('Select all becomes Clear, and covers every line on the account', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)

    await user.click(screen.getByRole('button', { name: 'Select all' }))
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument()
  })

  it('the summary counts the costs, the jobs and what would be left unpaid', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    const group = account()
    // Two costs on two different jobs, one of them the finished one.
    const picked = ['Timber, 3 packs', 'Fence posts, 20']
    const total = 3000 + 310
    const left = parseFloat(group.totalAmount) - total

    for (const label of picked) await user.click(tick(label))

    const summary = bar()
    expect(within(summary).getByText('2 selected · 2 jobs')).toBeInTheDocument()
    expect(within(summary).getByText(`£${left.toLocaleString('en-GB')} left unpaid`)).toBeInTheDocument()
    expect(within(summary).getByRole('button', { name: `Mark £${total.toLocaleString('en-GB')} paid` })).toBeEnabled()
  })

  it('says no recorded costs are left unpaid — never that the account is cleared', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)

    await user.click(screen.getByRole('button', { name: 'Select all' }))

    const summary = bar()
    expect(within(summary).getByText('No recorded costs left unpaid')).toBeInTheDocument()
    expect(within(summary).queryByText(/cleared|settled|reconciled|statement/i)).not.toBeInTheDocument()
  })

  it('offers no amount field and no way to part-pay one cost', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await user.click(tick('Timber, 3 packs'))

    // The payment is worth exactly what it covers. There is nothing to type.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/amount/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/part paid|partly|edit payment amount/i)).not.toBeInTheDocument()
  })

  // ── Contexts that cannot be settled ───────────────────────────────────────

  it('Supplier needed cannot be settled', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user, 'Supplier needed')

    expect(screen.getByText('Recorded costs')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Record a payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /select all|mark .*paid/i })).not.toBeInTheDocument()
  })

  it('missing-price costs carry no settlement control', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    const missing = within(screen.getByRole('group', { name: 'Costs with no price yet' }))
    expect(missing.queryByRole('checkbox')).not.toBeInTheDocument()
    // Their only route is the one that would make them settleable: a price.
    expect(missing.getAllByRole('button', { name: /^Add price for / }).length).toBeGreaterThan(0)
  })

  // ── Recording the payment ─────────────────────────────────────────────────

  it('shows the allocation receipt, split by job, after the backend confirms', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)

    const dialog = within(await settle(user, ['Timber, 3 packs', 'Roof battens, bundle', 'Fence posts, 20']))

    expect(dialog.getByText(/^Paid · /)).toBeInTheDocument()
    expect(dialog.getByText('Covers 3 recorded costs on 2 jobs. Budgets unchanged.')).toBeInTheDocument()

    // The receipt is the backend's, and its allocations are per job — the
    // kitchen's two costs on one line, the finished job's one on another.
    const receipt = bookMoney().accountPaymentHistory[0]
    expect(receipt.totalLabel).toBe('£3,560')
    const kitchen = dialog.getByRole('button', { name: /^Open Money for Kitchen Extension/ })
    expect(kitchen).toHaveTextContent('-£3,250')
    const whitmore = dialog.getByRole('button', { name: /^Open Money for Whitmore Patio/ })
    expect(whitmore).toHaveTextContent('-£310')
    expect(whitmore).toHaveTextContent('finished job')

    // …and the costs that made up each share are listed under it.
    expect(dialog.getByRole('button', { name: /^Open Timber, 3 packs on Kitchen Extension/ })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /^Open Roof battens, bundle on Kitchen Extension/ })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /^Open Fence posts, 20 on Whitmore Patio/ })).toBeInTheDocument()
  })

  it('takes the paid costs off the account and leaves the rest', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await settle(user, ['Timber, 3 packs', 'Roof battens, bundle'])
    await user.click(screen.getByRole('button', { name: 'Done' }))

    const group = account()
    expect(group.purchaseCount).toBe(2)
    expect(group.totalLabel).toBe('£610')
    expect(group.lines.map(l => l.itemLabel)).toEqual(['Fence posts', 'Sand'])
    // The source items were not touched; they simply stopped being unpaid.
    await waitFor(() => expect(screen.getByRole('heading', { name: /£610/ })).toBeInTheDocument())
  })

  it('splits the payment across jobs without a job ever seeing the whole of it', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await settle(user, ['Timber, 3 packs', 'Roof battens, bundle', 'Sand, 4 tonne'])

    const kitchenRows = mockGetJobMoney(KITCHEN).rows.filter(r => r.kind === 'supplier_account_payment')
    const grantRows = mockGetJobMoney(GRANT).rows.filter(r => r.kind === 'supplier_account_payment')

    // One row per job per payment — the three child paid markers behind them
    // are never rows of their own, or Money out would count the same money twice.
    expect(kitchenRows).toHaveLength(1)
    expect(grantRows).toHaveLength(1)
    expect(kitchenRows[0].amount).toBe('3250')
    expect(grantRows[0].amount).toBe('300')
    expect(mockGetJobMoney(WHITMORE).rows.filter(r => r.kind === 'supplier_account_payment')).toHaveLength(0)

    // Each job's Money out is its own share, not the payment.
    expect(mockGetJobMoney(KITCHEN).moneyOutAmount).toBe('3250')
    // Oldest first, the order the account listed them in.
    expect(kitchenRows[0].allocationSourceLabels).toEqual(['Roof battens, bundle', 'Timber, 3 packs'])
    expect(kitchenRows[0].removable).toBe(false)
  })

  it('leaves every Budget figure exactly as it was, through settlement and undo', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    const before = [KITCHEN, GRANT, WHITMORE].map(budgetShape)

    await openAccount(user)
    await settle(user, ['Timber, 3 packs', 'Roof battens, bundle', 'Sand, 4 tonne', 'Fence posts, 20'])
    expect([KITCHEN, GRANT, WHITMORE].map(budgetShape)).toEqual(before)

    await user.click(screen.getByRole('button', { name: /^Undo this payment/ }))
    await user.click(await screen.findByRole('button', { name: 'Undo this payment' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect([KITCHEN, GRANT, WHITMORE].map(budgetShape)).toEqual(before)
  })

  it('a retry of the same submit cannot pay the account twice', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await settle(user, ['Timber, 3 packs'])
    await user.click(screen.getByRole('button', { name: 'Done' }))

    // A second, separate payment is a different request id and is allowed; what
    // must never happen is one submit producing two payments. The mock backend
    // answers a repeated clientRequestId with the payment already made.
    const first = bookMoney().accountPaymentHistory
    expect(first).toHaveLength(1)
    const { createSupplierPayment } = await import('../api')
    const requestId = 'stable-submit-id'
    const req = {
      supplierGroupId: account().groupId,
      supplierName: ACCOUNT,
      sourceMemoryItemIds: ['mem-x-grant-1'],
      clientRequestId: requestId,
    }
    const once = await createSupplierPayment(req)
    const twice = await createSupplierPayment(req)
    expect(twice.id).toBe(once.id)
    expect(bookMoney().accountPaymentHistory).toHaveLength(2)
  })

  it('a stale selection fails whole, keeps the task and says why', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await user.click(tick('Timber, 3 packs'))
    await user.click(tick('Sand, 4 tonne'))

    // The same costs are paid from somewhere else between ticking and marking.
    const { createSupplierPayment } = await import('../api')
    await createSupplierPayment({
      supplierGroupId: account().groupId,
      supplierName: ACCOUNT,
      sourceMemoryItemIds: ['mem-x-kitchen-2'],
      clientRequestId: 'elsewhere',
    })

    await user.click(within(bar()).getByRole('button', { name: /^Mark .* paid$/ }))

    expect(await screen.findByText('This account changed. Review the current costs and try again.')).toBeInTheDocument()
    // No partial payment was recorded, and the cost that is still on the
    // account is still ticked, so Mike is looking at the same task.
    expect(bookMoney().accountPaymentHistory).toHaveLength(1)
    await waitFor(() => expect(tick('Sand, 4 tonne')).toBeChecked())
    expect(within(bar()).getByText('1 selected · 1 job')).toBeInTheDocument()
  })

  // ── History, undo and the date ────────────────────────────────────────────

  it('keeps the receipt reachable after the account has nothing left unpaid', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user, 'Travis Perkins')
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    await user.click(within(bar()).getByRole('button', { name: /^Mark .* paid$/ }))
    await screen.findByRole('dialog', { name: /to Travis Perkins$/ })
    await user.click(screen.getByRole('button', { name: 'Done' }))

    // The account is gone from "to pay" — the receipt is the only record of
    // where it went, and history is the way back to it.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Open Travis Perkins,/ })).not.toBeInTheDocument())
    const history = within(await screen.findByRole('region', { name: 'Account payment history' }))
    const row = history.getByRole('button', { name: /payment to Travis Perkins$/ })
    expect(row).toHaveTextContent('1 cost')
    expect(row).toHaveTextContent('1 job')

    await user.click(row)
    expect(await screen.findByRole('dialog', { name: '£460 to Travis Perkins' })).toBeInTheDocument()
  })

  it('history lists real payments only, never regrouped older paid costs', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    // Nothing has been settled yet, so there is no history section at all.
    expect(screen.queryByRole('region', { name: 'Account payment history' })).not.toBeInTheDocument()

    await openAccount(user)
    await settle(user, ['Sand, 4 tonne'])
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: /back to money/i }))

    const history = within(await screen.findByRole('region', { name: 'Account payment history' }))
    expect(history.getAllByRole('button')).toHaveLength(1)
  })

  it('undo puts every covered cost back on the account', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    const before = account()

    await openAccount(user)
    await settle(user, ['Timber, 3 packs', 'Fence posts, 20'])
    await user.click(screen.getByRole('button', { name: /^Undo this payment/ }))

    // The confirmation says what comes back, and what does not move.
    expect(await screen.findByText(/All 2 costs go back on the Sydenhams account/)).toBeInTheDocument()
    expect(screen.getByText('Budgets stay unchanged.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo this payment' }))

    await waitFor(() => expect(account().totalLabel).toBe(before.totalLabel))
    expect(account().purchaseCount).toBe(before.purchaseCount)
    expect(bookMoney().accountPaymentHistory).toHaveLength(0)
    expect(mockGetJobMoney(KITCHEN).rows.filter(r => r.kind === 'supplier_account_payment')).toHaveLength(0)
  })

  it('changes the payment date and nothing else', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await settle(user, ['Timber, 3 packs', 'Fence posts, 20'])
    const before = bookMoney().accountPaymentHistory[0]

    await user.click(screen.getByRole('button', { name: /^Change payment date/ }))
    const field = await screen.findByLabelText('Date paid')
    // A payment cannot have been made tomorrow.
    expect(field).toHaveAttribute('max', new Date().toISOString().slice(0, 10))
    await user.clear(field)
    await user.type(field, '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Save date' }))

    const dialog = within(await screen.findByRole('dialog', { name: `${before.totalLabel} to ${ACCOUNT}` }))
    expect(dialog.getByText('Paid · Mon 10 Aug')).toBeInTheDocument()

    const after = bookMoney().accountPaymentHistory[0]
    expect(after.paidAt.slice(0, 10)).toBe('2026-08-10')
    // Everything else about the payment is as it was recorded.
    expect({ ...after, paidAt: '', paidAtLabel: '' }).toEqual({ ...before, paidAt: '', paidAtLabel: '' })
    expect(mockGetJobMoney(KITCHEN).rows.find(r => r.kind === 'supplier_account_payment')!.occurredAt.slice(0, 10))
      .toBe('2026-08-10')
  })

  // ── Backend gating ────────────────────────────────────────────────────────
  // Settlement is switched on by backend config while real-account validation is
  // outstanding. Whether it is on is the backend's statement, never a guess from
  // this build — and Money must stay readable either way.

  it('offers no settlement when the backend says the feature is off', async () => {
    const user = userEvent.setup()
    await launch('book-money-settlement-off')
    await gotoMoney(user)
    await openAccount(user)

    // Not a disabled button — absent, with one sentence saying why.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Record a payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /select all|mark .*paid/i })).not.toBeInTheDocument()
    expect(screen.getByRole('status'))
      .toHaveTextContent('Recording a payment on an account isn’t switched on yet.')

    // Reading the account is untouched.
    expect(screen.getByText('Recorded costs')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /£3,860/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Open .+ on / })).toHaveLength(4)
  })

  it('fails closed when the backend is too old to publish the capability', async () => {
    const user = userEvent.setup()
    await launch('book-money-settlement-unpublished')
    await gotoMoney(user)
    await openAccount(user)

    // No field means no settlement. Silence is not permission — an older backend
    // would 404 the write, and offering the button would be a lie either way.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Record a payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /select all|mark .*paid/i })).not.toBeInTheDocument()
    expect(screen.getByText('Recorded costs')).toBeInTheDocument()
  })

  it('withdraws the controls when the gate is switched off between read and write', async () => {
    const user = userEvent.setup()
    // The capability said yes; by the time the payment is sent, it is off. This
    // is the only case the write-failure handling exists for.
    await launch('book-money-settlement-revoked')
    await gotoMoney(user)
    await openAccount(user)

    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument()
    await user.click(tick('Timber, 3 packs'))
    await user.click(within(bar()).getByRole('button', { name: /^Mark .* paid$/ }))

    // No broken flow and no half-payment: the controls go, the explanation
    // arrives, and nothing was recorded.
    expect(await screen.findByRole('status'))
      .toHaveTextContent('Recording a payment on an account isn’t switched on yet.')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Record a payment' })).not.toBeInTheDocument()
    expect(bookMoney().accountPaymentHistory).toHaveLength(0)

    // And it is not offered again on the next account opened.
    await user.click(screen.getByRole('button', { name: /back to money/i }))
    await openAccount(user, 'Jewson')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('keeps an existing receipt readable after settlement is switched off', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await settle(user, ['Timber, 3 packs', 'Fence posts, 20'])
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: /back to money/i }))

    // The deployment turns settlement off after the payment was recorded; going
    // out to Book Home and back in re-reads the capability.
    _setMockSettlementGateForTesting('off')
    await user.click(screen.getByRole('button', { name: /back to the job book/i }))
    await screen.findByRole('heading', { name: 'The Job Book' })
    await user.click(await screen.findByRole('button', { name: /^Money/ }))
    await screen.findByRole('heading', { name: /^Money/ })

    // Reads stay open: the history row and its receipt are still reachable.
    const history = within(await screen.findByRole('region', { name: 'Account payment history' }))
    await user.click(history.getByRole('button', { name: /payment to Sydenhams$/ }))
    const dialog = within(await screen.findByRole('dialog', { name: /to Sydenhams$/ }))
    expect(dialog.getByText(/^Covers 2 recorded costs/)).toBeInTheDocument()

    // Its two writes are not offered, because the backend would refuse them.
    expect(dialog.queryByRole('button', { name: /^Undo this payment/ })).not.toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: /^Change payment date/ })).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('keeps cross-job Money fully readable with settlement off', async () => {
    const user = userEvent.setup()
    await launch('book-money-settlement-off')
    await gotoMoney(user)

    expect(screen.getByRole('region', { name: 'To pay on accounts' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Still to receive' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Costs with no price yet' })).toBeInTheDocument()

    // Source navigation, the whole point of the read-only page, still works.
    await openAccount(user, 'Jewson')
    await user.click(screen.getByRole('button', { name: /^Open Hardcore, 8 bags on Garden Room/ }))
    expect(await screen.findByTestId('workspace-screen')).toHaveAttribute('data-focus-item', 'mem-view-001')
  })

  it('an allocation opens the job it belongs to', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    await openAccount(user)
    await settle(user, ['Fence posts, 20'])

    await user.click(screen.getByRole('button', { name: /^Open Money for Whitmore Patio/ }))
    const workspace = await screen.findByTestId('workspace-screen')
    expect(workspace).toHaveAttribute('data-job-id', WHITMORE)
    expect(workspace).toHaveAttribute('data-section', 'money')
  })
})
