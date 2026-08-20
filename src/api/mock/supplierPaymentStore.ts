import type {
  BookMoneyJobStatus, BookMoneyJobStatusLabel, MoneyRow,
  SupplierAccountPaymentHistoryRow, SupplierAccountPaymentReceipt,
  SupplierPaymentJobAllocation, SupplierPaymentSourceLine,
} from '../../types'
import { hasMockSourceDate, mockSourceDate, mockSourceDateLabel } from './sourceDates'
import { mockAmountString, mockDayLabel, mockMoney } from './util'

// The mock's durable aggregate supplier payments.
//
// This module owns the state and every read derived from it, and deliberately
// imports nothing from the cross-job Money or job Money mocks — both of those
// read from here, so a payment recorded once is subtracted from the account,
// added to job Money and listed in history without any of the three modules
// re-deriving the others' arithmetic.
//
// A payment snapshots the source lines it covered at the moment it was made.
// That is what makes a receipt reconstructable after the supplier has dropped
// off the current unpaid list entirely.

export type MockSupplierPaymentLine = {
  sourceMemoryItemId: string
  jobId: string
  jobTitle: string
  jobStatus: BookMoneyJobStatus
  jobStatusLabel: BookMoneyJobStatusLabel
  itemLabel: string
  quantityLabel: string | null
  amount: string
  sourceDate: string | null
  sourceDateLabel: string | null
  budgetCategoryId: string | null
  budgetCategoryName: string | null
}

export type MockSupplierPayment = {
  id: string
  supplierName: string
  paidAt: string
  clientRequestId: string
  isDeleted: boolean
  createdAt: string
  lines: MockSupplierPaymentLine[]
}

let payments: MockSupplierPayment[] = []
let nextId = 1

export function _resetMockSupplierPaymentsForTesting(): void {
  payments = []
  nextId = 1
}

export function mockActiveSupplierPayments(): MockSupplierPayment[] {
  return payments.filter(p => !p.isDeleted)
}

export function mockFindSupplierPayment(id: string): MockSupplierPayment | undefined {
  return payments.find(p => p.id === id && !p.isDeleted)
}

export function mockFindSupplierPaymentByRequestId(clientRequestId: string): MockSupplierPayment | undefined {
  return payments.find(p => p.clientRequestId === clientRequestId && !p.isDeleted)
}

/**
 * Every source cost currently covered by an active aggregate payment. The
 * cross-job Money mock subtracts exactly this set from the supplier accounts,
 * which is why a settled cost leaves the account without anything editing the
 * source item itself — and why Undo puts it straight back.
 */
export function mockSettledSourceIds(): Set<string> {
  const ids = new Set<string>()
  for (const payment of mockActiveSupplierPayments()) {
    for (const line of payment.lines) ids.add(line.sourceMemoryItemId)
  }
  return ids
}

export function mockRecordSupplierPayment(input: {
  supplierName: string
  paidAt: string
  clientRequestId: string
  lines: MockSupplierPaymentLine[]
}): MockSupplierPayment {
  const payment: MockSupplierPayment = {
    id: `sap-${nextId++}`,
    supplierName: input.supplierName,
    paidAt: input.paidAt,
    clientRequestId: input.clientRequestId,
    isDeleted: false,
    createdAt: new Date().toISOString(),
    lines: input.lines,
  }
  payments.push(payment)
  return payment
}

export function mockSoftDeleteSupplierPayment(payment: MockSupplierPayment): void {
  payment.isDeleted = true
}

export function mockSetSupplierPaymentDate(payment: MockSupplierPayment, paidAt: string): void {
  payment.paidAt = paidAt
}

// ── Derived reads ───────────────────────────────────────────────────────────

function total(lines: MockSupplierPaymentLine[]): number {
  return lines.reduce((n, l) => n + parseFloat(l.amount), 0)
}

function jobIdsOf(payment: MockSupplierPayment): string[] {
  // First-appearance order, so a receipt lists jobs the way the account did.
  return [...new Set(payment.lines.map(l => l.jobId))]
}

/**
 * Money from the payment, dates from the source.
 *
 * The amount and what the payment covers are settled facts, frozen when the
 * payment was recorded. The purchase date is not: it describes the cost, not
 * the payment, so it is resolved live and a later correction to it shows here
 * on the next read without disturbing a single figure.
 *
 * The stored date is kept only as a fallback for a source the registry no
 * longer knows — a receipt outlives the account line it was built from.
 */
function toSourceLine(line: MockSupplierPaymentLine): SupplierPaymentSourceLine {
  const live = hasMockSourceDate(line.sourceMemoryItemId)
  const sourceDate = live ? mockSourceDate(line.sourceMemoryItemId) : line.sourceDate
  return {
    sourceMemoryItemId: line.sourceMemoryItemId,
    itemLabel: line.itemLabel,
    quantityLabel: line.quantityLabel,
    amount: line.amount,
    currency: 'GBP',
    amountLabel: mockMoney(parseFloat(line.amount)),
    sourceDate,
    sourceDateLabel: mockSourceDateLabel(sourceDate),
    budgetCategoryId: line.budgetCategoryId,
    budgetCategoryName: line.budgetCategoryName,
  }
}

function allocationsOf(payment: MockSupplierPayment): SupplierPaymentJobAllocation[] {
  return jobIdsOf(payment).map(jobId => {
    const jobLines = payment.lines.filter(l => l.jobId === jobId)
    const amount = total(jobLines)
    return {
      jobId,
      jobTitle: jobLines[0].jobTitle,
      jobStatus: jobLines[0].jobStatus,
      jobStatusLabel: jobLines[0].jobStatusLabel,
      amount: mockAmountString(amount),
      currency: 'GBP',
      // Money out, said as an outgoing: the job's share, never the whole payment
      // unless every covered cost happened to belong to that one job.
      amountLabel: `-${mockMoney(amount)}`,
      sourceLines: jobLines.map(toSourceLine),
    }
  })
}

export function mockBuildReceipt(payment: MockSupplierPayment): SupplierAccountPaymentReceipt {
  const amount = total(payment.lines)
  return {
    id: payment.id,
    supplierName: payment.supplierName,
    paidAt: payment.paidAt,
    paidAtLabel: mockDayLabel(payment.paidAt),
    totalAmount: mockAmountString(amount),
    currency: 'GBP',
    totalLabel: mockMoney(amount),
    costCount: payment.lines.length,
    jobCount: jobIdsOf(payment).length,
    budgetsUnchanged: true,
    isDeleted: payment.isDeleted,
    canUndo: !payment.isDeleted,
    canChangeDate: !payment.isDeleted,
    allocations: allocationsOf(payment),
  }
}

/** Account payment history: real aggregate payments only, newest first. */
export function mockSupplierPaymentHistory(): SupplierAccountPaymentHistoryRow[] {
  return mockActiveSupplierPayments()
    .map((payment): SupplierAccountPaymentHistoryRow => {
      const amount = total(payment.lines)
      return {
        id: payment.id,
        supplierName: payment.supplierName,
        paidAt: payment.paidAt,
        paidAtLabel: mockDayLabel(payment.paidAt),
        totalAmount: mockAmountString(amount),
        currency: 'GBP',
        totalLabel: mockMoney(amount),
        costCount: payment.lines.length,
        jobCount: jobIdsOf(payment).length,
      }
    })
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.id.localeCompare(a.id))
}

/**
 * One Money-out row per aggregate payment touching this job, worth that job's
 * selected costs only. The child paid markers are never rows of their own — if
 * they were, the job's Money out would count the same money twice.
 */
export function mockSupplierAllocationRows(jobId: string): MoneyRow[] {
  const rows: MoneyRow[] = []
  for (const payment of mockActiveSupplierPayments()) {
    const jobLines = payment.lines.filter(l => l.jobId === jobId)
    if (jobLines.length === 0) continue
    const amount = total(jobLines)
    rows.push({
      id: `sap-alloc-${payment.id}-${jobId}`,
      jobId,
      direction: 'out',
      kind: 'supplier_account_payment',
      amount: mockAmountString(amount),
      currency: 'GBP',
      amountLabel: `-${mockMoney(amount)}`,
      occurredAt: payment.paidAt,
      note: null,
      reference: null,
      sourceMemoryItemId: null,
      sourceItemLabel: null,
      sourceMemoryType: null,
      sourceBudgetCategoryId: null,
      sourceBudgetCategoryName: null,
      supplierAccountPaymentId: payment.id,
      supplierName: payment.supplierName,
      sourceMemoryItemIds: jobLines.map(l => l.sourceMemoryItemId),
      allocationSourceLabels: jobLines.map(l =>
        [l.itemLabel, l.quantityLabel].filter(Boolean).join(', ')),
      // Amount, supplier and membership are fixed once recorded; the only way
      // back is undoing the whole payment from its receipt.
      editable: false,
      removable: false,
      createdAt: payment.createdAt,
      updatedAt: payment.createdAt,
    })
  }
  return rows
}
