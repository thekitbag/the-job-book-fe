import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import { ToastProvider } from '../Toast'
import {
  createJobPayment, deleteJobPayment, deleteMoneyEvent, getBudgetSummary,
  getJobMoney, getMemoryView, markMoneyOut, patchJobPayment,
} from '../api'
import type { Job, JobMoneyResponse, MemoryViewItem, MoneyRow } from '../types'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
  getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-money-001', photos: [] })),
  getJobReceipts: vi.fn(() => Promise.resolve({ jobId: 'job-money-001', receipts: [] })),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn(() => Promise.resolve([])),
  getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-money-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
  getMemoryView: vi.fn(() => Promise.resolve({
    job: { id: 'job-money-001', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' },
    generatedAt: '',
    sections: [],
    stillToCheck: { count: 0, items: [] },
    costSummary: {
      orderedMaterials: { knownSpendAmount: '600', knownSpendCurrency: 'GBP', knownSpendLabel: '£600 known spend', includedMemoryItemIds: [], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [] },
      totalKnownCost: { knownSpendAmount: '600', knownSpendCurrency: 'GBP', knownSpendLabel: '£600 known spend', includedMemoryItemIds: [] },
    },
  })),
  getBudgetSummary: vi.fn(() => Promise.reject(new Error('no budget'))),
  patchJob: vi.fn(),
  patchCustomerTotal: vi.fn(),
  createJobPayment: vi.fn(),
  patchJobPayment: vi.fn(),
  deleteJobPayment: vi.fn(),
  getJobMoney: vi.fn(),
  markMoneyOut: vi.fn(),
  deleteMoneyEvent: vi.fn(),
  resolveApiUrl: (url: string) => url,
  ApiError: class ApiError extends Error { constructor(m: string, public status: number) { super(m) } },
}))

vi.mock('../analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../analytics')>()
  return { ...actual, track: vi.fn(), identifyAnalyticsUser: vi.fn(), resetAnalyticsUser: vi.fn() }
})

vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  getSupportedMimeType: () => 'audio/webm;codecs=opus',
  useRecorder: () => ({ state: 'idle', elapsedMs: 0, mimeType: 'audio/webm', permissionError: null, start: vi.fn(), stop: vi.fn() }),
}))

const JOB: Job = {
  id: 'job-money-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '',
}

function paymentRow(over: Partial<MoneyRow> = {}): MoneyRow {
  return {
    id: 'pay-1', jobId: JOB.id, direction: 'in', kind: 'customer_payment',
    amount: '1500', currency: 'GBP', amountLabel: '+£1500',
    occurredAt: '2026-07-06T12:00:00.000Z', note: 'Deposit', reference: null,
    sourceMemoryItemId: null, sourceItemLabel: null, sourceMemoryType: null,
    editable: true, removable: true, createdAt: '2026-07-06T12:00:00.000Z', updatedAt: '',
    ...over,
  }
}

function money(over: Partial<JobMoneyResponse> = {}): JobMoneyResponse {
  return {
    jobId: JOB.id, generatedAt: '',
    customerTotalAmount: null, customerTotalCurrency: null, customerTotalLabel: null,
    moneyInAmount: null, moneyInCurrency: null, moneyInLabel: null,
    moneyOutAmount: null, moneyOutCurrency: null, moneyOutLabel: null,
    stillOwedAmount: null, stillOwedCurrency: null, stillOwedLabel: null,
    overpaid: false, overpaidAmount: null, overpaidLabel: null,
    rows: [],
    ...over,
  }
}

const IN_AND_OUT = money({
  customerTotalAmount: '4200', customerTotalCurrency: 'GBP', customerTotalLabel: '£4200',
  moneyInAmount: '1500', moneyInCurrency: 'GBP', moneyInLabel: '£1,500 received',
  moneyOutAmount: '336', moneyOutCurrency: 'GBP', moneyOutLabel: '£336 paid out',
  stillOwedAmount: '2700', stillOwedCurrency: 'GBP', stillOwedLabel: '£2700 still owed',
  rows: [
    paymentRow(),
    { id: 'me-1', jobId: JOB.id, direction: 'out', kind: 'cost_paid', amount: '336', currency: 'GBP', amountLabel: '-£336', occurredAt: '2026-07-07T12:00:00.000Z', note: null, reference: null, sourceMemoryItemId: 'm1', sourceItemLabel: 'Cement', sourceMemoryType: 'ordered_material', sourceBudgetCategoryId: 'cat-materials', sourceBudgetCategoryName: 'Materials', editable: false, removable: true, createdAt: '', updatedAt: '' },
  ],
})

function renderWorkspace() {
  return render(
    <ToastProvider>
      <CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />
    </ToastProvider>,
  )
}

async function openMoney(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open Money' }))
  await screen.findByRole('tabpanel', { name: 'Money' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.mocked(getJobMoney).mockResolvedValue(IN_AND_OUT)
})

// ── Home card ─────────────────────────────────────────────────────────────────

describe('Money — job home card', () => {
  it('names the card Money, never Payments', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Money' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Open Payments' })).toBeNull()
  })

  it('shows plain in/out totals: received and paid out', async () => {
    renderWorkspace()
    const card = screen.getByRole('button', { name: 'Open Money' })
    await waitFor(() => expect(within(card).getByText('£1,500 received')).toBeInTheDocument())
    expect(within(card).getByText('£336 paid out')).toBeInTheDocument()
  })

  it('falls back quietly with no money movement', async () => {
    vi.mocked(getJobMoney).mockResolvedValue(money())
    renderWorkspace()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Money' })).toHaveTextContent('No money in or out yet'))
  })
})

// ── Section ─────────────────────────────────────────────────────────────────

describe('Money — section', () => {
  it('opens with the Money title, in/out totals and All/Money in/Money out filters', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    expect(screen.getByRole('heading', { name: 'Money' })).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: 'Money summary' })
    expect(within(hero).getByText('Money in')).toBeInTheDocument()
    expect(within(hero).getByText('£1,500')).toBeInTheDocument()
    expect(within(hero).getByText('Money out')).toBeInTheDocument()
    expect(within(hero).getByText('£336')).toBeInTheDocument()
    const tabs = screen.getByRole('tablist', { name: 'Money views' })
    expect(within(tabs).getByRole('tab', { name: 'All' })).toBeInTheDocument()
    expect(within(tabs).getByRole('tab', { name: 'Money in' })).toBeInTheDocument()
    expect(within(tabs).getByRole('tab', { name: 'Money out' })).toBeInTheDocument()
  })

  it('renders existing customer payments as Money in and paid costs as Money out', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    const list = screen.getByRole('tabpanel', { name: 'Money' })
    expect(within(list).getByText('Customer payment')).toBeInTheDocument()
    expect(within(list).getByText('+£1500')).toBeInTheDocument()
    expect(within(list).getByText(/Cement/)).toBeInTheDocument()
    expect(within(list).getByText('Materials')).toBeInTheDocument()
    expect(within(list).getByText('-£336')).toBeInTheDocument()
  })

  it('shows Uncategorised for a source-linked Money out row without category context', async () => {
    vi.mocked(getJobMoney).mockResolvedValue(money({
      moneyOutAmount: '80',
      moneyOutCurrency: 'GBP',
      rows: [{
        id: 'me-uncat', jobId: JOB.id, direction: 'out', kind: 'cost_paid',
        amount: '80', currency: 'GBP', amountLabel: '-£80',
        occurredAt: '2026-07-08T12:00:00.000Z', note: null, reference: null,
        sourceMemoryItemId: 'm-uncat', sourceItemLabel: 'Fixings',
        sourceMemoryType: 'ordered_material', sourceBudgetCategoryId: null,
        sourceBudgetCategoryName: null, editable: false, removable: true,
        createdAt: '', updatedAt: '',
      }],
    }))
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    expect(screen.getByText('Fixings')).toBeInTheDocument()
    expect(screen.getByText('Uncategorised')).toBeInTheDocument()
  })

  it('filters to Money in and Money out', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    await user.click(screen.getByRole('tab', { name: 'Money out' }))
    expect(screen.queryByText('+£1500')).toBeNull()
    expect(screen.getByText('-£336')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Money in' }))
    expect(screen.getByText('+£1500')).toBeInTheDocument()
    expect(screen.queryByText('-£336')).toBeNull()
  })

  it('adds a customer payment and refetches Money', async () => {
    vi.mocked(createJobPayment).mockResolvedValue({ id: 'pay-2', jobId: JOB.id, amount: '1000', currency: 'GBP', amountLabel: '£1000', paidAt: '', note: null, reference: null, createdAt: '', updatedAt: '' })
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    const before = vi.mocked(getJobMoney).mock.calls.length
    await user.click(screen.getByRole('button', { name: /add payment/i }))
    const form = screen.getByRole('form', { name: /save payment/i })
    expect(within(form).getByText(/money received from the customer/i)).toBeInTheDocument()
    await user.type(within(form).getByLabelText(/amount/i), '1000')
    await user.click(within(form).getByRole('button', { name: /save payment/i }))
    await waitFor(() => expect(createJobPayment).toHaveBeenCalledWith(JOB.id, expect.objectContaining({ amount: '1000' })))
    await waitFor(() => expect(vi.mocked(getJobMoney).mock.calls.length).toBeGreaterThan(before))
  })

  it('edits a customer payment through the prefilled sheet', async () => {
    vi.mocked(patchJobPayment).mockResolvedValue({ id: 'pay-1', jobId: JOB.id, amount: '1600', currency: 'GBP', amountLabel: '£1600', paidAt: '', note: null, reference: null, createdAt: '', updatedAt: '' })
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const form = screen.getByRole('form', { name: /save payment/i })
    const amount = within(form).getByLabelText(/amount/i) as HTMLInputElement
    expect(amount.value).toBe('1500')
    await user.clear(amount)
    await user.type(amount, '1600')
    await user.click(within(form).getByRole('button', { name: /save payment/i }))
    await waitFor(() => expect(patchJobPayment).toHaveBeenCalledWith(JOB.id, 'pay-1', expect.objectContaining({ amount: '1600' })))
  })

  it('deleting a customer payment needs confirmation, then calls DELETE', async () => {
    vi.mocked(deleteJobPayment).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteJobPayment).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(deleteJobPayment).toHaveBeenCalledWith(JOB.id, 'pay-1'))
  })

  it('removes a paid marker via the money-event endpoint (Money-only correction)', async () => {
    vi.mocked(deleteMoneyEvent).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWorkspace()
    await openMoney(user)
    await user.click(screen.getByRole('button', { name: /undo paid/i }))
    await user.click(screen.getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(deleteMoneyEvent).toHaveBeenCalledWith(JOB.id, 'me-1'))
    expect(await screen.findByText(/budget cost unchanged/i)).toBeInTheDocument()
  })
})

// ── Mark paid from Budget ─────────────────────────────────────────────────────

const COST_ITEM: MemoryViewItem = {
  id: 'm1', memoryType: 'ordered_material', summary: 'Cement', materialName: 'Cement',
  quantity: null, unit: null, supplierName: 'Jewson', deliveryTiming: null, locationOrUse: null,
  costAmount: null, costCurrency: 'GBP', costQualifier: null, totalCostAmount: '336',
  uncertaintyFlags: [], budgetCategoryId: null, sourceCandidateFactId: null, reviewDecisionId: null,
  createdAt: '', updatedAt: '', source: null,
}

function memoryWithCostItem() {
  return {
    job: { id: JOB.id, title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' },
    generatedAt: '', stillToCheck: { count: 0, items: [] },
    sections: [{ key: 'ordered_materials', label: 'Bought', items: [COST_ITEM] }],
    costSummary: {
      orderedMaterials: { knownSpendAmount: '336', knownSpendCurrency: 'GBP', knownSpendLabel: '£336', includedMemoryItemIds: ['m1'], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [{ memoryItemIds: ['m1'], itemLabel: 'Cement', lineTotalAmount: '336', lineTotalCurrency: 'GBP', lineTotalLabel: '£336' }] },
      totalKnownCost: { knownSpendAmount: '336', knownSpendCurrency: 'GBP', knownSpendLabel: '£336', includedMemoryItemIds: ['m1'] },
    },
  }
}

function budgetWithCostItem() {
  return {
    jobId: JOB.id, generatedAt: '', categories: [],
    uncategorized: { knownSpendAmount: '336', knownSpendCurrency: 'GBP', knownSpendLabel: '£336', rows: [{ memoryItemId: 'm1', memoryType: 'ordered_material', itemLabel: 'Cement', materialName: 'Cement', quantity: null, unit: null, lineTotalAmount: '336', lineTotalCurrency: 'GBP', lineTotalLabel: '£336' }] },
    totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: '336', knownSpendCurrency: 'GBP', remainingAmount: null, remainingLabel: null, overBudget: false },
  }
}

const OUT_ROW: MoneyRow = { id: 'me-9', jobId: JOB.id, direction: 'out', kind: 'cost_paid', amount: '336', currency: 'GBP', amountLabel: '-£336', occurredAt: '', note: null, reference: null, sourceMemoryItemId: 'm1', sourceItemLabel: 'Cement', sourceMemoryType: 'ordered_material', sourceBudgetCategoryId: null, sourceBudgetCategoryName: null, editable: false, removable: true, createdAt: '', updatedAt: '' }

async function openBudgetItem(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open Budget' }))
  await screen.findByRole('tabpanel', { name: 'Budget' })
  await user.click(await screen.findByRole('button', { name: /open actions for cement/i }))
  return within(screen.getByRole('dialog'))
}

describe('Money — mark paid from Budget', () => {
  beforeEach(() => {
    vi.mocked(getMemoryView).mockResolvedValue(memoryWithCostItem() as never)
    vi.mocked(getBudgetSummary).mockResolvedValue(budgetWithCostItem() as never)
  })

  it('offers Mark as paid on an eligible trusted GBP cost item, sends only the source id, and toasts Money out with Budget unchanged', async () => {
    // No paid marker yet for m1.
    vi.mocked(getJobMoney).mockResolvedValue(money({ moneyInAmount: null, rows: [] }))
    vi.mocked(markMoneyOut).mockResolvedValue(money({ moneyOutAmount: '336', moneyOutCurrency: 'GBP', rows: [OUT_ROW] }))
    const user = userEvent.setup()
    renderWorkspace()
    const budgetCallsBefore = vi.mocked(getBudgetSummary).mock.calls.length
    const d = await openBudgetItem(user)
    await user.click(d.getByRole('button', { name: /mark as paid/i }))
    await waitFor(() => expect(markMoneyOut).toHaveBeenCalledWith(JOB.id, { sourceMemoryItemId: 'm1' }))
    // FE must not send an amount.
    expect(vi.mocked(markMoneyOut).mock.calls[0][1]).not.toHaveProperty('amount')
    expect(await screen.findByText(/added £336 to money out\. budget cost unchanged\./i)).toBeInTheDocument()
    // Budget summary is refetched to confirm it did not change.
    await waitFor(() => expect(vi.mocked(getBudgetSummary).mock.calls.length).toBeGreaterThan(budgetCallsBefore))
  })

  it('shows a Paid state and no Mark as paid when the item already has a paid marker', async () => {
    vi.mocked(getJobMoney).mockResolvedValue(money({ moneyOutAmount: '336', rows: [OUT_ROW] }))
    const user = userEvent.setup()
    renderWorkspace()
    const d = await openBudgetItem(user)
    expect(d.getByText(/paid — recorded in money out/i)).toBeInTheDocument()
    expect(d.queryByRole('button', { name: /mark as paid/i })).toBeNull()
  })

  it('Undo paid from the Budget drawer soft-deletes the Money out and leaves Budget unchanged, with a toast', async () => {
    vi.mocked(getJobMoney).mockResolvedValue(money({ moneyOutAmount: '336', rows: [OUT_ROW] }))
    vi.mocked(deleteMoneyEvent).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWorkspace()
    const budgetCallsBefore = vi.mocked(getBudgetSummary).mock.calls.length
    const d = await openBudgetItem(user)
    await user.click(d.getByRole('button', { name: /undo paid/i }))
    // Undo targets the linked Money out event by id — never the Budget item.
    await waitFor(() => expect(deleteMoneyEvent).toHaveBeenCalledWith(JOB.id, 'me-9'))
    expect(await screen.findByText(/removed £336 from money out\. budget cost unchanged\./i)).toBeInTheDocument()
    // Budget refetched to confirm it did not change.
    await waitFor(() => expect(vi.mocked(getBudgetSummary).mock.calls.length).toBeGreaterThan(budgetCallsBefore))
  })
})

// ── Latest activity ───────────────────────────────────────────────────────────

describe('Money — latest activity', () => {
  it('shows a customer payment row that opens the Money workspace', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    const row = await screen.findByRole('button', { name: /payment: £1,500 received — deposit/i })
    await user.click(row)
    expect(screen.getByRole('heading', { name: 'Money' })).toBeInTheDocument()
  })
})
