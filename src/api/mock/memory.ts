import type { CreateMemoryItemRequest, MemoryItemEdit, MemoryViewItem, MemoryViewResponse, ReturnMaterialRequest, ReturnMaterialResponse } from '../../types'
import { deriveCostSummary, deriveEachTotal, deriveGrossKnownCost, deriveLabourHoursSummary, deriveLabourSummary, deriveRefundsSummary, deriveTotalKnownCost } from '../../memoryScan'
import { ApiError } from '../client'
import { MOCK_JOBS } from './jobs'
import { findMockItem, mockBudgetCategoriesFor, mockSectionsFor, upsertMockItem } from './state'

export function mockMemoryView(jobId: string): MemoryViewResponse {
  const job = MOCK_JOBS.find(j => j.id === jobId) ?? MOCK_JOBS[0]
  const sections = mockSectionsFor(jobId)
  return {
    job,
    generatedAt: new Date().toISOString(),
    // Deep-ish copy so callers cannot mutate the stored fixture in place.
    sections: sections.map(s => ({ ...s, items: s.items.map(it => ({ ...it })) })),
    stillToCheck: {
      count: 2,
      items: [
        {
          id: 'queue-item-stc-001',
          sectionKey: 'unclear_items',
          summary: 'Something about extra cable in the workshop',
          kind: 'unclear_prompt',
          timeLabel: 'Today',
        },
      ],
    },
    // Authoritative known spend, derived from current state so an edit changes it.
    // totalKnownCost is net of trusted refunds; grossKnownCost + refunds are what
    // the Spend lens shows to explain the gap.
    costSummary: {
      orderedMaterials: deriveCostSummary(sections),
      labour: deriveLabourSummary(sections),
      totalKnownCost: deriveTotalKnownCost(sections),
      grossKnownCost: deriveGrossKnownCost(sections),
      refunds: deriveRefundsSummary(sections),
    },
    // Authoritative daily labour summary, derived from current state.
    labourHoursSummary: deriveLabourHoursSummary(sections),
  }
}

export function mockUpdateMemoryItem(jobId: string, memoryItemId: string, edit: MemoryItemEdit): MemoryViewItem {
  const sections = mockSectionsFor(jobId)
  const existing = findMockItem(sections, memoryItemId)
  const now = new Date().toISOString()
  const draft: MemoryViewItem = {
    id: memoryItemId,
    memoryType: edit.memoryType,
    summary: edit.summary ?? existing?.summary ?? '',
    materialName: edit.materialName,
    quantity: edit.quantity,
    unit: edit.unit,
    supplierName: edit.supplierName,
    deliveryTiming: edit.deliveryTiming,
    locationOrUse: edit.locationOrUse,
    costAmount: edit.costAmount,
    costCurrency: edit.costCurrency,
    costQualifier: edit.costQualifier,
    totalCostAmount: 'totalCostAmount' in edit ? (edit.totalCostAmount ?? null) : (existing?.totalCostAmount ?? null),
    // Labour fields only meaningful for labour; cleared otherwise.
    labourHours: edit.memoryType === 'labour' ? (edit.labourHours ?? null) : null,
    labourPerson: edit.memoryType === 'labour' ? (edit.labourPerson ?? null) : null,
    labourTask: edit.memoryType === 'labour' ? (edit.labourTask ?? null) : null,
    // Present key → honour value/null (explicit set/clear). Omitted → preserve.
    happenedAt: 'happenedAt' in edit ? (edit.happenedAt ?? null) : (existing?.happenedAt ?? null),
    // A Fix-memory save also resolves any worth-checking flags.
    uncertaintyFlags: [],
    // Preserve the existing category unless this edit explicitly changes it.
    budgetCategoryId: edit.budgetCategoryId !== undefined ? edit.budgetCategoryId : (existing?.budgetCategoryId ?? null),
    sourceCandidateFactId: existing?.sourceCandidateFactId ?? null,
    reviewDecisionId: existing?.reviewDecisionId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    source: existing?.source ?? null,
  }
  const updated: MemoryViewItem = {
    ...draft,
    // Present key → honour value/null (explicit set/clear). Omitted → derive
    // fresh quantity × unit cost for an `each` line, else preserve existing.
    totalCostAmount: 'totalCostAmount' in edit ? draft.totalCostAmount : (deriveEachTotal(draft) ?? draft.totalCostAmount),
  }
  // Remove from its current section, then re-home by the (possibly new) type.
  upsertMockItem(sections, updated)
  return { ...updated }
}

// Soft removal, mock-side: the item leaves the active sections (and therefore
// every derived total, since the mock derives summaries live from sections).
// The mock never had a separate source-note store to delete, which matches the
// backend rule that removal must not touch source evidence.
export function mockRemoveMemoryItem(jobId: string, memoryItemId: string): void {
  const sections = mockSectionsFor(jobId)
  if (!findMockItem(sections, memoryItemId)) throw new ApiError('Memory item not found', 404)
  for (const s of sections) s.items = s.items.filter(it => it.id !== memoryItemId)
}

// ── Returned materials ──────────────────────────────────────────────────────

const POS_DECIMAL = /^\d+(\.\d+)?$/
const isPositive = (s: string | null | undefined): boolean => !!s && POS_DECIMAL.test(s) && parseFloat(s) > 0

let mockReturnSeq = 0

function returnedSummary(materialName: string | null, quantity: string, unit: string | null, supplierName: string | null): string {
  const what = [quantity, unit, materialName].filter(Boolean).join(' ')
  return supplierName ? `Returned ${what} to ${supplierName}` : `Returned ${what}`
}

/**
 * Mirror of POST /memory-items/:id/return. Returning is not deleting: the
 * source leftover's evidence is preserved on the returned item, and nothing
 * touches the original bought row. Validation order and error codes follow the
 * backend rules so the UI's failure paths are exercised against the same
 * refusals the real API makes.
 */
export function mockReturnMemoryItem(jobId: string, memoryItemId: string, req: ReturnMaterialRequest): ReturnMaterialResponse {
  const sections = mockSectionsFor(jobId)
  const source = findMockItem(sections, memoryItemId)
  if (!source) throw new ApiError('Memory item not found', 404)
  if (source.memoryType !== 'leftover_material') throw new ApiError('Only a left over item can be returned', 400)
  if (!isPositive(req.quantity)) throw new ApiError('Invalid returned quantity', 400)
  // An approximate leftover ("about half a bag") can't be safely compared
  // against, so the return is refused rather than guessed at.
  if (!isPositive(source.quantity)) throw new ApiError('Left over quantity is not a number', 400)
  const returning = parseFloat(req.quantity)
  const available = parseFloat(source.quantity!)
  if (returning > available) throw new ApiError('More than is left over', 400)
  if (req.refundAmount != null && req.refundAmount !== '' && !isPositive(req.refundAmount)) {
    throw new ApiError('Invalid refund amount', 400)
  }

  const now = new Date().toISOString()
  const hasRefund = !!(req.refundAmount && req.refundAmount !== '')
  const unit = req.unit !== undefined ? req.unit : source.unit
  const supplierName = req.supplierName?.trim() || null
  const returnedItem: MemoryViewItem = {
    id: `mem-returned-${++mockReturnSeq}`,
    memoryType: 'returned_material',
    summary: returnedSummary(source.materialName, req.quantity, unit, supplierName),
    materialName: source.materialName,
    quantity: req.quantity,
    unit,
    supplierName,
    deliveryTiming: null,
    locationOrUse: null,
    // Refunds live in refundAmount, never costAmount — a returned item is not
    // a bought line, and must not be totalled as one.
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    totalCostAmount: null,
    refundAmount: hasRefund ? req.refundAmount! : null,
    refundCurrency: hasRefund ? (req.refundCurrency ?? 'GBP') : null,
    returnedFromMemoryItemId: source.id,
    labourHours: null,
    labourPerson: null,
    labourTask: null,
    uncertaintyFlags: [],
    budgetCategoryId: null,
    happenedAt: req.happenedAt ?? null,
    isManual: true,
    sourceCandidateFactId: source.sourceCandidateFactId,
    reviewDecisionId: null,
    createdAt: now,
    updatedAt: now,
    // The returned item inherits the leftover's evidence, so "where did this
    // come from" still answers with the original note on a full return.
    source: source.source,
  }

  let remainingLeftoverItem: MemoryViewItem | null = null
  if (returning === available) {
    // Full return: the leftover leaves the active record (soft-removed backend-side).
    for (const s of sections) s.items = s.items.filter(it => it.id !== memoryItemId)
  } else {
    source.quantity = String(Math.round((available - returning) * 1000) / 1000)
    source.updatedAt = now
    remainingLeftoverItem = { ...source }
  }
  upsertMockItem(sections, returnedItem)
  return { returnedItem: { ...returnedItem }, remainingLeftoverItem }
}

export function mockVerifyMemoryItem(jobId: string, memoryItemId: string): void {
  const item = findMockItem(mockSectionsFor(jobId), memoryItemId)
  if (item) item.uncertaintyFlags = []
}

let mockManualSeq = 0

// Backend guarantees a non-empty summary; mirror its derivation so the mock
// never stores a blank note.
function deriveManualSummary(req: CreateMemoryItemRequest): string {
  if (req.summary && req.summary.trim()) return req.summary.trim()
  const qtyUnit = [req.quantity, req.unit].filter(Boolean).join(' ')
  const nameBit = [qtyUnit, req.materialName].filter(Boolean).join(' ').trim()
  switch (req.memoryType) {
    case 'ordered_material':
      return nameBit ? `Bought ${nameBit}` : (req.materialName?.trim() || 'Bought item')
    case 'used_material':
    case 'leftover_material':
      return nameBit ? `Used ${nameBit}` : (req.materialName?.trim() || 'Used item')
    case 'labour': {
      const base = [req.labourPerson?.trim(), req.labourHours ? `${req.labourHours} hours` : null].filter(Boolean).join(' — ') || 'Labour'
      return req.labourTask?.trim() ? `${base} (${req.labourTask.trim()})` : base
    }
    default:
      return req.materialName?.trim() || 'Note'
  }
}

export function mockCreateMemoryItem(jobId: string, req: CreateMemoryItemRequest): MemoryViewItem {
  if (!req.memoryType) throw new ApiError('memoryType required', 400)
  const canCategorise = req.memoryType === 'ordered_material' || req.memoryType === 'labour'
  if (req.budgetCategoryId) {
    if (!canCategorise) throw new ApiError('Category not allowed for this type', 400)
    const cat = mockBudgetCategoriesFor(jobId).find(c => c.id === req.budgetCategoryId)
    if (!cat || cat.isArchived) throw new ApiError('Invalid category assignment', 400)
  }
  const sections = mockSectionsFor(jobId)
  const now = new Date().toISOString()
  const isLabour = req.memoryType === 'labour'
  const hasCost = !!(req.costAmount || req.totalCostAmount)
  const item: MemoryViewItem = {
    id: `mem-manual-${++mockManualSeq}`,
    memoryType: req.memoryType,
    summary: deriveManualSummary(req),
    materialName: req.materialName ?? null,
    quantity: req.quantity ?? null,
    unit: req.unit ?? null,
    supplierName: req.supplierName ?? null,
    deliveryTiming: req.deliveryTiming ?? null,
    locationOrUse: req.locationOrUse ?? null,
    costAmount: req.costAmount ?? null,
    costCurrency: req.costCurrency ?? (hasCost ? 'GBP' : null),
    costQualifier: req.costQualifier ?? null,
    // Explicit total wins; otherwise derive an `each` line total (quantity × unit
    // cost) so direct-added spend counts like the backend would.
    totalCostAmount: req.totalCostAmount ?? deriveEachTotal({ quantity: req.quantity ?? null, unit: req.unit ?? null, costAmount: req.costAmount ?? null, costQualifier: req.costQualifier ?? null }),
    labourHours: isLabour ? (req.labourHours ?? null) : null,
    labourPerson: isLabour ? (req.labourPerson ?? null) : null,
    labourTask: isLabour ? (req.labourTask ?? null) : null,
    uncertaintyFlags: [],
    budgetCategoryId: canCategorise ? (req.budgetCategoryId ?? null) : null,
    happenedAt: req.happenedAt ?? null,
    isManual: true,
    sourceCandidateFactId: null,
    reviewDecisionId: null,
    createdAt: now,
    updatedAt: now,
    source: null,
  }
  upsertMockItem(sections, item)
  return { ...item }
}

export function mockAssignMemoryItemCategory(jobId: string, memoryItemId: string, budgetCategoryId: string | null): MemoryViewItem {
  const item = findMockItem(mockSectionsFor(jobId), memoryItemId)
  if (!item) throw new ApiError('Memory item not found', 404)
  if (budgetCategoryId) {
    const cat = mockBudgetCategoriesFor(jobId).find(c => c.id === budgetCategoryId)
    if (!cat || cat.isArchived) throw new ApiError('Invalid category assignment', 400)
  }
  item.budgetCategoryId = budgetCategoryId
  item.updatedAt = new Date().toISOString()
  return { ...item }
}
