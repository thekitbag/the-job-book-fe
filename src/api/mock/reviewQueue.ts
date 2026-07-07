import type { AlreadyRememberedItem, MemoryType, MemoryViewItem, QueueDecision, QueueDecisionResponse, QueueItem, ReviewQueue } from '../../types'
import { suggestBudgetCategory } from '../../memoryScan'
import { mockBudgetCategoriesFor, mockSectionsFor, upsertMockItem } from './state'

const MOCK_QUEUE_ITEMS: QueueItem[] = [
  {
    id: 'queue-item-mock-001',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
    proposedMemory: {
      memoryType: 'ordered_material' as MemoryType,
      summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
      materialName: 'hardcore',
      quantity: '8',
      unit: 'bags',
      supplierName: 'Jewson',
      deliveryTiming: null,
      locationOrUse: null,
      costAmount: '5',
      costCurrency: 'GBP',
      costQualifier: 'each',
      totalCostAmount: '40',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-001'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-001',
        noteId: 'mock-note-001',
        transcriptId: 'mock-trans-001',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Bought 8 bags of hardcore from Jewson, five pounds each.',
      },
    ],
  },
  {
    id: 'queue-item-mock-002',
    kind: 'duplicate_group',
    status: 'draft',
    reviewLabel: 'Looks like the same item',
    timeLabel: 'Today',
    summary: 'Used OSB boards on the back wall',
    proposedMemory: {
      memoryType: 'used_material' as MemoryType,
      summary: 'Used OSB boards on the back wall',
      materialName: 'OSB',
      quantity: null,
      unit: 'boards',
      supplierName: null,
      deliveryTiming: null,
      locationOrUse: 'back wall',
      costAmount: null,
      costCurrency: null,
      costQualifier: null,
      totalCostAmount: null,
    },
    confidenceLabel: 'medium',
    uncertaintyFlags: ['uncertain_quantity'],
    sourceCandidateFactIds: ['mock-fact-002', 'mock-fact-003'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-002',
        noteId: 'mock-note-001',
        transcriptId: 'mock-trans-001',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Used six OSB boards on the back wall.',
      },
      {
        candidateFactId: 'mock-fact-003',
        noteId: 'mock-note-002',
        transcriptId: 'mock-trans-002',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Put some OSB on the back wall earlier.',
      },
    ],
  },
  {
    id: 'queue-item-mock-003',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'Watch out',
    timeLabel: 'Today',
    summary: 'Watch out — uneven floor near back door',
    proposedMemory: {
      memoryType: 'watch_out' as MemoryType,
      summary: 'Watch out — uneven floor near back door',
      materialName: null,
      quantity: null,
      unit: null,
      supplierName: null,
      deliveryTiming: null,
      locationOrUse: 'near back door',
      costAmount: null,
      costCurrency: null,
      costQualifier: null,
      totalCostAmount: null,
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-004'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-004',
        noteId: 'mock-note-003',
        transcriptId: 'mock-trans-003',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Mind the uneven floor by the back door.',
      },
    ],
  },
  // Bought/ordered draft whose material exactly matches a seeded category
  // ('timber') → a material-name category suggestion during review.
  {
    id: 'queue-item-mock-004',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Ordered 6 lengths of timber from Travis Perkins at £20 each',
    proposedMemory: {
      memoryType: 'ordered_material' as MemoryType,
      summary: 'Ordered 6 lengths of timber from Travis Perkins at £20 each',
      materialName: 'timber',
      quantity: '6',
      unit: 'lengths',
      supplierName: 'Travis Perkins',
      deliveryTiming: null,
      locationOrUse: null,
      costAmount: '20',
      costCurrency: 'GBP',
      costQualifier: 'each',
      totalCostAmount: null,
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-005'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-005',
        noteId: 'mock-note-004',
        transcriptId: 'mock-trans-004',
        capturedAt: new Date().toISOString(),
        transcriptText: 'Got six lengths of timber from Travis Perkins, twenty quid each.',
      },
    ],
  },
  // Labour draft — hours only, no cost (can be remembered without a cost).
  {
    id: 'queue-item-mock-005',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Spent 6 hours fitting the cladding',
    proposedMemory: {
      memoryType: 'labour' as MemoryType,
      summary: 'Spent 6 hours fitting the cladding',
      materialName: null, quantity: null, unit: null, supplierName: null,
      deliveryTiming: null, locationOrUse: null,
      costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
      labourHours: '6', labourPerson: null, labourTask: 'fitting cladding',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-006'],
    sourceContext: [
      { candidateFactId: 'mock-fact-006', noteId: 'mock-note-005', transcriptId: 'mock-trans-005', capturedAt: new Date().toISOString(), transcriptText: 'Spent about six hours fitting the cladding today.' },
    ],
  },
  // Labour draft — rated (hours × £/hour). Suggests the active 'labour' category.
  {
    id: 'queue-item-mock-006',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Tom did 8 hours on electrics at £35 an hour',
    proposedMemory: {
      memoryType: 'labour' as MemoryType,
      summary: 'Tom did 8 hours on electrics at £35 an hour',
      materialName: null, quantity: null, unit: null, supplierName: null,
      deliveryTiming: null, locationOrUse: null,
      costAmount: '35', costCurrency: 'GBP', costQualifier: 'per_hour', totalCostAmount: '280',
      labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-007'],
    sourceContext: [
      { candidateFactId: 'mock-fact-007', noteId: 'mock-note-006', transcriptId: 'mock-trans-006', capturedAt: new Date().toISOString(), transcriptText: 'Tom did eight hours on the electrics at thirty-five an hour.' },
    ],
  },
]

const MOCK_REMEMBERED: AlreadyRememberedItem[] = [
  {
    memoryItemId: 'mem-mock-001',
    summary: 'Ordered scaffolding from TCS',
    memoryType: 'ordered_material',
    timeLabel: 'Yesterday',
    supplierName: 'TCS',
    deliveryTiming: 'Friday morning',
    materialName: 'scaffolding',
    quantity: null,
    unit: null,
    locationOrUse: null,
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    totalCostAmount: null,
    uncertaintyFlags: [],
    // A remembered item that already carries a category (set in the seed job).
    budgetCategoryId: 'cat-cladding',
  },
  {
    memoryItemId: 'mem-mock-002',
    summary: 'Watch out — uneven floor near back door',
    memoryType: 'watch_out',
    timeLabel: 'Earlier',
    materialName: null,
    quantity: null,
    unit: null,
    supplierName: null,
    deliveryTiming: null,
    locationOrUse: 'near back door',
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    totalCostAmount: null,
    uncertaintyFlags: [],
  },
]

export function mockGetReviewQueue(jobId: string): ReviewQueue {
  const budgetCategories = mockBudgetCategoriesFor(jobId).filter(c => !c.isArchived)
  // Compute a response-time category suggestion for bought/ordered + labour drafts.
  const enrich = (item: QueueItem): QueueItem => {
    const t = item.proposedMemory.memoryType
    if (t !== 'ordered_material' && t !== 'labour') return item
    const suggestion = suggestBudgetCategory(item.proposedMemory, budgetCategories)
    return {
      ...item,
      proposedMemory: {
        ...item.proposedMemory,
        budgetCategoryId: suggestion?.budgetCategoryId ?? null,
        budgetCategorySuggestion: suggestion,
      },
    }
  }
  return {
    jobId,
    generatedAt: new Date().toISOString(),
    budgetCategories,
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [enrich(MOCK_QUEUE_ITEMS[0]), enrich(MOCK_QUEUE_ITEMS[3])] },
      { key: 'labour', label: 'Labour', items: [enrich(MOCK_QUEUE_ITEMS[4]), enrich(MOCK_QUEUE_ITEMS[5])] },
      { key: 'used_materials', label: 'Used materials', items: [MOCK_QUEUE_ITEMS[1]] },
      { key: 'leftovers', label: 'Leftovers', items: [] },
      { key: 'watch_outs', label: 'Watch outs', items: [MOCK_QUEUE_ITEMS[2]] },
    ],
    alreadyRemembered: MOCK_REMEMBERED.map(m => ({ ...m })),
  }
}

// Confirming/correcting a review item creates trusted memory (like the backend),
// carrying the selected category, so Job memory / budget reflect it immediately.
export function mockSubmitQueueDecision(jobId: string, decision: QueueDecision): QueueDecisionResponse {
  const statusMap = { confirm: 'confirmed', correct: 'corrected', dismiss: 'dismissed' } as const
  if (decision.action === 'dismiss') {
    return { queueItemId: decision.queueItemId, action: 'dismiss', status: 'dismissed', sourceCandidateFactIds: [] }
  }

  const source = decision.corrected
    ?? MOCK_QUEUE_ITEMS.find(i => i.id === decision.queueItemId)?.proposedMemory
  const memoryItemId = `mem-${decision.queueItemId}`
  if (source) {
    const now = new Date().toISOString()
    const isLabour = source.memoryType === 'labour'
    const canCategorise = source.memoryType === 'ordered_material' || isLabour
    const category = canCategorise ? (decision.budgetCategoryId ?? decision.corrected?.budgetCategoryId ?? null) : null
    const queueItem = MOCK_QUEUE_ITEMS.find(i => i.id === decision.queueItemId)
    const keepFlags = decision.uncertaintyResolution === 'still_unsure' ? (queueItem?.uncertaintyFlags ?? []) : []
    const item: MemoryViewItem = {
      id: memoryItemId,
      memoryType: source.memoryType,
      summary: source.summary,
      materialName: source.materialName,
      quantity: source.quantity,
      unit: source.unit,
      supplierName: source.supplierName,
      deliveryTiming: source.deliveryTiming,
      locationOrUse: source.locationOrUse,
      costAmount: source.costAmount,
      costCurrency: source.costCurrency,
      costQualifier: source.costQualifier,
      totalCostAmount: source.totalCostAmount,
      labourHours: isLabour ? (source.labourHours ?? null) : null,
      labourPerson: isLabour ? (source.labourPerson ?? null) : null,
      labourTask: isLabour ? (source.labourTask ?? null) : null,
      uncertaintyFlags: keepFlags,
      budgetCategoryId: category,
      sourceCandidateFactId: null,
      reviewDecisionId: null,
      createdAt: now,
      updatedAt: now,
      source: null,
    }
    // Replace any prior decision for the same queue item (idempotent re-confirm).
    upsertMockItem(mockSectionsFor(jobId), item)
  }

  return {
    queueItemId: decision.queueItemId,
    action: decision.action,
    status: statusMap[decision.action],
    memoryItemId,
    sourceCandidateFactIds: [],
  }
}
