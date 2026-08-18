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
 * Does this failure mean settlement is switched off, rather than that this
 * particular payment was wrong?
 *
 * `capabilities.supplierAccountSettlement` is the primary answer and is read
 * before anything is offered. This is the second line: the gate can be turned
 * off between the read and the write, and a deployment can be mid-restart.
 *
 * Matched on the code alone, never the status. The backend answers 403, which
 * is also the status for an ordinary ownership refusal — treating every 403 as
 * "feature off" would silently withdraw the whole flow the first time Mike
 * touched something that was not his.
 */
export const SETTLEMENT_DISABLED_CODE = 'SUPPLIER_SETTLEMENT_DISABLED'

export function isSettlementUnavailable(err: unknown): boolean {
  return (err as { code?: string })?.code === SETTLEMENT_DISABLED_CODE
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
