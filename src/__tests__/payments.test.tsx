import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import { createJobPayment, deleteJobPayment, getJobPayments, patchCustomerTotal, patchJobPayment } from '../api'
import type { Job, JobPayment, JobPaymentsResponse } from '../types'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
  getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-pay-001', photos: [] })),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn(() => Promise.resolve([])),
  getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-pay-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
  getMemoryView: vi.fn(() => Promise.resolve({
    job: { id: 'job-pay-001', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' },
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
  getJobPayments: vi.fn(),
  patchCustomerTotal: vi.fn(),
  createJobPayment: vi.fn(),
  patchJobPayment: vi.fn(),
  deleteJobPayment: vi.fn(),
  resolveApiUrl: (url: string) => url,
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
  id: 'job-pay-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '',
}

function payment(overrides: Partial<JobPayment> = {}): JobPayment {
  return {
    id: 'pay-1', jobId: JOB.id, amount: '1500', currency: 'GBP', amountLabel: '£1500',
    paidAt: '2026-07-06T12:00:00.000Z', note: 'Deposit', reference: null,
    createdAt: '2026-07-06T12:00:00.000Z', updatedAt: '2026-07-06T12:00:00.000Z',
    ...overrides,
  }
}

function summary(overrides: Partial<JobPaymentsResponse> = {}): JobPaymentsResponse {
  return {
    jobId: JOB.id, generatedAt: '',
    customerTotalAmount: null, customerTotalCurrency: null, customerTotalLabel: null,
    totalPaidAmount: null, totalPaidCurrency: null, totalPaidLabel: null,
    stillOwedAmount: null, stillOwedCurrency: null, stillOwedLabel: null,
    overpaid: false, overpaidAmount: null, overpaidLabel: null,
    payments: [],
    ...overrides,
  }
}

const PAID_OF_TOTAL = summary({
  customerTotalAmount: '4200', customerTotalCurrency: 'GBP', customerTotalLabel: '£4200',
  totalPaidAmount: '1500', totalPaidCurrency: 'GBP', totalPaidLabel: '£1500 paid',
  stillOwedAmount: '2700', stillOwedCurrency: 'GBP', stillOwedLabel: '£2700 still owed',
  payments: [payment()],
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}

async function openPayments(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open Payments' }))
  await screen.findByRole('tabpanel', { name: 'Payments' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.mocked(getJobPayments).mockResolvedValue(PAID_OF_TOTAL)
})

// ── Home card ─────────────────────────────────────────────────────────────────

describe('Payments — job home card', () => {
  it('shows "No payments yet" with no payments and no total', async () => {
    vi.mocked(getJobPayments).mockResolvedValue(summary())
    renderWorkspace()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Payments' })).toHaveTextContent('No payments yet'))
  })

  it('shows received-only when paid with no customer total', async () => {
    vi.mocked(getJobPayments).mockResolvedValue(summary({
      totalPaidAmount: '1500', totalPaidCurrency: 'GBP', totalPaidLabel: '£1500 paid', payments: [payment()],
    }))
    renderWorkspace()
    const card = screen.getByRole('button', { name: 'Open Payments' })
    await waitFor(() => expect(card).toHaveTextContent('£1500 received'))
    expect(card).not.toHaveTextContent(/of £/)
  })

  it('shows "received of total" when the customer total is known', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Payments' })).toHaveTextContent('£1500 received of £4200'))
  })

  it('the Payments card is separate from the Spend card and never changes Spend context', async () => {
    renderWorkspace()
    const spend = screen.getByRole('button', { name: 'Open Spend' })
    await waitFor(() => expect(spend).toHaveTextContent('£600'))
    expect(spend).not.toHaveTextContent(/received/)
  })
})

// ── Workspace ─────────────────────────────────────────────────────────────────

describe('Payments — workspace', () => {
  it('opens from the home card with summary rows and history', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument()
    const panel = screen.getByRole('tabpanel', { name: 'Payments' })
    expect(within(panel).getByText('Customer total')).toBeInTheDocument()
    expect(within(panel).getByText('£4200')).toBeInTheDocument()
    expect(within(panel).getByText('Paid')).toBeInTheDocument()
    expect(within(panel).getByText('Still owed')).toBeInTheDocument()
    expect(within(panel).getByText('£2700')).toBeInTheDocument()
    // £1500 appears as the Paid summary value AND the history row amount
    expect(within(panel).getAllByText('£1500').length).toBeGreaterThanOrEqual(2)
    expect(within(panel).getByText(/deposit/i)).toBeInTheDocument()
    // Record stays global
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
  })

  it('shows the overpaid state instead of still owed', async () => {
    vi.mocked(getJobPayments).mockResolvedValue(summary({
      customerTotalAmount: '1000', customerTotalCurrency: 'GBP', customerTotalLabel: '£1000',
      totalPaidAmount: '1200', totalPaidCurrency: 'GBP', totalPaidLabel: '£1200 paid',
      stillOwedAmount: '0', stillOwedCurrency: 'GBP', stillOwedLabel: '£0 still owed',
      overpaid: true, overpaidAmount: '200', overpaidLabel: '£200 overpaid',
      payments: [payment({ amount: '1200', amountLabel: '£1200' })],
    }))
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    expect(screen.getByText(/£200 more than the customer total/i)).toBeInTheDocument()
    expect(screen.queryByText('Still owed')).not.toBeInTheDocument()
  })

  it('sets the customer total and adopts the returned summary', async () => {
    vi.mocked(getJobPayments).mockResolvedValue(summary())
    vi.mocked(patchCustomerTotal).mockResolvedValue(PAID_OF_TOTAL)
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    await user.click(screen.getByRole('button', { name: /set customer total/i }))
    const sheet = screen.getByRole('dialog', { name: /customer total/i })
    await user.type(within(sheet).getByRole('textbox', { name: /customer total/i }), '4200')
    await user.click(screen.getByRole('button', { name: /save total/i }))
    await waitFor(() => expect(patchCustomerTotal).toHaveBeenCalledWith(JOB.id, { customerTotalAmount: '4200' }))
    const panel = screen.getByRole('tabpanel', { name: 'Payments' })
    await waitFor(() => expect(within(panel).getAllByText('£4200').length).toBeGreaterThanOrEqual(1))
  })

  it('clears the customer total from the edit sheet', async () => {
    vi.mocked(patchCustomerTotal).mockResolvedValue(summary({
      totalPaidAmount: '1500', totalPaidLabel: '£1500 paid', totalPaidCurrency: 'GBP', payments: [payment()],
    }))
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    await user.click(screen.getByRole('button', { name: /edit customer total/i }))
    await user.click(screen.getByRole('button', { name: /clear total/i }))
    await waitFor(() => expect(patchCustomerTotal).toHaveBeenCalledWith(JOB.id, { customerTotalAmount: null }))
  })

  it('adds a payment with note and reference, defaulting the date to today', async () => {
    vi.mocked(createJobPayment).mockResolvedValue(payment({ id: 'pay-2' }))
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    await user.click(screen.getByRole('button', { name: /add payment/i }))
    const form = screen.getByRole('form', { name: /save payment/i })
    const dateInput = form.querySelector('input[name="paidAt"]') as HTMLInputElement
    expect(dateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/) // defaults to today
    await user.type(within(form).getByLabelText(/amount/i), '1000')
    await user.type(within(form).getByLabelText(/note/i), 'Stage payment')
    await user.type(within(form).getByLabelText(/reference/i), 'INV-014')
    await user.click(within(form).getByRole('button', { name: /save payment/i }))
    await waitFor(() => expect(createJobPayment).toHaveBeenCalledWith(JOB.id, expect.objectContaining({
      amount: '1000', note: 'Stage payment', reference: 'INV-014',
    })))
    // refetches the authoritative summary after the mutation
    expect(vi.mocked(getJobPayments).mock.calls.length).toBeGreaterThan(1)
  })

  it('a failed save keeps the form open with entered values and retryable copy', async () => {
    vi.mocked(createJobPayment).mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    await user.click(screen.getByRole('button', { name: /add payment/i }))
    const form = screen.getByRole('form', { name: /save payment/i })
    await user.type(within(form).getByLabelText(/amount/i), '1000')
    await user.click(within(form).getByRole('button', { name: /save payment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save the payment/i)
    expect((within(form).getByLabelText(/amount/i) as HTMLInputElement).value).toBe('1000')
  })

  it('edits a payment through the prefilled sheet', async () => {
    vi.mocked(patchJobPayment).mockResolvedValue(payment({ amount: '1600', amountLabel: '£1600' }))
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const form = screen.getByRole('form', { name: /save payment/i })
    const amountInput = within(form).getByLabelText(/amount/i) as HTMLInputElement
    expect(amountInput.value).toBe('1500') // prefilled
    await user.clear(amountInput)
    await user.type(amountInput, '1600')
    await user.click(within(form).getByRole('button', { name: /save payment/i }))
    await waitFor(() => expect(patchJobPayment).toHaveBeenCalledWith(JOB.id, 'pay-1', expect.objectContaining({ amount: '1600' })))
  })

  it('deleting a payment requires confirmation and only then calls DELETE', async () => {
    vi.mocked(deleteJobPayment).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteJobPayment).not.toHaveBeenCalled()
    expect(screen.getByText(/delete this payment\?/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(deleteJobPayment).toHaveBeenCalledWith(JOB.id, 'pay-1'))
  })

  it('cancelling the delete confirmation sends nothing', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(deleteJobPayment).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('payment mutations never touch spend/budget/memory summaries', async () => {
    const { getMemoryView, getBudgetSummary } = await import('../api')
    vi.mocked(createJobPayment).mockResolvedValue(payment({ id: 'pay-2' }))
    const user = userEvent.setup()
    renderWorkspace()
    await openPayments(user)
    const memoryCalls = vi.mocked(getMemoryView).mock.calls.length
    const budgetCalls = vi.mocked(getBudgetSummary).mock.calls.length
    await user.click(screen.getByRole('button', { name: /add payment/i }))
    const form = screen.getByRole('form', { name: /save payment/i })
    await user.type(within(form).getByLabelText(/amount/i), '1000')
    await user.click(within(form).getByRole('button', { name: /save payment/i }))
    await waitFor(() => expect(createJobPayment).toHaveBeenCalled())
    // money-in mutations do not refetch money-out summaries
    expect(vi.mocked(getMemoryView).mock.calls.length).toBe(memoryCalls)
    expect(vi.mocked(getBudgetSummary).mock.calls.length).toBe(budgetCalls)
    // and the Spend card still shows the same known spend
    await user.click(screen.getByRole('button', { name: /job home/i }))
    expect(screen.getByRole('button', { name: 'Open Spend' })).toHaveTextContent('£600')
  })
})

// ── Latest activity ───────────────────────────────────────────────────────────

describe('Payments — latest activity', () => {
  it('shows a Payment row on home that opens the Payments workspace', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    const row = await screen.findByRole('button', { name: /payment: £1500 received — deposit/i })
    expect(within(row).getByText('Payment')).toBeInTheDocument()
    await user.click(row)
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument()
  })
})
