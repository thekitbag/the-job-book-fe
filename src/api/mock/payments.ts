import type { CreateJobPaymentRequest, JobPayment, JobPaymentsResponse, PatchCustomerTotalRequest, PatchJobPaymentRequest } from '../../types'
import { ApiError } from '../client'

// Stateful mock for customer payments — money in, fully separate from the
// mock memory/budget state so payments can never leak into known spend.
// The seed job starts with a customer total and one deposit so the pilot-like
// run shows a realistic Payments card; other jobs start empty.

const MOCK_SEED_JOB_ID = 'job-pilot-garden-room-001'

type MockPaymentState = {
  customerTotalAmount: string | null
  payments: JobPayment[]
}

let nextId = 1
const stateByJob = new Map<string, MockPaymentState>()

function seedState(jobId: string): MockPaymentState {
  if (jobId !== MOCK_SEED_JOB_ID) return { customerTotalAmount: null, payments: [] }
  return {
    customerTotalAmount: '4200',
    payments: [
      {
        id: 'mock-payment-1',
        jobId,
        amount: '1500',
        currency: 'GBP',
        amountLabel: '£1500',
        paidAt: '2026-07-06T12:00:00.000Z',
        note: 'Deposit',
        reference: null,
        createdAt: '2026-07-06T12:00:00.000Z',
        updatedAt: '2026-07-06T12:00:00.000Z',
      },
    ],
  }
}

function getState(jobId: string): MockPaymentState {
  let s = stateByJob.get(jobId)
  if (!s) { s = seedState(jobId); stateByJob.set(jobId, s) }
  return s
}

const round2 = (n: number) => String(Math.round(n * 100) / 100)

function summarize(jobId: string): JobPaymentsResponse {
  const s = getState(jobId)
  const active = [...s.payments].sort((a, b) =>
    b.paidAt.localeCompare(a.paidAt) || b.createdAt.localeCompare(a.createdAt))
  const paidNum = active.reduce((sum, p) => sum + parseFloat(p.amount), 0)
  const totalPaidAmount = active.length > 0 ? round2(paidNum) : null
  const totalNum = s.customerTotalAmount !== null ? parseFloat(s.customerTotalAmount) : null

  let stillOwedAmount: string | null = null
  let overpaid = false
  let overpaidAmount: string | null = null
  if (totalNum !== null) {
    const owed = totalNum - paidNum
    if (owed >= 0) stillOwedAmount = round2(owed)
    else { stillOwedAmount = '0'; overpaid = true; overpaidAmount = round2(-owed) }
  }

  return {
    jobId,
    generatedAt: new Date().toISOString(),
    customerTotalAmount: s.customerTotalAmount,
    customerTotalCurrency: s.customerTotalAmount !== null ? 'GBP' : null,
    customerTotalLabel: s.customerTotalAmount !== null ? `£${s.customerTotalAmount}` : null,
    totalPaidAmount,
    totalPaidCurrency: totalPaidAmount !== null ? 'GBP' : null,
    totalPaidLabel: totalPaidAmount !== null ? `£${totalPaidAmount} paid` : null,
    stillOwedAmount,
    stillOwedCurrency: stillOwedAmount !== null ? 'GBP' : null,
    stillOwedLabel: stillOwedAmount !== null ? `£${stillOwedAmount} still owed` : null,
    overpaid,
    overpaidAmount,
    overpaidLabel: overpaidAmount !== null ? `£${overpaidAmount} overpaid` : null,
    payments: active,
  }
}

function parsePaidAt(paidAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return `${paidAt}T12:00:00.000Z`
  return new Date(paidAt).toISOString()
}

function assertPositiveDecimal(value: string, field: string) {
  if (!/^\d+(\.\d+)?$/.test(value) || parseFloat(value) <= 0) {
    throw new ApiError(`${field} must be a positive amount`, 400)
  }
}

export function mockGetJobPayments(jobId: string): JobPaymentsResponse {
  return summarize(jobId)
}

export function mockPatchCustomerTotal(jobId: string, req: PatchCustomerTotalRequest): JobPaymentsResponse {
  if (req.customerTotalAmount !== null) assertPositiveDecimal(req.customerTotalAmount, 'customerTotalAmount')
  getState(jobId).customerTotalAmount = req.customerTotalAmount
  return summarize(jobId)
}

export function mockCreateJobPayment(jobId: string, req: CreateJobPaymentRequest): JobPayment {
  assertPositiveDecimal(req.amount, 'amount')
  const now = new Date().toISOString()
  const payment: JobPayment = {
    id: `mock-payment-${++nextId}`,
    jobId,
    amount: req.amount,
    currency: 'GBP',
    amountLabel: `£${req.amount}`,
    paidAt: parsePaidAt(req.paidAt),
    note: req.note?.trim() || null,
    reference: req.reference?.trim() || null,
    createdAt: now,
    updatedAt: now,
  }
  getState(jobId).payments.push(payment)
  return payment
}

export function mockPatchJobPayment(jobId: string, paymentId: string, req: PatchJobPaymentRequest): JobPayment {
  const s = getState(jobId)
  const payment = s.payments.find(p => p.id === paymentId)
  if (!payment) throw new ApiError('Payment not found', 404)
  if (req.amount !== undefined) {
    assertPositiveDecimal(req.amount, 'amount')
    payment.amount = req.amount
    payment.amountLabel = `£${req.amount}`
  }
  if (req.paidAt !== undefined) payment.paidAt = parsePaidAt(req.paidAt)
  if ('note' in req) payment.note = req.note?.trim() || null
  if ('reference' in req) payment.reference = req.reference?.trim() || null
  payment.updatedAt = new Date().toISOString()
  return { ...payment }
}

export function mockDeleteJobPayment(jobId: string, paymentId: string): void {
  const s = getState(jobId)
  const idx = s.payments.findIndex(p => p.id === paymentId)
  if (idx === -1) throw new ApiError('Payment not found', 404)
  s.payments.splice(idx, 1)
}

/** Test-only: reset all mock payment state. */
export function _resetMockPaymentsForTesting(): void {
  stateByJob.clear()
  nextId = 1
}
