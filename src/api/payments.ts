import type {
  CreateJobPaymentRequest,
  JobPayment,
  JobPaymentsResponse,
  PatchCustomerTotalRequest,
  PatchJobPaymentRequest,
} from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import {
  mockCreateJobPayment,
  mockDeleteJobPayment,
  mockGetJobPayments,
  mockPatchCustomerTotal,
  mockPatchJobPayment,
} from './mock/payments'

// Customer payments: money in. Nothing here touches spend/budget/memory
// summaries — the two directions stay separate all the way down.

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as { code?: string; message?: string }
  const err = new ApiError(body.message ?? fallback, res.status) as ApiError & { code?: string }
  err.code = body.code
  throw err
}

// GET /api/jobs/:jobId/payments — summary + active history, newest first.
export async function getJobPayments(jobId: string): Promise<JobPaymentsResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetJobPayments(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/payments`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/payments → ${res.status}`, res.status)
  return res.json() as Promise<JobPaymentsResponse>
}

// PATCH /api/jobs/:jobId/payments/customer-total — null clears the total.
export async function patchCustomerTotal(jobId: string, req: PatchCustomerTotalRequest): Promise<JobPaymentsResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchCustomerTotal(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/payments/customer-total`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not save the customer total (${res.status})`)
  return res.json() as Promise<JobPaymentsResponse>
}

// POST /api/jobs/:jobId/payments
export async function createJobPayment(jobId: string, req: CreateJobPaymentRequest): Promise<JobPayment> {
  if (USE_MOCK) {
    await delay(300)
    return mockCreateJobPayment(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not save the payment (${res.status})`)
  return res.json() as Promise<JobPayment>
}

// PATCH /api/jobs/:jobId/payments/:paymentId
export async function patchJobPayment(jobId: string, paymentId: string, req: PatchJobPaymentRequest): Promise<JobPayment> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchJobPayment(jobId, paymentId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/payments/${paymentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not save the payment (${res.status})`)
  return res.json() as Promise<JobPayment>
}

// DELETE /api/jobs/:jobId/payments/:paymentId — soft delete server-side.
export async function deleteJobPayment(jobId: string, paymentId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    mockDeleteJobPayment(jobId, paymentId)
    return
  }
  const res = await apiFetch(`/api/jobs/${jobId}/payments/${paymentId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) await parseError(res, `Could not delete the payment (${res.status})`)
}

// GET /api/internal/support/jobs/:jobId/payments — read-only support view.
export async function getSupportJobPayments(jobId: string): Promise<JobPaymentsResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetJobPayments(jobId)
  }
  const res = await apiFetch(`/api/internal/support/jobs/${jobId}/payments`)
  if (!res.ok) throw new ApiError(`GET support payments → ${res.status}`, res.status)
  return res.json() as Promise<JobPaymentsResponse>
}
