import type { QueueDecision, QueueDecisionResponse, ReviewQueue } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import { mockGetReviewQueue, mockSubmitQueueDecision } from './mock/reviewQueue'

// GET /api/jobs/:jobId/review-queue — all unresolved draft items for the job.
export async function getReviewQueue(jobId: string): Promise<ReviewQueue> {
  if (USE_MOCK) {
    await delay(500)
    return mockGetReviewQueue(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/review-queue`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/review-queue → ${res.status}`, res.status)
  return res.json() as Promise<ReviewQueue>
}

// POST /api/jobs/:jobId/review-queue-decisions — confirm, correct, or dismiss.
export async function submitQueueDecision(
  jobId: string,
  decision: QueueDecision,
): Promise<QueueDecisionResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockSubmitQueueDecision(jobId, decision)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/review-queue-decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
  })
  if (!res.ok) throw new ApiError(`POST /api/jobs/${jobId}/review-queue-decisions → ${res.status}`, res.status)
  return res.json() as Promise<QueueDecisionResponse>
}
