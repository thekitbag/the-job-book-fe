import type {
  CreateSupplierAccountPaymentRequest,
  PatchSupplierAccountPaymentRequest,
  SupplierAccountPaymentReceipt,
} from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import {
  mockCreateSupplierPayment, mockGetSupplierPayment,
  mockPatchSupplierPaymentDate, mockUndoSupplierPayment,
} from './mock/supplierPayments'

// Supplier account settlement — the only write path in cross-job Money.
//
// One call records one real payment to one named supplier covering whole source
// costs across several jobs. The amount is derived by the backend from the ids
// sent; this module never sends a figure, and there is no partial-payment or
// manual-amount request shape for it to send one in.
//
// The receipt returned is authoritative: nothing here is treated as done until
// the backend has answered.

/**
 * Does this failure mean settlement is switched off rather than that this
 * particular payment was wrong?
 *
 * Settlement is gated by backend config while real-account validation is
 * outstanding, and the gate's exact shape is not yet fixed in the contract, so
 * this recognises the honest signals a gated deployment can give: a stated
 * feature code, "not implemented"/"unavailable" statuses, or — for create only —
 * the route simply not being mounted. A 404 on a specific payment id is a real
 * not-found and is never read as a gate.
 *
 * The point is narrow: never show Mike a broken payment flow because a server
 * he cannot see has the feature turned off.
 */
const UNAVAILABLE_CODES = new Set([
  'SUPPLIER_SETTLEMENT_UNAVAILABLE',
  'SUPPLIER_SETTLEMENT_DISABLED',
  'FEATURE_UNAVAILABLE',
  'FEATURE_DISABLED',
  'NOT_IMPLEMENTED',
])

export function isSettlementUnavailable(err: unknown, opts: { route?: boolean } = {}): boolean {
  const e = err as { code?: string; status?: number }
  if (e?.code && UNAVAILABLE_CODES.has(e.code)) return true
  if (e?.status === 501 || e?.status === 503) return true
  // Only where a 404 can only mean "no such endpoint", never "no such payment".
  return opts.route === true && e?.status === 404
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as {
    code?: string
    message?: string
    supplierAccountPaymentId?: string
  }
  const err = new ApiError(body.message ?? fallback, res.status) as ApiError & {
    code?: string
    supplierAccountPaymentId?: string
  }
  err.code = body.code
  err.supplierAccountPaymentId = body.supplierAccountPaymentId
  throw err
}

// POST /api/book/money/supplier-payments — all selected costs are paid, or none
// are. `clientRequestId` must be stable across retries of the same submit so a
// network-uncertain retry returns the existing receipt instead of paying twice.
export async function createSupplierPayment(
  req: CreateSupplierAccountPaymentRequest,
): Promise<SupplierAccountPaymentReceipt> {
  if (USE_MOCK) {
    await delay(400)
    return mockCreateSupplierPayment(req)
  }
  const res = await apiFetch('/api/book/money/supplier-payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not record the payment (${res.status})`)
  return res.json() as Promise<SupplierAccountPaymentReceipt>
}

// GET /api/book/money/supplier-payments/:paymentId — reconstructable long after
// the supplier has no unpaid costs left and has dropped off the account list.
export async function getSupplierPayment(paymentId: string): Promise<SupplierAccountPaymentReceipt> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetSupplierPayment(paymentId)
  }
  const res = await apiFetch(`/api/book/money/supplier-payments/${paymentId}`)
  if (!res.ok) await parseError(res, `Could not open the payment (${res.status})`)
  return res.json() as Promise<SupplierAccountPaymentReceipt>
}

// PATCH — date only. Moves the aggregate payment and every job allocation with
// it, so one payment never shows two dates.
export async function patchSupplierPaymentDate(
  paymentId: string,
  req: PatchSupplierAccountPaymentRequest,
): Promise<SupplierAccountPaymentReceipt> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchSupplierPaymentDate(paymentId, req)
  }
  const res = await apiFetch(`/api/book/money/supplier-payments/${paymentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not change the payment date (${res.status})`)
  return res.json() as Promise<SupplierAccountPaymentReceipt>
}

// DELETE — the complete payment. Every covered cost goes back to not paid; no
// single cost can be unlinked from it. The backend may answer with the deleted
// receipt or 204; either way the caller refetches the authoritative reads.
export async function undoSupplierPayment(paymentId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    mockUndoSupplierPayment(paymentId)
    return
  }
  const res = await apiFetch(`/api/book/money/supplier-payments/${paymentId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) await parseError(res, `Could not undo the payment (${res.status})`)
}
