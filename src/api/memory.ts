import type { CreateMemoryItemRequest, MemoryItemEdit, MemoryViewItem, MemoryViewResponse, ReturnMaterialRequest, ReturnMaterialResponse } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import { mockAssignMemoryItemCategory, mockCreateMemoryItem, mockMemoryView, mockRemoveMemoryItem, mockReturnMemoryItem, mockUpdateMemoryItem, mockVerifyMemoryItem } from './mock/memory'

// GET /api/jobs/:jobId/memory-view — trusted memory for the job, grouped by section.
export async function getMemoryView(jobId: string): Promise<MemoryViewResponse> {
  if (USE_MOCK) {
    await delay(500)
    return mockMemoryView(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-view`)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`GET memory-view → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewResponse>
}

// PATCH /api/jobs/:jobId/memory-items/:memoryItemId — correct trusted memory in
// place. Returns the updated normalized memory item (memory-view item shape).
// Never creates a queue item, draft fact, or review decision.
export async function updateMemoryItem(
  jobId: string,
  memoryItemId: string,
  edit: MemoryItemEdit,
): Promise<MemoryViewItem> {
  if (USE_MOCK) {
    await delay(300)
    return mockUpdateMemoryItem(jobId, memoryItemId, edit)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edit),
  })
  if (res.status === 400) throw new ApiError('Invalid memory edit', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok) throw new ApiError(`PATCH memory-item → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewItem>
}

// POST /api/jobs/:jobId/memory-items/:memoryItemId/verify — mark a Worth-checking
// item as right: clears unresolvedFlags without touching structured fields or
// source candidate facts. Returns the normalized memory item.
export async function verifyMemoryItem(
  jobId: string,
  memoryItemId: string,
): Promise<{ uncertaintyFlags: string[] }> {
  if (USE_MOCK) {
    await delay(250)
    mockVerifyMemoryItem(jobId, memoryItemId)
    return { uncertaintyFlags: [] }
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}/verify`, {
    method: 'POST',
  })
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok) throw new ApiError(`POST verify memory-item → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewItem>
}

// POST /api/jobs/:jobId/memory-items — create a trusted manual memory item
// directly (no audio/transcription/extraction/review). Returns the normalized
// memory-view item (isManual: true, source: null, happenedAt).
export async function createMemoryItem(jobId: string, req: CreateMemoryItemRequest): Promise<MemoryViewItem> {
  if (USE_MOCK) {
    await delay(300)
    return mockCreateMemoryItem(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (res.status === 400) throw new ApiError('Invalid memory item', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`POST memory-item → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewItem>
}

// DELETE /api/jobs/:jobId/memory-items/:memoryItemId — remove a confirmed item
// from the active job record. Soft-remove server-side: the source note/audio/
// transcript and review trail are preserved; only the structured fact leaves
// the active views. Repeat delete → 404, matching payment delete.
export async function removeMemoryItem(jobId: string, memoryItemId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    mockRemoveMemoryItem(jobId, memoryItemId)
    return
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}`, { method: 'DELETE' })
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok && res.status !== 204) throw new ApiError(`DELETE memory-item → ${res.status}`, res.status)
}

// POST /api/jobs/:jobId/memory-items/:memoryItemId/return — move all or part of
// a Left over item to Returned, in one transaction. The source item must be an
// active leftover_material; returning more than is left over is a 400 that
// mutates nothing. Returns the new returned item and what's left over (null on
// a full return) — but the caller still refetches, because a trusted refund
// also moves job-level spend.
export async function returnMemoryItem(
  jobId: string,
  memoryItemId: string,
  req: ReturnMaterialRequest,
): Promise<ReturnMaterialResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockReturnMemoryItem(jobId, memoryItemId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (res.status === 400) throw new ApiError('Invalid return', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok) throw new ApiError(`POST return memory-item → ${res.status}`, res.status)
  return res.json() as Promise<ReturnMaterialResponse>
}

// PATCH /api/jobs/:jobId/memory-items/:memoryItemId — assign/clear category only.
export async function assignMemoryItemCategory(
  jobId: string,
  memoryItemId: string,
  budgetCategoryId: string | null,
): Promise<MemoryViewItem> {
  if (USE_MOCK) {
    await delay(250)
    return mockAssignMemoryItemCategory(jobId, memoryItemId, budgetCategoryId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budgetCategoryId }),
  })
  if (res.status === 400) throw new ApiError('Invalid category assignment', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Memory item not found', 404)
  if (!res.ok) throw new ApiError(`PATCH memory-item category → ${res.status}`, res.status)
  return res.json() as Promise<MemoryViewItem>
}
