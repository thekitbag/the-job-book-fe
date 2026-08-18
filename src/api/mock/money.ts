import type { JobMoneyResponse, MarkMoneyOutRequest, MemoryViewItem, MoneyRow } from '../../types'
import { deriveEachTotal, deriveHourlyTotal, type BudgetPaidMarker } from '../../memoryScan'
import { ApiError } from '../client'
import { findMockItem, mockBudgetCategoriesFor, mockSectionsFor } from './state'
import { mockGetJobPayments } from './payments'
import { mockActiveSupplierPayments, mockSupplierAllocationRows } from './supplierPaymentStore'

// Stateful mock for Money — the unified actual-movement read model.
//
// Customer payments are NOT stored here: they stay in the payments mock and are
// projected in as money-in rows, exactly as the real backend projects existing
// JobPayment records. Aggregate supplier-account allocations are not stored here
// either — they are projected in from the supplier-payment store. This mock owns
// only the job-local money events: cost_paid (money out) and refund (money in).
//
// Invariant this mock exists to protect: marking paid changes Money, never
// Budget — nothing here reads or writes memory/budget spend state.

type MoneyEvent = {
  id: string
  jobId: string
  direction: 'in' | 'out'
  kind: 'refund' | 'cost_paid'
  amount: string
  occurredAt: string
  note: string | null
  reference: string | null
  sourceMemoryItemId: string | null
  sourceItemLabel: string | null
  sourceMemoryType: string | null
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

let nextId = 1
const eventsByJob = new Map<string, MoneyEvent[]>()
let mockMoneyScenario = 'default'

function events(jobId: string): MoneyEvent[] {
  let e = eventsByJob.get(jobId)
  if (!e) {
    e = []
    eventsByJob.set(jobId, e)
    if (mockMoneyScenario === 'payment-state' && jobId === 'job-pilot-garden-room-001') {
      const now = new Date().toISOString()
      e.push(
        {
          id: 'mock-money-seed-cladding',
          jobId,
          direction: 'out',
          kind: 'cost_paid',
          amount: '600',
          occurredAt: now,
          note: null,
          reference: null,
          sourceMemoryItemId: 'mem-view-004',
          sourceItemLabel: 'plasterboard',
          sourceMemoryType: 'ordered_material',
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'mock-money-seed-electrics',
          jobId,
          direction: 'out',
          kind: 'cost_paid',
          amount: '40',
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
          note: null,
          reference: null,
          sourceMemoryItemId: 'mem-view-001',
          sourceItemLabel: 'hardcore',
          sourceMemoryType: 'ordered_material',
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'mock-money-seed-uncategorised',
          jobId,
          direction: 'out',
          kind: 'cost_paid',
          amount: '60',
          occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
          note: 'Historic plant payment',
          reference: null,
          sourceMemoryItemId: null,
          sourceItemLabel: 'Plant hire',
          sourceMemoryType: null,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        },
      )
    }
  }
  return e
}

const round2 = (n: number) => String(Math.round(n * 100) / 100)

// A trusted, safe GBP line total for a cost-bearing item, or null when it has
// none (missing/ambiguous price, non-GBP, worth-checking). Mirrors the backend
// "only trusted Budget cost items can be paid" rule.
function trustedLineTotal(item: MemoryViewItem): { amount: string; currency: 'GBP' } | null {
  if (item.memoryType !== 'ordered_material' && item.memoryType !== 'labour' && item.memoryType !== 'budget_cost') return null
  if ((item.uncertaintyFlags ?? []).length > 0) return null
  const currency = item.costCurrency || 'GBP'
  if (currency !== 'GBP') return null
  // Explicit total, else a bought line's each-total, else a labour hours × rate.
  const total = item.totalCostAmount ?? deriveEachTotal(item) ?? deriveHourlyTotal(item)
  if (!total || !(parseFloat(total) > 0)) return null
  return { amount: total, currency: 'GBP' }
}

export function assertMockPaidEligible(item: MemoryViewItem): { amount: string; currency: 'GBP' } {
  const line = trustedLineTotal(item)
  if (!line) {
    const err = new ApiError('This item can’t be marked paid', 400) as ApiError & { code?: string }
    err.code = 'INVALID_FIELD'
    throw err
  }
  return line
}

function itemLabel(item: MemoryViewItem): string {
  if (item.memoryType === 'labour') return item.labourTask?.trim() || item.labourPerson?.trim() || 'Labour'
  if (item.memoryType === 'budget_cost') return item.labourTask?.trim() || item.labourPerson?.trim() || item.materialName?.trim() || item.summary
  return item.materialName?.trim() || item.summary
}

function eventToRow(e: MoneyEvent): MoneyRow {
  // Category initialisation also applies the scenario's seeded assignments, so
  // it must happen before resolving the current source item.
  const categories = mockBudgetCategoriesFor(e.jobId)
  const source = e.sourceMemoryItemId ? findMockItem(mockSectionsFor(e.jobId), e.sourceMemoryItemId) : undefined
  const sourceCategory = source?.budgetCategoryId
    ? categories.find(c => c.id === source.budgetCategoryId && !c.isArchived)
    : undefined
  return {
    id: e.id,
    jobId: e.jobId,
    direction: e.direction,
    kind: e.kind,
    amount: e.amount,
    currency: 'GBP',
    amountLabel: `${e.direction === 'in' ? '+' : '-'}£${e.amount}`,
    occurredAt: e.occurredAt,
    note: e.note,
    reference: e.reference,
    sourceMemoryItemId: e.sourceMemoryItemId,
    sourceItemLabel: e.sourceItemLabel,
    sourceMemoryType: e.sourceMemoryType,
    sourceBudgetCategoryId: sourceCategory?.id ?? null,
    sourceBudgetCategoryName: sourceCategory?.name ?? null,
    editable: false,
    removable: e.kind === 'cost_paid',
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }
}

export function mockGetJobMoney(jobId: string): JobMoneyResponse {
  const pay = mockGetJobPayments(jobId)
  const active = events(jobId).filter(e => !e.isDeleted)

  // Customer payments → money-in rows, kind customer_payment.
  const paymentRows: MoneyRow[] = pay.payments.map(p => ({
    id: p.id,
    jobId,
    direction: 'in',
    kind: 'customer_payment',
    amount: p.amount,
    currency: 'GBP',
    amountLabel: `+£${p.amount}`,
    occurredAt: p.paidAt,
    note: p.note,
    reference: p.reference,
    sourceMemoryItemId: null,
    sourceItemLabel: null,
    sourceMemoryType: null,
    sourceBudgetCategoryId: null,
    sourceBudgetCategoryName: null,
    editable: true,
    removable: true,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }))

  // One row per aggregate supplier payment touching this job, worth this job's
  // covered costs only. The child paid markers behind it are not rows: showing
  // both would count the same money out twice.
  const allocationRows = mockSupplierAllocationRows(jobId)

  const rows = [...paymentRows, ...active.map(eventToRow), ...allocationRows].sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt),
  )

  const refundIn = active.filter(e => e.kind === 'refund').reduce((n, e) => n + parseFloat(e.amount), 0)
  const paymentsIn = pay.totalPaidAmount !== null ? parseFloat(pay.totalPaidAmount) : 0
  const inNum = paymentsIn + refundIn
  const outNum = active.filter(e => e.kind === 'cost_paid').reduce((n, e) => n + parseFloat(e.amount), 0)
    + allocationRows.reduce((n, r) => n + parseFloat(r.amount), 0)

  const moneyInAmount = rows.some(r => r.direction === 'in') ? round2(inNum) : null
  const moneyOutAmount = rows.some(r => r.direction === 'out') ? round2(outNum) : null

  return {
    jobId,
    generatedAt: new Date().toISOString(),
    // Customer total / still owed / overpaid keep their customer-payment
    // semantics; merchant refunds never reduce what the customer still owes.
    customerTotalAmount: pay.customerTotalAmount,
    customerTotalCurrency: pay.customerTotalCurrency,
    customerTotalLabel: pay.customerTotalLabel,
    moneyInAmount,
    moneyInCurrency: moneyInAmount !== null ? 'GBP' : null,
    moneyInLabel: moneyInAmount !== null ? `£${moneyInAmount} received` : null,
    moneyOutAmount,
    moneyOutCurrency: moneyOutAmount !== null ? 'GBP' : null,
    moneyOutLabel: moneyOutAmount !== null ? `£${moneyOutAmount} paid out` : null,
    stillOwedAmount: pay.stillOwedAmount,
    stillOwedCurrency: pay.stillOwedCurrency,
    stillOwedLabel: pay.stillOwedLabel,
    overpaid: pay.overpaid,
    overpaidAmount: pay.overpaidAmount,
    overpaidLabel: pay.overpaidLabel,
    rows,
  }
}

export function mockPaidMarkersBySource(jobId: string): ReadonlyMap<string, BudgetPaidMarker> {
  const paid = new Map<string, BudgetPaidMarker>()
  for (const event of events(jobId)) {
    if (!event.isDeleted && event.kind === 'cost_paid' && event.sourceMemoryItemId) {
      paid.set(event.sourceMemoryItemId, {
        moneyEventId: event.id,
        paidAt: event.occurredAt,
      })
    }
  }
  // A cost covered by a supplier account payment is paid in Budget's eyes too —
  // it just cannot be unpaid one line at a time.
  for (const payment of mockActiveSupplierPayments()) {
    for (const line of payment.lines) {
      if (line.jobId !== jobId) continue
      paid.set(line.sourceMemoryItemId, {
        moneyEventId: `sap-alloc-${payment.id}-${jobId}`,
        paidAt: payment.paidAt,
      })
    }
  }
  return paid
}

function parseOccurredAt(occurredAt: string | null | undefined): string {
  if (!occurredAt) return new Date().toISOString()
  // Date-only → UK local noon (kept simple as UTC noon in the mock).
  if (/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) return `${occurredAt}T12:00:00.000Z`
  return new Date(occurredAt).toISOString()
}

export function mockMarkMoneyOut(jobId: string, req: MarkMoneyOutRequest): JobMoneyResponse {
  const item = findMockItem(mockSectionsFor(jobId), req.sourceMemoryItemId)
  if (!item) throw new ApiError('Source item not found', 404)

  const line = assertMockPaidEligible(item)

  // One active paid-marker per source item — including the ones held by an
  // aggregate supplier payment, which own their costs until they are undone.
  const ownedBySupplierPayment = mockActiveSupplierPayments()
    .some(p => p.lines.some(l => l.sourceMemoryItemId === item.id))
  if (ownedBySupplierPayment) {
    const err = new ApiError('Undo the supplier payment to change this paid state', 400) as ApiError & { code?: string }
    err.code = 'SUPPLIER_PAYMENT_OWNS_COST'
    throw err
  }
  const existing = events(jobId).find(
    e => !e.isDeleted && e.kind === 'cost_paid' && e.sourceMemoryItemId === item.id,
  )
  if (existing) {
    const err = new ApiError('Already marked paid', 400) as ApiError & { code?: string }
    err.code = 'MONEY_EVENT_ALREADY_EXISTS'
    throw err
  }

  const now = new Date().toISOString()
  events(jobId).push({
    id: `mock-money-${++nextId}`,
    jobId,
    direction: 'out',
    kind: 'cost_paid',
    amount: line.amount,
    occurredAt: parseOccurredAt(req.occurredAt),
    note: req.note?.trim() || null,
    reference: req.reference?.trim() || null,
    sourceMemoryItemId: item.id,
    sourceItemLabel: itemLabel(item),
    sourceMemoryType: item.memoryType,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  })
  return mockGetJobMoney(jobId)
}

// Used by create-labour-with-paid-now after its source row is persisted.
export function recordMockPaid(jobId: string, item: MemoryViewItem): void {
  mockMarkMoneyOut(jobId, { sourceMemoryItemId: item.id })
}

export function mockDeleteMoneyEvent(jobId: string, moneyEventId: string): void {
  // An aggregate allocation is not a money event that can be removed on its
  // own. Name the payment that owns it so the caller can route to its receipt.
  const owner = mockActiveSupplierPayments().find(p => moneyEventId === `sap-alloc-${p.id}-${jobId}`)
  if (owner) {
    const err = new ApiError('Undo the supplier payment to change this paid state', 400) as ApiError & {
      code?: string
      supplierAccountPaymentId?: string
    }
    err.code = 'SUPPLIER_PAYMENT_OWNS_COST'
    err.supplierAccountPaymentId = owner.id
    throw err
  }
  const e = events(jobId).find(ev => ev.id === moneyEventId && !ev.isDeleted)
  if (!e) {
    const err = new ApiError('Money event not found', 404) as ApiError & { code?: string }
    err.code = 'MONEY_EVENT_NOT_FOUND'
    throw err
  }
  e.isDeleted = true
  e.updatedAt = new Date().toISOString()
}

// Called by the returned-material mock when a trusted GBP refund is recorded:
// one active refund money-in event per returned item, mirroring the backend.
export function recordMockRefund(jobId: string, returnedItem: MemoryViewItem): void {
  const amount = returnedItem.refundAmount
  if (!amount || (returnedItem.refundCurrency ?? 'GBP') !== 'GBP') return
  const dup = events(jobId).find(
    e => !e.isDeleted && e.kind === 'refund' && e.sourceMemoryItemId === returnedItem.id,
  )
  if (dup) return
  const now = new Date().toISOString()
  events(jobId).push({
    id: `mock-money-${++nextId}`,
    jobId,
    direction: 'in',
    kind: 'refund',
    amount,
    occurredAt: returnedItem.happenedAt ? parseOccurredAt(returnedItem.happenedAt) : now,
    note: null,
    reference: null,
    sourceMemoryItemId: returnedItem.id,
    sourceItemLabel: itemLabel(returnedItem),
    sourceMemoryType: returnedItem.memoryType,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  })
}

/** Test-only: reset all mock money-event state. */
export function _resetMockMoneyForTesting(scenario = 'default'): void {
  mockMoneyScenario = scenario
  eventsByJob.clear()
  nextId = 1
}
