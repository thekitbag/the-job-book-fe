import type { JobMoneyResponse, MarkMoneyOutRequest } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import {
  mockDeleteMoneyEvent,
  mockGetJobMoney,
  mockMarkMoneyOut,
} from './mock/money'

// Money: the unified actual-movement read model. Displayed totals/history come
// from GET /money; customer-payment mutations still go through the existing
// payments endpoints (see ./payments) for compatibility — Money is the source
// of truth for what is shown, not for how customer payments are written.

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as { code?: string; message?: string }
  const err = new ApiError(body.message ?? fallback, res.status) as ApiError & { code?: string }
  err.code = body.code
  throw err
}

// GET /api/jobs/:jobId/money — totals + combined history, newest first.
export async function getJobMoney(jobId: string): Promise<JobMoneyResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetJobMoney(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/money`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/money → ${res.status}`, res.status)
  return res.json() as Promise<JobMoneyResponse>
}

// POST /api/jobs/:jobId/money/out — mark a trusted Budget cost item as paid.
// Amount is derived server-side; FE sends only the source item. A duplicate
// active paid-marker comes back as 400 MONEY_EVENT_ALREADY_EXISTS.
export async function markMoneyOut(jobId: string, req: MarkMoneyOutRequest): Promise<JobMoneyResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockMarkMoneyOut(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/money/out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not mark as paid (${res.status})`)
  return res.json() as Promise<JobMoneyResponse>
}

// DELETE /api/jobs/:jobId/money/events/:moneyEventId — soft-delete a money
// event (e.g. undo a paid marker). Money-only correction; never touches the
// source Budget item.
export async function deleteMoneyEvent(jobId: string, moneyEventId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    mockDeleteMoneyEvent(jobId, moneyEventId)
    return
  }
  const res = await apiFetch(`/api/jobs/${jobId}/money/events/${moneyEventId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) await parseError(res, `Could not remove the entry (${res.status})`)
}

// GET /api/internal/support/jobs/:jobId/money — read-only support view.
export async function getSupportJobMoney(jobId: string): Promise<JobMoneyResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetJobMoney(jobId)
  }
  const res = await apiFetch(`/api/internal/support/jobs/${jobId}/money`)
  if (!res.ok) throw new ApiError(`GET support money → ${res.status}`, res.status)
  return res.json() as Promise<JobMoneyResponse>
}
