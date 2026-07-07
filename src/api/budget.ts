import type { BudgetCategory, BudgetSummaryResponse, CreateBudgetCategoryRequest, PatchBudgetCategoryRequest } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import { mockBudgetSummary, mockCreateBudgetCategory, mockGetBudgetCategories, mockPatchBudgetCategory } from './mock/budget'

// ── Budget categories & summary ─────────────────────────────────────────────

// GET /api/jobs/:jobId/budget-categories — active categories only.
export async function getBudgetCategories(jobId: string): Promise<BudgetCategory[]> {
  if (USE_MOCK) {
    await delay(200)
    return mockGetBudgetCategories(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-categories`)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`GET budget-categories → ${res.status}`, res.status)
  return res.json() as Promise<BudgetCategory[]>
}

// POST /api/jobs/:jobId/budget-categories — create a category.
export async function createBudgetCategory(jobId: string, req: CreateBudgetCategoryRequest): Promise<BudgetCategory> {
  if (USE_MOCK) {
    await delay(250)
    return mockCreateBudgetCategory(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (res.status === 400) throw new ApiError('Invalid category', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`POST budget-category → ${res.status}`, res.status)
  return res.json() as Promise<BudgetCategory>
}

// PATCH /api/jobs/:jobId/budget-categories/:categoryId — edit or archive.
export async function patchBudgetCategory(jobId: string, categoryId: string, req: PatchBudgetCategoryRequest): Promise<BudgetCategory> {
  if (USE_MOCK) {
    await delay(250)
    return mockPatchBudgetCategory(jobId, categoryId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-categories/${categoryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (res.status === 400) throw new ApiError('Invalid category', 400)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Category not found', 404)
  if (!res.ok) throw new ApiError(`PATCH budget-category → ${res.status}`, res.status)
  return res.json() as Promise<BudgetCategory>
}

// GET /api/jobs/:jobId/budget-summary — backend-authoritative spend by category.
export async function getBudgetSummary(jobId: string): Promise<BudgetSummaryResponse> {
  if (USE_MOCK) {
    await delay(400)
    return mockBudgetSummary(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/budget-summary`)
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Job not found', 404)
  if (!res.ok) throw new ApiError(`GET budget-summary → ${res.status}`, res.status)
  return res.json() as Promise<BudgetSummaryResponse>
}
