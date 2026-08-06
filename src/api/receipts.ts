import type { JobReceipt, JobReceiptsResponse, PatchJobReceiptRequest, UploadJobReceiptRequest } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import { mockGetJobReceipts, mockPatchJobReceipt, mockRemoveJobReceipt, mockUploadJobReceipt } from './mock/receipts'

// Receipts and invoices are a separate collection from photos on purpose: the
// photos route must never return receipt evidence, so a receipt image can't
// leak into the Photos view.

// GET /api/jobs/:jobId/receipts — receipt/invoice evidence, newest first.
export async function getJobReceipts(jobId: string): Promise<JobReceiptsResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetJobReceipts(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/receipts`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/receipts → ${res.status}`, res.status)
  return res.json() as Promise<JobReceiptsResponse>
}

// POST /api/jobs/:jobId/receipts — multipart upload. File-only save is valid.
// The error code is preserved on the thrown ApiError so the form can say what
// was actually wrong with the file (type/size) instead of a generic failure.
export async function uploadJobReceipt(jobId: string, req: UploadJobReceiptRequest): Promise<JobReceipt> {
  if (USE_MOCK) {
    await delay(600)
    return mockUploadJobReceipt(jobId, req)
  }
  const form = new FormData()
  form.append('file', req.file, req.file.name || 'receipt')
  const descriptor = req.descriptor?.trim()
  if (descriptor) form.append('descriptor', descriptor)
  const res = await apiFetch(`/api/jobs/${jobId}/receipts`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string; message?: string }
    const err = new ApiError(body.message ?? `Receipt upload failed (${res.status})`, res.status) as ApiError & { code?: string }
    err.code = body.code
    throw err
  }
  return res.json() as Promise<JobReceipt>
}

// PATCH /api/jobs/:jobId/receipts/:receiptId — description only. There is no
// supplier, amount, purchase date, or spend link in this slice by design.
export async function patchJobReceipt(jobId: string, receiptId: string, req: PatchJobReceiptRequest): Promise<JobReceipt> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchJobReceipt(jobId, receiptId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/receipts/${receiptId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new ApiError(`PATCH receipt → ${res.status}`, res.status)
  return res.json() as Promise<JobReceipt>
}

// DELETE /api/jobs/:jobId/receipts/:receiptId — the record leaves the active
// list; the stored object is retained server-side. Budget/Money/source notes
// are untouched. Repeat delete → 404, matching photo/memory-item removal.
export async function removeJobReceipt(jobId: string, receiptId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    mockRemoveJobReceipt(jobId, receiptId)
    return
  }
  const res = await apiFetch(`/api/jobs/${jobId}/receipts/${receiptId}`, { method: 'DELETE' })
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Receipt not found', 404)
  if (!res.ok && res.status !== 204) throw new ApiError(`DELETE receipt → ${res.status}`, res.status)
}
