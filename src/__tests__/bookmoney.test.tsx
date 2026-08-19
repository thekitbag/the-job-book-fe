import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { getJobs } from '../api'
import { _resetMockBookMoneyForTesting, mockGetBookMoney } from '../api/mock/bookMoney'
import { MOCK_JOBS } from '../api/mock/jobs'
import type { BookMoneyResponse, Job } from '../types'

// Cross-job Money, exercised against the mock read model rather than a
// hand-written fixture: the point of the slice is that Book Home and the Money
// page are the same backend response, so both are asserted against the response
// the app actually received. The job workspace below is stubbed and reports
// where it was opened, which is how source navigation is proved.

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return { ...actual, saveNote: vi.fn(), getNotesForJob: vi.fn(() => Promise.resolve([])) }
})

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  const mock = await import('../api/mock/bookMoney')
  return {
    getJobs: vi.fn(),
    createJob: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
    getCurrentUser: vi.fn(() => Promise.resolve({ id: 'u1', email: 'mike@test', name: 'Mike', role: 'PILOT' })),
    onUnauthorized: vi.fn(),
    ApiError: actual.ApiError,
    getBookMoney: vi.fn(() => Promise.resolve(mock.mockGetBookMoney())),
    // Workshop has its own suite (workshop.test.tsx). Here it is the empty
    // destination: the row exists, with no count and no preview.
    getWorkshop: vi.fn(() => Promise.resolve({
      generatedAt: '2026-08-18T09:00:00.000Z',
      bookHome: { showWorkshopRow: true, availableCount: 0, availableLabel: null, previewItems: [] },
      availableItems: [],
    })),
    // Settlement goes through the real client against the mock backend, so the
    // account these tests read is the account a payment would actually change.
    createSupplierPayment: actual.createSupplierPayment,
    getSupplierPayment: actual.getSupplierPayment,
    patchSupplierPaymentDate: actual.patchSupplierPaymentDate,
    undoSupplierPayment: actual.undoSupplierPayment,
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

const GARDEN = 'job-pilot-garden-room-001'
const KITCHEN = 'job-pilot-extension-002'

async function launch(scenario = 'default') {
  _resetMockBookMoneyForTesting(scenario)
  render(<App />)
  await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
}

async function gotoBookHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /the job book/i }))
  await screen.findByRole('heading', { name: 'The Job Book' })
}

async function gotoMoney(user: ReturnType<typeof userEvent.setup>) {
  await gotoBookHome(user)
  await user.click(await screen.findByRole('button', { name: /^Money/ }))
  await screen.findByRole('heading', { name: /^Money/ })
}

// The response the screens are being asserted against — same scenario, same
// builder, so a test can never assert a figure the app was never given.
function response(scenario = 'default'): BookMoneyResponse {
  _resetMockBookMoneyForTesting(scenario)
  return mockGetBookMoney()
}

describe('Cross-job Money (read-only)', () => {
  beforeEach(() => {
    mockGetJobs.mockResolvedValue(LIVE_JOBS)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  // ── Book Home Money row ───────────────────────────────────────────────────

  it("shows one Money row with both directions, on the backend's figures", async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)

    const row = await screen.findByRole('button', { name: /^Money/ })
    const data = response()
    expect(row).toHaveTextContent('Across all jobs')
    // The figures are the backend's; the words around them are this screen's,
    // shared with the Jobs and Workshop rows so the three read as one set.
    expect(row).toHaveTextContent(`${data.owedToMe!.totalLabel} still to receive`)
    expect(row).toHaveTextContent(`${data.toPayOnAccounts!.totalLabel} to pay on accounts`)
    expect(screen.getAllByText('Money')).toHaveLength(1)
  })

  it('shows only the direction the backend gave a label for', async () => {
    const user = userEvent.setup()
    await launch('book-money-owed-only')
    await gotoBookHome(user)

    const row = await screen.findByRole('button', { name: /^Money/ })
    expect(row).toHaveTextContent(`${response('book-money-owed-only').owedToMe!.totalLabel} still to receive`)
    expect(row).not.toHaveTextContent(/to pay on accounts/i)
  })

  it('omits the Money row entirely when the backend says not to show it', async () => {
    const user = userEvent.setup()
    await launch('book-money-none')
    await gotoBookHome(user)

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Money/ })).not.toBeInTheDocument())
    // and no £0 / "nothing owed" / settlement copy in its place
    expect(screen.queryByText(/£0/)).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing owed|nothing to pay|settled|all clear/i)).not.toBeInTheDocument()
  })

  it('says a cost needs a price when that is the only signal', async () => {
    const user = userEvent.setup()
    await launch('book-money-missing-price-only')
    await gotoBookHome(user)

    const row = await screen.findByRole('button', { name: /^Money/ })
    expect(row).toHaveTextContent('1 cost needs a price')
    expect(row).not.toHaveTextContent(/£0/)
  })

  it("Book Home's figures are the Money page's figures", async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)
    const data = response()

    const row = await screen.findByRole('button', { name: /^Money/ })
    expect(row).toHaveTextContent(data.toPayOnAccounts!.totalLabel!)

    await user.click(row)
    await screen.findByRole('heading', { name: /^Money/ })
    const toPay = within(screen.getByRole('region', { name: 'To pay on accounts' }))
    const owed = within(screen.getByRole('region', { name: 'Still to receive' }))
    expect(toPay.getByText(data.toPayOnAccounts!.totalLabel!)).toBeInTheDocument()
    // The owed total carries its job count on the same line ("£12,850 · 2 jobs").
    expect(owed.getByRole('heading', { name: 'Still to receive' }).parentElement)
      .toHaveTextContent(`${data.owedToMe!.totalLabel} · ${data.owedToMe!.jobCount} jobs`)
    // the row's labels are those same totals, spelled out
    expect(data.bookHome.toPayOnAccountsLabel).toContain(data.toPayOnAccounts!.totalLabel!)
    expect(data.bookHome.owedToMeLabel).toContain(data.owedToMe!.totalLabel)
  })

  // ── Money overview ────────────────────────────────────────────────────────

  it('is two ruled sections with no tabs', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    expect(screen.getByText('Across all jobs')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'To pay on accounts' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Still to receive' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('omits an empty direction rather than showing it at zero', async () => {
    const user = userEvent.setup()
    await launch('book-money-to-pay-only')
    await gotoMoney(user)

    expect(screen.getByRole('region', { name: 'To pay on accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Still to receive' })).not.toBeInTheDocument()
    expect(screen.queryByText(/£0/)).not.toBeInTheDocument()
  })

  it('lists supplier accounts with the backend totals and counts', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    const toPay = response().toPayOnAccounts!

    const section = within(screen.getByRole('region', { name: 'To pay on accounts' }))
    // The summary line is the backend's, stacked at its own separators.
    for (const part of toPay.summaryLabel.split(' · ')) {
      expect(section.getByText(part)).toBeInTheDocument()
    }
    for (const group of toPay.supplierGroups) {
      const row = section.getByRole('button', { name: new RegExp(`^Open ${escape(group.displayName)},`) })
      expect(row).toHaveTextContent(group.totalLabel)
      expect(row).toHaveTextContent(group.jobContextLabel)
    }
    // supplier name variants are three accounts, not one
    expect(section.getByRole('button', { name: /^Open Sydenhams,/ })).toBeInTheDocument()
    expect(section.getByRole('button', { name: /^Open Sydenham's,/ })).toBeInTheDocument()
    expect(section.getByRole('button', { name: /^Open Sydenhams Ltd,/ })).toBeInTheDocument()
  })

  it('keeps a cost with no supplier in the total, under Supplier needed', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    const needed = response().toPayOnAccounts!.supplierGroups.find(g => g.kind === 'supplier_needed')!
    const row = screen.getByRole('button', { name: new RegExp('^Open Supplier needed,') })
    expect(row).toHaveTextContent(needed.totalLabel)
    // it is a group, never a fabricated supplier name
    expect(needed.supplierName).toBeNull()
  })

  it('shows missing-price costs outside the total, never as £0', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    const toPay = response().toPayOnAccounts!

    const block = within(screen.getByRole('group', { name: /no price yet/i }))
    expect(screen.getByText(`${toPay.missingPriceItems.length} costs have no price yet`)).toBeInTheDocument()
    for (const item of toPay.missingPriceItems) {
      expect(block.getByRole('button', { name: new RegExp(`Add price for ${item.itemLabel}`) }))
        .toHaveTextContent(item.reasonLabel)
    }
    // the total is the priced total only
    expect(block.queryByText(/£0/)).not.toBeInTheDocument()
  })

  // Settlement (see supplierSettlement.test.tsx) added exactly one write to this
  // page: marking selected costs on a NAMED account paid. Everything else the
  // read-only slice refused is still refused.
  it('has no settlement controls on the overview, and never a rename or merge', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /select all|mark .*paid/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/tick what a payment covers|nothing selected|on the account/i)).not.toBeInTheDocument()

    // Not on the overview, and not inside an account either — correcting a
    // supplier name is a source-item correction, not an account operation.
    expect(screen.queryByRole('button', { name: /rename or merge/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Open Sydenhams,/ }))
    await screen.findByRole('heading', { name: /Sydenhams/ })
    expect(screen.queryByRole('button', { name: /rename or merge|reconcile|settle/i })).not.toBeInTheDocument()
  })

  // ── Supplier detail ───────────────────────────────────────────────────────

  it('opens an account with its recorded costs, oldest first', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)
    const group = response().toPayOnAccounts!.supplierGroups.find(g => g.displayName === 'Sydenhams')!

    await user.click(screen.getByRole('button', { name: /^Open Sydenhams,/ }))

    expect(await screen.findByRole('heading', { name: new RegExp(group.totalLabel) })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${group.purchaseCount} purchases · ${group.jobContextLabel}`))).toBeInTheDocument()

    const rows = screen.getAllByRole('button', { name: /^Open .+ on / })
    expect(rows.map(r => r.querySelector('.bm-row-name')?.textContent))
      .toEqual(group.lines.map(l => [l.itemLabel, l.quantityLabel].filter(Boolean).join(', ')))
    // oldest first, as the backend ordered them
    const dates = group.lines.map(l => l.sourceDate!)
    expect([...dates].sort()).toEqual(dates)
    // a finished job says so, because the account outlives the job
    expect(rows.some(r => r.textContent?.includes('finished job'))).toBe(true)

    await user.click(screen.getByRole('button', { name: /back to money/i }))
    expect(await screen.findByRole('region', { name: 'To pay on accounts' })).toBeInTheDocument()
  })

  it('keeps long supplier, job and item names whole', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    // The longest job name in the book rides on a supplier line; nothing is
    // truncated in markup (wrapping is CSS's job, checked at phone width).
    await user.click(screen.getByRole('button', { name: /^Open Travis Perkins,/ }))
    const row = await screen.findByRole('button', { name: /^Open Skirting, 12 lengths on / })
    expect(row).toHaveTextContent('Full re-roof and rear extension at the Hollybush Farmhouse annexe')
  })

  // ── Source navigation ─────────────────────────────────────────────────────

  it('a supplier line opens the source job and focuses the source item', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    await user.click(screen.getByRole('button', { name: /^Open Jewson,/ }))
    await user.click(await screen.findByRole('button', { name: /^Open Hardcore, 8 bags on Garden Room/ }))

    // The job is opened with the source item named. Which lens shows that item
    // is the job's own decision (see CurrentJobWorkspace), proved end to end in
    // e2e/cross-job-money.spec.ts against the real workspace.
    const ws = await screen.findByTestId('workspace-screen')
    expect(ws).toHaveAttribute('data-job-id', GARDEN)
    expect(ws).toHaveAttribute('data-focus-item', 'mem-view-001')
  })

  it('a missing-price cost routes to its source item for correction', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    await user.click(screen.getByRole('button', { name: /Add price for Ballast/ }))

    const ws = await screen.findByTestId('workspace-screen')
    expect(ws).toHaveAttribute('data-job-id', KITCHEN)
    expect(ws).toHaveAttribute('data-focus-item', 'mem-x-kitchen-4')
  })

  it('an owed row opens that job’s Money view', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    await user.click(screen.getByRole('button', { name: /Open Money for Kitchen Extension/ }))

    const ws = await screen.findByTestId('workspace-screen')
    expect(ws).toHaveAttribute('data-job-id', KITCHEN)
    expect(ws).toHaveAttribute('data-section', 'money')
    expect(ws).toHaveAttribute('data-focus-item', '')
  })

  it('leaves the entry behind once the job is opened normally again', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    await user.click(screen.getByRole('button', { name: /Open Money for Kitchen Extension/ }))
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-section', 'money'))

    // Opening the same job the ordinary way — through the job index — lands on
    // job home, not back on the Money section the entry sent him to.
    await gotoBookHome(user)
    await user.click(screen.getByRole('button', { name: /^Jobs/ }))
    await user.click(await screen.findByRole('button', { name: /Kitchen Extension/ }))
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-section', 'home'))
  })

  it('only omits owed jobs the backend left out — paid up, overpaid, archived', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoMoney(user)

    const owed = within(screen.getByRole('region', { name: 'Still to receive' }))
    expect(owed.getByRole('button', { name: /Open Money for Kitchen Extension/ })).toBeInTheDocument()
    expect(owed.queryByRole('button', { name: /Open Money for Garden Room/ })).not.toBeInTheDocument()
    expect(owed.queryByRole('button', { name: /Open Money for Grant James Roof/ })).not.toBeInTheDocument()
    expect(owed.queryByRole('button', { name: /Old Shed Rebuild/ })).not.toBeInTheDocument()
    expect(owed.queryByText(/-£|minus/i)).not.toBeInTheDocument()
  })
})

// RegExp-safe supplier names ("Sydenham's" is fine, but a name could contain
// regex punctuation).
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
