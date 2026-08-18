import type {
  CreateManualWorkshopItemRequest,
  MoveLeftoverToWorkshopRequest,
  PatchWorkshopItemRequest,
  WorkshopActionResponse,
  WorkshopItem,
  WorkshopMoveResponse,
  WorkshopResponse,
} from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import {
  mockAddManualWorkshopItem, mockGetWorkshop, mockMoveLeftoverToWorkshop,
  mockPatchWorkshopItem, mockPutBackWorkshopItem, mockUndoWorkshopMove,
  mockWorkshopUsedUp, mockWorkshopWasntThere,
} from './mock/workshop'

// Workshop — availability memory across jobs.
//
// One read (`GET /api/workshop`) feeds both the Book Home row and the Workshop
// page, so the count on the cover and the list inside it come from the same
// response and can never disagree. The writes are all availability changes:
// none of them sends or receives a price, a Budget category or a paid state,
// because moving material between "on that job" and "in the workshop" is a
// classification of an existing memory, not a transaction.
//
// Every response is authoritative. Nothing here is treated as done — moved,
// used up, corrected, put back — until the backend has answered, so a failure
// can never leave the source job and the Workshop telling different stories.

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as { code?: string; message?: string }
  const err = new ApiError(body.message ?? fallback, res.status) as ApiError & { code?: string }
  err.code = body.code
  throw err
}

/**
 * Already in the Workshop — a second move of the same source leftover.
 *
 * Matched on the stable code rather than the 400 status, which every other
 * validation failure also uses. Worth distinguishing because it is not really
 * an error from Mike's side: the material is exactly where he wanted it.
 */
export const WORKSHOP_SOURCE_ALREADY_MOVED = 'WORKSHOP_SOURCE_ALREADY_MOVED'

export function isAlreadyInWorkshop(err: unknown): boolean {
  return (err as { code?: string })?.code === WORKSHOP_SOURCE_ALREADY_MOVED
}

// GET /api/workshop — currently available items, newest entered first, plus the
// Book Home summary built from those same first three.
export async function getWorkshop(): Promise<WorkshopResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetWorkshop()
  }
  const res = await apiFetch('/api/workshop')
  if (!res.ok) throw new ApiError(`GET /api/workshop → ${res.status}`, res.status)
  return res.json() as Promise<WorkshopResponse>
}

// POST /api/jobs/:jobId/memory-items/:memoryItemId/workshop — move a confirmed
// leftover in. Allowed from a Finished job, and it does not reopen that job.
export async function moveLeftoverToWorkshop(
  jobId: string,
  memoryItemId: string,
  req: MoveLeftoverToWorkshopRequest = {},
): Promise<WorkshopMoveResponse> {
  if (USE_MOCK) {
    await delay(400)
    return mockMoveLeftoverToWorkshop(jobId, memoryItemId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/memory-items/${memoryItemId}/workshop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not move it to the Workshop (${res.status})`)
  return res.json() as Promise<WorkshopMoveResponse>
}

// POST /api/workshop/items — material that never came from a recorded job.
// Name and rough words only: no job, supplier, price, category or location.
export async function createWorkshopItem(req: CreateManualWorkshopItemRequest): Promise<WorkshopItem> {
  if (USE_MOCK) {
    await delay(400)
    return mockAddManualWorkshopItem(req)
  }
  const res = await apiFetch('/api/workshop/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not add it to the Workshop (${res.status})`)
  return res.json() as Promise<WorkshopItem>
}

// PATCH /api/workshop/items/:id — "Change what's there". The rough amount is
// free text on the way in and on the way back out; blank means blank, not zero.
export async function patchWorkshopItem(
  workshopItemId: string,
  req: PatchWorkshopItemRequest,
): Promise<WorkshopItem> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchWorkshopItem(workshopItemId, req)
  }
  const res = await apiFetch(`/api/workshop/items/${workshopItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not change it (${res.status})`)
  return res.json() as Promise<WorkshopItem>
}

// The four availability outcomes. They are deliberately four calls, not one
// with a state argument: "I never moved it", "it's gone", "it was never there"
// and "put it back" mean different things to Mike and to the source job, and a
// shared endpoint would invite sharing the copy too.

// POST .../undo-move — the material belongs only to its source job after all.
export async function undoWorkshopMove(workshopItemId: string): Promise<WorkshopActionResponse> {
  return workshopAction(workshopItemId, 'undo-move', mockUndoWorkshopMove, 'Could not undo the move')
}

// POST .../used-up — it really was there, and it has been used.
export async function markWorkshopItemUsedUp(workshopItemId: string): Promise<WorkshopActionResponse> {
  return workshopAction(workshopItemId, 'used-up', mockWorkshopUsedUp, 'Could not mark it used up')
}

// POST .../wasnt-there — the availability memory was wrong. The original
// purchase, its cost and its Budget position are untouched by this.
export async function markWorkshopItemWasntThere(workshopItemId: string): Promise<WorkshopActionResponse> {
  return workshopAction(workshopItemId, 'wasnt-there', mockWorkshopWasntThere, 'Could not correct it')
}

// POST .../put-back — reactivates the same item, never a duplicate.
export async function putBackWorkshopItem(workshopItemId: string): Promise<WorkshopActionResponse> {
  return workshopAction(workshopItemId, 'put-back', mockPutBackWorkshopItem, 'Could not put it back')
}

async function workshopAction(
  workshopItemId: string,
  path: 'undo-move' | 'used-up' | 'wasnt-there' | 'put-back',
  mockFn: (id: string) => WorkshopActionResponse,
  fallback: string,
): Promise<WorkshopActionResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockFn(workshopItemId)
  }
  const res = await apiFetch(`/api/workshop/items/${workshopItemId}/${path}`, { method: 'POST' })
  if (!res.ok) await parseError(res, `${fallback} (${res.status})`)
  return res.json() as Promise<WorkshopActionResponse>
}
