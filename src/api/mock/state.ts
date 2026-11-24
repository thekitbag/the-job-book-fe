import type { MemoryViewItem, MemoryViewSection } from '../../types'
import { MEMORY_TYPE_TO_SECTION_KEY, SECTION_FULL_LABELS, SECTION_ORDER } from '../../memoryScan'
const MOCK_SEED_JOB_ID = 'job-pilot-garden-room-001'
let scenario = 'default'
function buildMockSections(): MemoryViewSection[] {
  return [
    {
      key: 'ordered_materials',
      label: 'Ordered materials',
      items: [
        {
          id: 'mem-view-001',
          memoryType: 'ordered_material',
          summary: 'hardcore, 8 bags, Jewson',
          materialName: 'hardcore',
          quantity: '8',
          unit: 'bags',
          supplierName: 'Jewson',
          deliveryTiming: null,
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-001',
          reviewDecisionId: 'decision-001',
          createdAt: '2026-06-13T09:25:00.000Z',
          updatedAt: '2026-06-13T09:25:00.000Z',
          source: {
            candidateFactId: 'fact-001',
            noteId: 'note-001',
            transcriptId: 'trans-001',
            capturedAt: '2026-06-13T09:15:00.000Z',
            transcriptText: 'Bought 8 bags of hardcore from Jewson, five pounds each.',
          },
        },
        {
          id: 'mem-view-004',
          memoryType: 'ordered_material',
          summary: 'plasterboard, 12 sheets, Jewson',
          materialName: 'plasterboard',
          quantity: '12',
          unit: 'sheets',
          supplierName: 'Jewson',
          deliveryTiming: 'Tuesday',
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-004',
          reviewDecisionId: 'decision-004',
          createdAt: '2026-06-13T09:30:00.000Z',
          updatedAt: '2026-06-13T09:30:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-005',
          memoryType: 'ordered_material',
          summary: 'plasterboard, 12 sheets, Jewson',
          materialName: 'plasterboard',
          quantity: '12',
          unit: 'sheets',
          supplierName: 'Jewson',
          deliveryTiming: 'Thursday',
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-005',
          reviewDecisionId: 'decision-005',
          createdAt: '2026-06-13T09:35:00.000Z',
          updatedAt: '2026-06-13T09:35:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-006',
          memoryType: 'ordered_material',
          summary: 'timber, 6 lengths, Travis Perkins',
          materialName: 'timber',
          quantity: '6',
          unit: 'lengths',
          supplierName: 'Travis Perkins',
          deliveryTiming: null,
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-006',
          reviewDecisionId: 'decision-006',
          createdAt: '2026-06-13T09:40:00.000Z',
          updatedAt: '2026-06-13T09:40:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-009',
          memoryType: 'ordered_material',
          summary: 'insulation, 4 packs, Jewson',
          materialName: 'insulation',
          quantity: '4',
          unit: 'packs',
          supplierName: 'Jewson',
          deliveryTiming: null,
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-009',
          reviewDecisionId: 'decision-009',
          createdAt: '2026-06-13T09:42:00.000Z',
          updatedAt: '2026-06-13T09:42:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-013',
          memoryType: 'ordered_material',
          summary: 'sealant, Screwfix',
          materialName: 'sealant',
          quantity: null,
          unit: null,
          supplierName: 'Screwfix',
          deliveryTiming: null,
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-013',
          reviewDecisionId: 'decision-013',
          createdAt: '2026-06-13T09:43:00.000Z',
          updatedAt: '2026-06-13T09:43:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-015',
          memoryType: 'ordered_material',
          summary: 'agency invoice, SiteStaff Agency',
          materialName: 'agency invoice',
          quantity: null,
          unit: null,
          supplierName: 'SiteStaff Agency',
          deliveryTiming: null,
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-015',
          reviewDecisionId: 'decision-015',
          createdAt: '2026-06-13T09:46:00.000Z',
          updatedAt: '2026-06-13T09:46:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-010',
          memoryType: 'ordered_material',
          summary: 'membrane, 5 rolls, Travis Perkins',
          materialName: 'membrane',
          quantity: '5',
          unit: 'rolls',
          supplierName: 'Travis Perkins',
          deliveryTiming: null,
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-010',
          reviewDecisionId: 'decision-010',
          createdAt: '2026-06-13T09:44:00.000Z',
          updatedAt: '2026-06-13T09:44:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-011',
          memoryType: 'ordered_material',
          summary: 'membrane, 5 rolls, Travis Perkins',
          materialName: 'membrane',
          quantity: '5',
          unit: 'rolls',
          supplierName: 'Travis Perkins',
          deliveryTiming: null,
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-011',
          reviewDecisionId: 'decision-011',
          createdAt: '2026-06-13T09:45:00.000Z',
          updatedAt: '2026-06-13T09:45:00.000Z',
          source: null,
        },
      ],
    },
    {
      key: 'used_materials',
      label: 'Used materials',
      items: [
        {
          id: 'mem-view-002',
          memoryType: 'used_material',
          summary: 'OSB, back wall',
          materialName: 'OSB',
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: 'back wall',
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-002',
          reviewDecisionId: 'decision-002',
          createdAt: '2026-06-13T10:00:00.000Z',
          updatedAt: '2026-06-13T10:00:00.000Z',
          source: null,
        },
      ],
    },
    {
      key: 'labour',
      label: 'Hours',
      items: [
        {
          id: 'mem-labour-4',
          memoryType: 'labour',
          summary: 'Mike · 4h',
          materialName: null,
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: null,
          labourHours: '4',
          labourPerson: 'Mike',
          labourTask: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-l4',
          reviewDecisionId: 'decision-l4',
          createdAt: '2026-06-13T11:30:00.000Z',
          updatedAt: '2026-06-13T11:30:00.000Z',
          source: {
            candidateFactId: 'fact-l4',
            noteId: 'note-l4',
            transcriptId: 'trans-l4',
            capturedAt: '2026-06-13T11:25:00.000Z',
            transcriptText: 'Mike 4 hours, Kurt 6.',
          },
        },
        {
          id: 'mem-labour-5',
          memoryType: 'labour',
          summary: 'Kurt · 6h',
          materialName: null,
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: null,
          labourHours: '6',
          labourPerson: 'Kurt',
          labourTask: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-l5',
          reviewDecisionId: 'decision-l5',
          createdAt: '2026-06-13T11:29:00.000Z',
          updatedAt: '2026-06-13T11:29:00.000Z',
          source: {
            candidateFactId: 'fact-l5',
            noteId: 'note-l4',
            transcriptId: 'trans-l4',
            capturedAt: '2026-06-13T11:25:00.000Z',
            transcriptText: 'Mike 4 hours, Kurt 6.',
          },
        },
        {
          id: 'mem-labour-1',
          memoryType: 'labour',
          summary: '6h · fitting cladding',
          materialName: null,
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: null,
          labourHours: '6',
          labourPerson: null,
          labourTask: 'fitting cladding',
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-l1',
          reviewDecisionId: 'decision-l1',
          createdAt: '2026-06-13T11:10:00.000Z',
          updatedAt: '2026-06-13T11:10:00.000Z',
          source: {
            candidateFactId: 'fact-l1',
            noteId: 'note-l1',
            transcriptId: 'trans-l1',
            capturedAt: '2026-06-13T11:05:00.000Z',
            transcriptText: 'Spent about six hours fitting the cladding today.',
          },
        },
        {
          id: 'mem-labour-2',
          memoryType: 'labour',
          summary: 'Tom · 8h · electrics',
          materialName: null,
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: null,
          labourHours: '8',
          labourPerson: 'Tom',
          labourTask: 'electrics',
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-l2',
          reviewDecisionId: 'decision-l2',
          createdAt: '2026-06-13T11:15:00.000Z',
          updatedAt: '2026-06-13T11:15:00.000Z',
          source: null,
        },
        {
          id: 'mem-labour-6',
          memoryType: 'labour',
          summary: 'Apprentice · 5h · clearing up',
          materialName: null,
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: null,
          labourHours: '5',
          labourPerson: 'Apprentice',
          labourTask: 'clearing up',
          uncertaintyFlags: ['uncertain_hours'],
          sourceCandidateFactId: 'fact-l6',
          reviewDecisionId: 'decision-l6',
          createdAt: '2026-06-13T11:08:00.000Z',
          updatedAt: '2026-06-13T11:08:00.000Z',
          source: null,
        },
      ],
    },
    {
      key: 'leftovers',
      label: 'Leftovers',
      items: [
        {
          id: 'mem-view-007',
          memoryType: 'leftover_material',
          summary: 'sand, about half bag, in the van',
          materialName: 'sand',
          quantity: 'about half',
          unit: 'bag',
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: 'in the van',
          uncertaintyFlags: ['approximate_quantity'],
          sourceCandidateFactId: 'fact-007',
          reviewDecisionId: 'decision-007',
          createdAt: '2026-06-13T10:30:00.000Z',
          updatedAt: '2026-06-13T10:30:00.000Z',
          source: null,
        },
        {
          id: 'mem-view-016',
          memoryType: 'leftover_material',
          summary: 'fence posts, 6, Jewson, stacked by the gate',
          materialName: 'fence posts',
          quantity: '6',
          unit: null,
          supplierName: 'Jewson',
          deliveryTiming: null,
          locationOrUse: 'stacked by the gate',
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-016',
          reviewDecisionId: 'decision-016',
          createdAt: '2026-06-13T10:35:00.000Z',
          updatedAt: '2026-06-13T10:35:00.000Z',
          source: {
            candidateFactId: 'fact-016',
            noteId: 'note-016',
            transcriptId: 'trans-016',
            capturedAt: '2026-06-13T10:32:00.000Z',
            transcriptText: 'Six fence posts left over, stacked by the gate.',
          },
        },
      ],
    },
    {
      key: 'returned_materials',
      label: 'Returned materials',
      items: [],
    },
    {
      key: 'supplier_delivery_notes',
      label: 'Supplier delivery notes',
      items: [
        {
          id: 'mem-view-008',
          memoryType: 'supplier_delivery_note',
          summary: 'Jewson said the next delivery slips to Friday',
          materialName: null,
          quantity: null,
          unit: null,
          supplierName: 'Jewson',
          deliveryTiming: 'Friday',
          locationOrUse: null,
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-008',
          reviewDecisionId: 'decision-008',
          createdAt: '2026-06-13T10:45:00.000Z',
          updatedAt: '2026-06-13T10:45:00.000Z',
          source: null,
        },
      ],
    },
    {
      key: 'customer_changes',
      label: 'Customer changes',
      items: [],
    },
    {
      key: 'watch_outs',
      label: 'Watch outs',
      items: [
        {
          id: 'mem-view-003',
          memoryType: 'watch_out',
          summary: 'Uneven floor near back door',
          materialName: null,
          quantity: null,
          unit: null,
          supplierName: null,
          deliveryTiming: null,
          locationOrUse: 'near back door',
          uncertaintyFlags: [],
          sourceCandidateFactId: 'fact-003',
          reviewDecisionId: 'decision-003',
          createdAt: '2026-06-13T11:00:00.000Z',
          updatedAt: '2026-06-13T11:00:00.000Z',
          source: {
            candidateFactId: 'fact-003',
            noteId: 'note-002',
            transcriptId: 'trans-002',
            capturedAt: '2026-06-13T10:50:00.000Z',
            transcriptText: 'Watch out for the uneven floor near the back door, nearly tripped earlier.',
          },
        },
      ],
    },
  ]
}
const EXTRA_LEFTOVER_FIXTURES: Record<
  string,
  {
    id: string
    materialName: string
    quantity: string | null
    unit: string | null
    locationOrUse: string | null
  }[]
> = {
  // Kitchen Extension (in progress) — the leftovers the seeded Workshop was
  // filled from, so tapping "Open Kitchen Extension" from Workshop lands on the
  // actual source row rather than an empty Left over tab.
  'job-pilot-extension-002': [
    {
      id: 'mem-kitchen-left-1',
      materialName: 'OSB',
      quantity: 'about 3',
      unit: 'sheets',
      locationOrUse: null,
    },
    {
      id: 'mem-kitchen-left-2',
      materialName: 'Screws, 5.0×80',
      quantity: 'half a box',
      unit: null,
      locationOrUse: null,
    },
    {
      id: 'mem-kitchen-left-3',
      materialName: 'Membrane',
      quantity: 'part of a roll',
      unit: null,
      locationOrUse: 'in the van',
    },
  ],
  // Whitmore Patio (finished) — one already in the Workshop, one corrected as
  // never there, and one still unmoved so the Finished-job move can be walked.
  'job-pilot-finished-005': [
    {
      id: 'mem-whitmore-left-1',
      materialName: 'Fence posts',
      quantity: '4 or 5',
      unit: null,
      locationOrUse: null,
    },
    {
      id: 'mem-whitmore-left-2',
      materialName: 'Gravel boards',
      quantity: 'a couple',
      unit: null,
      locationOrUse: 'stacked by the shed',
    },
    {
      id: 'mem-whitmore-left-3',
      materialName: 'Cement board',
      quantity: 'a sheet',
      unit: null,
      locationOrUse: null,
    },
  ],
  // Okoro Loft (finished) — the used-up terminal outcome.
  'job-pilot-finished-006': [
    {
      id: 'mem-okoro-left-1',
      materialName: 'Decking boards',
      quantity: '7 or 8',
      unit: null,
      locationOrUse: null,
    },
  ],
}

function buildExtraLeftoverSections(jobId: string): MemoryViewSection[] {
  const fixture = EXTRA_LEFTOVER_FIXTURES[jobId]
  if (!fixture) return []
  return [
    {
      key: 'leftovers',
      label: 'Leftovers',
      items: fixture.map((f) => ({
        id: f.id,
        memoryType: 'leftover_material',
        summary: `${f.materialName} left over`,
        materialName: f.materialName,
        quantity: f.quantity,
        unit: f.unit,
        supplierName: null,
        deliveryTiming: null,
        locationOrUse: f.locationOrUse,
        uncertaintyFlags: [],
        sourceCandidateFactId: null,
        reviewDecisionId: null,
        createdAt: '2026-06-13T10:00:00.000Z',
        updatedAt: '2026-06-13T10:00:00.000Z',
        source: null,
      })),
    },
  ]
}

// Per-job mutable memory state so a post-edit refetch reflects the edit, the way
// a real backend would. Module-level, so it resets on every full page load
// (each Playwright test starts with page.goto) — no cross-test leakage.
let mockMemoryByJob: Map<string, MemoryViewSection[]> | null = null

// Rebase the fixture's fixed dates onto the current day so the workspace
// Overview and the daily Labour view render meaningfully: labour is dated today
// (except mem-labour-1, which pins the "Yesterday" day group), everything else
// is spread over the last week. Labour items also get a local-noon happenedAt
// for their rebased day — the effective labour day the daily view groups on.
// Cost amounts/qualifiers/flags are untouched, so the known-spend cases the
// fixture encodes still hold.
const YESTERDAY_LABOUR_IDS = new Set(['mem-labour-1'])

function localNoonISOFor(msSinceEpoch: number): string {
  const d = new Date(msSinceEpoch)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T12:00:00`
}

function rebaseMockDates(sections: MemoryViewSection[]): void {
  const dayMs = 86_400_000
  const now = Date.now()
  let nonLabourIdx = 0
  for (const s of sections) {
    for (const item of s.items) {
      const daysAgo =
        item.memoryType === 'labour' ? (YESTERDAY_LABOUR_IDS.has(item.id) ? 1 : 0) : nonLabourIdx++ % 7
      // Small per-item offset keeps same-day items in a stable newest-first order.
      const ms = now - daysAgo * dayMs - item.id.length * 60_000
      const iso = new Date(ms).toISOString()
      item.createdAt = iso
      item.updatedAt = iso
      if (item.source) item.source = { ...item.source, capturedAt: iso }
      if (item.memoryType === 'labour') item.happenedAt = localNoonISOFor(ms)
    }
  }
}

// Only the canonical pilot job gets the rich fixture — any other job
// (including one freshly created via "+ Add job") starts with genuinely no
// remembered spend/labour, matching what a real new job looks like. Without
// this, every job showed the garden-room fixture's items regardless of
// whether anything had actually been recorded against it.
export function mockSectionsFor(jobId: string): MemoryViewSection[] {
  if (!mockMemoryByJob) mockMemoryByJob = new Map()
  if (!mockMemoryByJob.has(jobId)) {
    const sections = jobId === MOCK_SEED_JOB_ID ? buildMockSections() : buildExtraLeftoverSections(jobId)
    if (jobId === MOCK_SEED_JOB_ID)
      upsertMockItem(sections, {
        id: 'manual-note-seed',
        memoryType: 'general_note',
        summary: 'Customer wants extra lights by the door.',
        materialName: null,
        quantity: null,
        unit: null,
        supplierName: null,
        deliveryTiming: null,
        locationOrUse: null,
        uncertaintyFlags: [],
        sourceCandidateFactId: null,
        reviewDecisionId: null,
        source: null,
        isManual: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    // Deliberately stale payload for the browser language guard; never used in a pilot run.
    if (scenario === 'job-memory-legacy')
      for (const section of sections)
        for (const item of section.items) {
          Object.assign(item, {
            costAmount: '240',
            costCurrency: 'GBP',
            totalCostAmount: '240',
            budgetCategoryId: 'legacy',
            paidLabel: '£240 paid',
            refundAmount: '80',
          })
          if (item.memoryType.endsWith('_material') || item.memoryType === 'labour')
            item.summary = 'Legacy cost £240 paid on account'
        }
    rebaseMockDates(sections)
    mockMemoryByJob.set(jobId, sections)
  }
  return mockMemoryByJob.get(jobId)!
}

// Test seam: drop any accumulated mock edits.
export function _resetMockMemoryForTesting(nextScenario = 'default'): void {
  scenario = nextScenario
  mockMemoryByJob = null
}

export function findMockItem(sections: MemoryViewSection[], id: string): MemoryViewItem | undefined {
  for (const s of sections) {
    const found = s.items.find((it) => it.id === id)
    if (found) return found
  }
  return undefined
}

// Remove any existing row with the item's id, then insert it at the top of the
// section matching its (possibly new) memory type, creating the section in
// canonical order if the fixture doesn't have it yet.
export function upsertMockItem(sections: MemoryViewSection[], item: MemoryViewItem): void {
  for (const s of sections) s.items = s.items.filter((it) => it.id !== item.id)
  const targetKey = MEMORY_TYPE_TO_SECTION_KEY[item.memoryType] ?? item.memoryType
  let target = sections.find((s) => s.key === targetKey)
  if (!target) {
    target = { key: targetKey, label: SECTION_FULL_LABELS[targetKey] ?? targetKey, items: [] }
    sections.push(target)
    sections.sort(
      (a, b) => (SECTION_ORDER.indexOf(a.key) + 1 || 99) - (SECTION_ORDER.indexOf(b.key) + 1 || 99),
    )
  }
  target.items.unshift(item)
}
