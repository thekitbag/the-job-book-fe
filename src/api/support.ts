import type { BudgetSummaryResponse, InspectionData, JobPhotosResponse, MemoryViewResponse, ReviewQueue, SupportUserJobsResponse, SupportUsersResponse } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import {
  mockSupportBudgetSummary,
  mockSupportInspection,
  mockSupportMemoryView,
  mockSupportPhotos,
  mockSupportReviewQueue,
  mockSupportUserJobs,
  mockSupportUsers,
} from './mock/support'

// Founder Support Mode client — READ-ONLY by construction. These are the only
// functions that touch /api/internal/support/...; there are deliberately no
// support write functions, and normal write APIs stay scoped to the signed-in
// user. Every endpoint requires role INTERNAL (403 otherwise) and is audited
// server-side.

async function supportGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (res.status === 401) throw new ApiError('Unauthorized', 401)
  if (res.status === 403) throw new ApiError('Not authorised for support access', 403)
  if (res.status === 404) throw new ApiError('Not found', 404)
  if (!res.ok) throw new ApiError(`GET ${path} → ${res.status}`, res.status)
  return res.json() as Promise<T>
}

export async function getSupportUsers(): Promise<SupportUsersResponse> {
  if (USE_MOCK) { await delay(300); return mockSupportUsers() }
  return supportGet('/api/internal/support/users')
}

export async function getSupportUserJobs(targetUserId: string): Promise<SupportUserJobsResponse> {
  if (USE_MOCK) { await delay(300); return mockSupportUserJobs(targetUserId) }
  return supportGet(`/api/internal/support/users/${targetUserId}/jobs`)
}

export async function getSupportJobInspection(jobId: string): Promise<InspectionData> {
  if (USE_MOCK) { await delay(300); return mockSupportInspection(jobId) }
  return supportGet(`/api/internal/support/jobs/${jobId}/inspection`)
}

export async function getSupportMemoryView(jobId: string): Promise<MemoryViewResponse> {
  if (USE_MOCK) { await delay(300); return mockSupportMemoryView(jobId) }
  return supportGet(`/api/internal/support/jobs/${jobId}/memory-view`)
}

export async function getSupportBudgetSummary(jobId: string): Promise<BudgetSummaryResponse> {
  if (USE_MOCK) { await delay(300); return mockSupportBudgetSummary(jobId) }
  return supportGet(`/api/internal/support/jobs/${jobId}/budget-summary`)
}

export async function getSupportReviewQueue(jobId: string): Promise<ReviewQueue> {
  if (USE_MOCK) { await delay(300); return mockSupportReviewQueue(jobId) }
  return supportGet(`/api/internal/support/jobs/${jobId}/review-queue`)
}

export async function getSupportPhotos(jobId: string): Promise<JobPhotosResponse> {
  if (USE_MOCK) { await delay(300); return mockSupportPhotos(jobId) }
  return supportGet(`/api/internal/support/jobs/${jobId}/photos`)
}
