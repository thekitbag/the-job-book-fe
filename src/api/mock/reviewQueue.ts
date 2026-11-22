import type {
  MemoryType,
  MemoryViewItem,
  QueueDecision,
  QueueDecisionResponse,
  QueueItem,
  ReviewQueue,
} from '../../types'
import { MEMORY_TYPE_TO_SECTION_KEY, SECTION_FULL_LABELS } from '../../memoryScan'
import { mockSectionsFor, upsertMockItem } from './state'
const FIXTURES: QueueItem[] = [
  {
    id: 'queue-item-mock-001',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'hardcore, 8 bags, Jewson',
    proposedMemory: {
      memoryType: 'ordered_material',
      summary: 'hardcore, 8 bags, Jewson',
      materialName: 'hardcore',
      quantity: '8',
      unit: 'bags',
      supplierName: 'Jewson',
      deliveryTiming: null,
      locationOrUse: null,
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-001'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-001',
        noteId: 'mock-note-001',
        transcriptId: 'mock-trans-001',
        capturedAt: '2026-11-22T16:24:25.503Z',
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
    summary: 'OSB, boards, back wall',
    proposedMemory: {
      memoryType: 'used_material',
      summary: 'OSB, boards, back wall',
      materialName: 'OSB',
      quantity: null,
      unit: 'boards',
      supplierName: null,
      deliveryTiming: null,
      locationOrUse: 'back wall',
    },
    confidenceLabel: 'medium',
    uncertaintyFlags: ['uncertain_quantity'],
    sourceCandidateFactIds: ['mock-fact-002', 'mock-fact-003'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-002',
        noteId: 'mock-note-001',
        transcriptId: 'mock-trans-001',
        capturedAt: '2026-11-22T16:24:25.506Z',
        transcriptText: 'Used six OSB boards on the back wall.',
      },
      {
        candidateFactId: 'mock-fact-003',
        noteId: 'mock-note-002',
        transcriptId: 'mock-trans-002',
        capturedAt: '2026-11-22T16:24:25.506Z',
        transcriptText: 'Put some OSB on the back wall earlier.',
      },
    ],
  },
  {
    id: 'queue-item-mock-004',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'timber, 6 lengths, Travis Perkins',
    proposedMemory: {
      memoryType: 'ordered_material',
      summary: 'timber, 6 lengths, Travis Perkins',
      materialName: 'timber',
      quantity: '6',
      unit: 'lengths',
      supplierName: 'Travis Perkins',
      deliveryTiming: null,
      locationOrUse: null,
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-005'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-005',
        noteId: 'mock-note-004',
        transcriptId: 'mock-trans-004',
        capturedAt: '2026-11-22T16:24:25.506Z',
        transcriptText: 'Got six lengths of timber from Travis Perkins, twenty quid each.',
      },
    ],
  },
  {
    id: 'queue-item-mock-005',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Mike · 4 hours',
    proposedMemory: {
      memoryType: 'labour',
      summary: 'Mike · 4 hours',
      materialName: null,
      quantity: null,
      unit: null,
      supplierName: null,
      deliveryTiming: null,
      locationOrUse: null,
      labourHours: '4',
      labourPerson: 'Mike',
      labourTask: null,
      happenedAt: '2026-11-22T12:00:00',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-006'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-006',
        noteId: 'mock-note-005',
        transcriptId: 'mock-trans-005',
        capturedAt: '2026-11-22T16:24:25.506Z',
        transcriptText: 'Mike 4 hours, Kurt 6.',
      },
    ],
  },
  {
    id: 'queue-item-mock-006',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Kurt · 6 hours',
    proposedMemory: {
      memoryType: 'labour',
      summary: 'Kurt · 6 hours',
      materialName: null,
      quantity: null,
      unit: null,
      supplierName: null,
      deliveryTiming: null,
      locationOrUse: null,
      labourHours: '6',
      labourPerson: 'Kurt',
      labourTask: null,
      happenedAt: '2026-11-22T12:00:00',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-007'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-007',
        noteId: 'mock-note-005',
        transcriptId: 'mock-trans-005',
        capturedAt: '2026-11-22T16:24:25.506Z',
        transcriptText: 'Mike 4 hours, Kurt 6.',
      },
    ],
  },
  {
    id: 'queue-item-mock-007',
    kind: 'single',
    status: 'draft',
    reviewLabel: 'What I picked up today',
    timeLabel: 'Today',
    summary: 'Tom · 8 hours · electrics',
    proposedMemory: {
      memoryType: 'labour',
      summary: 'Tom · 8 hours · electrics',
      materialName: null,
      quantity: null,
      unit: null,
      supplierName: null,
      deliveryTiming: null,
      locationOrUse: null,
      labourHours: '8',
      labourPerson: 'Tom',
      labourTask: 'electrics',
      happenedAt: '2026-11-22T12:00:00',
    },
    confidenceLabel: 'high',
    uncertaintyFlags: [],
    sourceCandidateFactIds: ['mock-fact-008'],
    sourceContext: [
      {
        candidateFactId: 'mock-fact-008',
        noteId: 'mock-note-006',
        transcriptId: 'mock-trans-006',
        capturedAt: '2026-11-22T16:24:25.506Z',
        transcriptText: 'Tom did eight hours on electrics and paid Kurt £120 for fitting cladding.',
      },
    ],
  },
]
const queues = new Map<string, QueueItem[]>()
export function resetMockQueue(): void {
  queues.clear()
}
export function mockGetReviewQueue(jobId: string): ReviewQueue {
  if (!queues.has(jobId))
    queues.set(jobId, jobId === 'job-pilot-garden-room-001' ? structuredClone(FIXTURES) : [])
  const groups = new Map<string, QueueItem[]>()
  for (const item of queues.get(jobId)!) {
    const key =
      item.kind === 'unclear_prompt'
        ? 'unclear_items'
        : (MEMORY_TYPE_TO_SECTION_KEY[item.proposedMemory.memoryType] ?? 'unclear_items')
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return {
    jobId,
    generatedAt: new Date().toISOString(),
    sections: [...groups].map(([key, items]) => ({
      key,
      label: SECTION_FULL_LABELS[key] ?? 'Unclear',
      items: structuredClone(items),
    })),
    alreadyRemembered: mockSectionsFor(jobId)
      .flatMap((s) => s.items)
      .map((i) => ({ ...i, memoryItemId: i.id, memoryType: i.memoryType as MemoryType })),
  }
}
export function mockSubmitQueueDecision(jobId: string, decision: QueueDecision): QueueDecisionResponse {
  mockGetReviewQueue(jobId)
  const item = queues.get(jobId)!.find((i) => i.id === decision.queueItemId)
  if (!item) throw new Error('Not found')
  item.status =
    decision.action === 'confirm' ? 'confirmed' : decision.action === 'correct' ? 'corrected' : 'dismissed'
  let memoryItemId: string | undefined
  if (decision.action !== 'dismiss') {
    const pm = decision.corrected ?? item.proposedMemory
    memoryItemId = 'mem-' + item.id
    const now = new Date().toISOString(),
      ctx = item.sourceContext[0]
    const memory: MemoryViewItem = {
      ...pm,
      id: memoryItemId,
      createdAt: now,
      updatedAt: now,
      sourceCandidateFactId: item.sourceCandidateFactIds[0] ?? null,
      reviewDecisionId: 'decision-' + item.id,
      uncertaintyFlags: decision.uncertaintyResolution === 'still_unsure' ? item.uncertaintyFlags : [],
      source: ctx
        ? {
            candidateFactId: ctx.candidateFactId,
            noteId: ctx.noteId,
            transcriptId: ctx.transcriptId,
            capturedAt: ctx.capturedAt,
            transcriptText: ctx.transcriptText,
          }
        : null,
    }
    upsertMockItem(mockSectionsFor(jobId), memory)
  }
  return {
    queueItemId: item.id,
    action: decision.action,
    status: item.status,
    memoryItemId,
    sourceCandidateFactIds: item.sourceCandidateFactIds,
  }
}
