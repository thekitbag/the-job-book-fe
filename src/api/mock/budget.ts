import type { BudgetCategory, BudgetSummaryResponse, CreateBudgetCategoryRequest, PatchBudgetCategoryRequest } from '../../types'
import { deriveBudgetSummary } from '../../memoryScan'
import { ApiError } from '../client'
import { mockBudgetCategoriesFor, mockSectionsFor } from './state'

let mockCategorySeq = 0

export function mockGetBudgetCategories(jobId: string): BudgetCategory[] {
  return mockBudgetCategoriesFor(jobId).filter(c => !c.isArchived).map(c => ({ ...c }))
}

export function mockCreateBudgetCategory(jobId: string, req: CreateBudgetCategoryRequest): BudgetCategory {
  const cats = mockBudgetCategoriesFor(jobId)
  const name = (req.name ?? '').trim()
  if (!name) throw new ApiError('Category name is required', 400)
  const now = new Date().toISOString()
  const hasBudget = req.budgetAmount != null && req.budgetAmount !== ''
  const created: BudgetCategory = {
    id: `cat-new-${++mockCategorySeq}`,
    jobId,
    name,
    budgetAmount: hasBudget ? req.budgetAmount! : null,
    budgetCurrency: hasBudget ? (req.budgetCurrency ?? 'GBP') : null,
    sortOrder: req.sortOrder ?? cats.length,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  }
  cats.push(created)
  return { ...created }
}

export function mockPatchBudgetCategory(jobId: string, categoryId: string, req: PatchBudgetCategoryRequest): BudgetCategory {
  const cats = mockBudgetCategoriesFor(jobId)
  const cat = cats.find(c => c.id === categoryId)
  if (!cat) throw new ApiError('Category not found', 404)
  if (req.name !== undefined) {
    const name = req.name.trim()
    if (!name) throw new ApiError('Category name is required', 400)
    cat.name = name
  }
  if (req.budgetAmount !== undefined) {
    const hasBudget = req.budgetAmount != null && req.budgetAmount !== ''
    cat.budgetAmount = hasBudget ? req.budgetAmount : null
    cat.budgetCurrency = hasBudget ? (req.budgetCurrency ?? cat.budgetCurrency ?? 'GBP') : null
  }
  if (req.sortOrder !== undefined) cat.sortOrder = req.sortOrder
  if (req.isArchived) {
    cat.isArchived = true
    // Archiving clears existing assignments so the spend moves to Uncategorised.
    const sections = mockSectionsFor(jobId)
    for (const s of sections) for (const it of s.items) {
      if (it.budgetCategoryId === categoryId) it.budgetCategoryId = null
    }
  }
  cat.updatedAt = new Date().toISOString()
  return { ...cat }
}

export function mockBudgetSummary(jobId: string): BudgetSummaryResponse {
  return deriveBudgetSummary(jobId, mockSectionsFor(jobId), mockBudgetCategoriesFor(jobId))
}
