import type {
  CreateSupplierAccountPaymentRequest, PatchSupplierAccountPaymentRequest,
  SupplierAccountPaymentReceipt,
} from '../../types'
import { ApiError } from '../client'
import { mockGetBookMoney, mockSettlementGate } from './bookMoney'
import {
  mockBuildReceipt, mockFindSupplierPayment, mockFindSupplierPaymentByRequestId,
  mockRecordSupplierPayment, mockSetSupplierPaymentDate, mockSoftDeleteSupplierPayment,
  type MockSupplierPaymentLine,
} from './supplierPaymentStore'
import { mockNoonISO } from './util'

// Mock for the supplier-settlement endpoints.
//
// Eligibility is not re-implemented here: a cost is settleable exactly when it
// is still a line on that named supplier's current unpaid account, which is
// what GET /api/book/money already answers. Everything the account excludes —
// Supplier needed, missing prices, already-paid, £0, other users, archived jobs
// — is therefore excluded from settlement for free, and cannot drift apart from
// what the account screen showed.
//
// The selection is revalidated against a freshly read account on every attempt,
// which is what makes a stale selection fail whole rather than pay part of one.

function fail(message: string, status: number, code: string, extra?: Record<string, string>): never {
  const err = new ApiError(message, status) as ApiError & { code?: string }
  err.code = code
  Object.assign(err, extra ?? {})
  throw err
}

function endOfToday(): number {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function resolvePaidAt(paidAt: string | null | undefined): string {
  const iso = paidAt ? mockNoonISO(paidAt) : new Date().toISOString()
  const when = new Date(iso).getTime()
  if (Number.isNaN(when)) fail('That date could not be read', 400, 'INVALID_FIELD')
  // A payment cannot have been made tomorrow. Date-only values sit at noon, so
  // "today" is compared against the end of the day, not the current minute.
  if (when > endOfToday()) fail('A payment date cannot be in the future', 400, 'INVALID_FIELD')
  return iso
}

// Every settlement write passes through here first, mirroring the backend, whose
// gate lives in the service so no route can reach a write around it. The code
// and status are the backend's exact ones: 403 SUPPLIER_SETTLEMENT_DISABLED.
//
// Reads are deliberately NOT gated: a receipt recorded while the feature was on
// must not become unreachable when it is turned off.
function assertSettlementOn(): void {
  if (mockSettlementGate() !== 'on') {
    fail('Supplier account settlement is not enabled', 403, 'SUPPLIER_SETTLEMENT_DISABLED')
  }
}

export function mockCreateSupplierPayment(
  req: CreateSupplierAccountPaymentRequest,
): SupplierAccountPaymentReceipt {
  assertSettlementOn()
  // Idempotency first: a retry after an uncertain network answer must return the
  // payment already made, never make a second one.
  const existing = mockFindSupplierPaymentByRequestId(req.clientRequestId)
  if (existing) return mockBuildReceipt(existing)

  if (!req.sourceMemoryItemIds || req.sourceMemoryItemIds.length === 0) {
    fail('Tick what the payment covers', 400, 'MISSING_FIELD')
  }

  const group = mockGetBookMoney().toPayOnAccounts?.supplierGroups
    .find(g => g.groupId === req.supplierGroupId)
  if (!group || group.kind !== 'named_supplier' || group.supplierName !== req.supplierName) {
    fail('That supplier account is no longer on the book', 409, 'SUPPLIER_PAYMENT_STALE_SELECTION')
  }

  // Whole selection or nothing: one id that has moved job, changed price, been
  // paid elsewhere or left the account fails the entire payment before a single
  // line is written.
  const lines: MockSupplierPaymentLine[] = []
  for (const id of req.sourceMemoryItemIds) {
    const line = group.lines.find(l => l.sourceMemoryItemId === id)
    if (!line) {
      fail('This account changed', 409, 'SUPPLIER_PAYMENT_STALE_SELECTION')
    }
    lines.push({
      sourceMemoryItemId: line.sourceMemoryItemId,
      jobId: line.jobId,
      jobTitle: line.jobTitle,
      jobStatus: line.jobStatus,
      jobStatusLabel: line.jobStatusLabel,
      itemLabel: line.itemLabel,
      quantityLabel: line.quantityLabel,
      // The amount is taken from the account's current figure, never from the
      // request: there is no amount in the request to take it from.
      amount: line.amount,
      sourceDate: line.sourceDate,
      sourceDateLabel: line.sourceDateLabel,
      budgetCategoryId: line.budgetCategoryId,
      budgetCategoryName: line.budgetCategoryName,
    })
  }

  return mockBuildReceipt(mockRecordSupplierPayment({
    supplierName: req.supplierName,
    paidAt: resolvePaidAt(req.paidAt),
    clientRequestId: req.clientRequestId,
    lines,
  }))
}

export function mockGetSupplierPayment(paymentId: string): SupplierAccountPaymentReceipt {
  const payment = mockFindSupplierPayment(paymentId)
  if (!payment) fail('Payment not found', 404, 'SUPPLIER_PAYMENT_NOT_FOUND')
  return mockBuildReceipt(payment)
}

export function mockPatchSupplierPaymentDate(
  paymentId: string,
  req: PatchSupplierAccountPaymentRequest,
): SupplierAccountPaymentReceipt {
  assertSettlementOn()
  const payment = mockFindSupplierPayment(paymentId)
  if (!payment) fail('Payment not found', 404, 'SUPPLIER_PAYMENT_NOT_FOUND')
  // Date only. Amount, supplier, covered costs and allocations are untouched —
  // the receipt below is rebuilt from the same snapshot it was built from.
  mockSetSupplierPaymentDate(payment, resolvePaidAt(req.paidAt))
  return mockBuildReceipt(payment)
}

export function mockUndoSupplierPayment(paymentId: string): void {
  assertSettlementOn()
  const payment = mockFindSupplierPayment(paymentId)
  if (!payment) fail('Payment not found', 404, 'SUPPLIER_PAYMENT_NOT_FOUND')
  // Soft-delete the aggregate and every covered cost is unsettled with it: the
  // account, job Money and history are all derived from the active payments.
  mockSoftDeleteSupplierPayment(payment)
}
