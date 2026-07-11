import type { BudgetCategory, MemoryViewItem, MemoryViewSection } from '../../types'
import { MEMORY_TYPE_TO_SECTION_KEY, SECTION_FULL_LABELS, SECTION_ORDER } from '../../memoryScan'

// The one pilot job that gets the rich fixture (sections + budget
// categories). Any other job — including one freshly created — starts empty.
const MOCK_SEED_JOB_ID = 'job-pilot-garden-room-001'

// Canonical seed for the stateful mock memory-view. The bought/ordered section
// deliberately spans the five Known-spend cases the pilot fix must distinguish:
//  - hardcore: an included cost item (£40)
//  - plasterboard ×2: a trusted money-total row, consolidated to £1200
//  - timber: a no-cost item (No cost remembered)
//  - insulation: an approximate, untrusted cost (Cost worth checking)
//  - membrane ×2: a consolidated quantity row with no trusted cost
function buildMockSections(): MemoryViewSection[] {
  return [
      {
        key: 'ordered_materials',
        label: 'Ordered materials',
        items: [
          {
            id: 'mem-view-001',
            memoryType: 'ordered_material',
            summary: 'Ordered 8 bags of hardcore from Jewson at £5 each',
            materialName: 'hardcore',
            quantity: '8',
            unit: 'bags',
            supplierName: 'Jewson',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: '5',
            costCurrency: 'GBP',
            costQualifier: 'each' as const,
            totalCostAmount: '40',
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
          // Two plasterboard rows in the same unit → safe like-for-like total (24 sheets)
          {
            id: 'mem-view-004',
            memoryType: 'ordered_material',
            summary: 'Ordered 12 sheets of plasterboard from Jewson',
            materialName: 'plasterboard',
            quantity: '12',
            unit: 'sheets',
            supplierName: 'Jewson',
            deliveryTiming: 'Tuesday',
            locationOrUse: null,
            costAmount: '50',
            costCurrency: 'GBP',
            costQualifier: 'each' as const,
            totalCostAmount: null,
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
            summary: 'Ordered 12 more sheets of plasterboard',
            materialName: 'plasterboard',
            quantity: '12',
            unit: 'sheets',
            supplierName: 'Jewson',
            deliveryTiming: 'Thursday',
            locationOrUse: null,
            costAmount: '50',
            costCurrency: 'GBP',
            costQualifier: 'each' as const,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-005',
            reviewDecisionId: 'decision-005',
            createdAt: '2026-06-13T09:35:00.000Z',
            updatedAt: '2026-06-13T09:35:00.000Z',
            source: null,
          },
          // Different unit (lengths) → must stay separate from the sheets total
          {
            id: 'mem-view-006',
            memoryType: 'ordered_material',
            summary: 'Ordered 6 lengths of timber',
            materialName: 'timber',
            quantity: '6',
            unit: 'lengths',
            supplierName: 'Travis Perkins',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: null,
            // Genuinely currency-null: adding a cost must default the currency to
            // GBP so the line can count towards Known spend.
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-006',
            reviewDecisionId: 'decision-006',
            createdAt: '2026-06-13T09:40:00.000Z',
            updatedAt: '2026-06-13T09:40:00.000Z',
            source: null,
          },
          // Has a remembered cost, but only as an approximate basis → not safe to
          // total, so it is excluded as "Cost worth checking". No uncertaintyFlags,
          // so it does NOT appear in the scan "Worth checking" roll-up.
          {
            id: 'mem-view-009',
            memoryType: 'ordered_material',
            summary: 'Ordered 4 packs of insulation, roughly £120',
            materialName: 'insulation',
            quantity: '4',
            unit: 'packs',
            supplierName: 'Jewson',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: '120',
            costCurrency: 'GBP',
            costQualifier: 'approx' as const,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-009',
            reviewDecisionId: 'decision-009',
            createdAt: '2026-06-13T09:42:00.000Z',
            updatedAt: '2026-06-13T09:42:00.000Z',
            source: null,
          },
          // Cost-like but excluded, with NO safe quantity/unit → attention item
          // that can only be resolved as a total ("Set as unit cost" is hidden).
          {
            id: 'mem-view-013',
            memoryType: 'ordered_material',
            summary: 'Bought some sealant, £15',
            materialName: 'sealant',
            quantity: null,
            unit: null,
            supplierName: 'Screwfix',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: '15',
            costCurrency: 'GBP',
            costQualifier: 'unknown' as const,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-013',
            reviewDecisionId: 'decision-013',
            createdAt: '2026-06-13T09:43:00.000Z',
            updatedAt: '2026-06-13T09:43:00.000Z',
            source: null,
          },
          // Historical/misclassified spend: an ordinary bought row assigned to
          // the user-created Labour category (assignment seeded below). It must
          // stay visible in Spend, count once via normal spend rules, and never
          // appear in the system Labour group (memoryType is not labour).
          {
            id: 'mem-view-015',
            memoryType: 'ordered_material',
            summary: 'Paid agency invoice for extra labourers, £150',
            materialName: 'agency invoice',
            quantity: null,
            unit: null,
            supplierName: 'SiteStaff Agency',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: '150',
            costCurrency: 'GBP',
            costQualifier: 'total' as const,
            totalCostAmount: '150',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-015',
            reviewDecisionId: 'decision-015',
            createdAt: '2026-06-13T09:46:00.000Z',
            updatedAt: '2026-06-13T09:46:00.000Z',
            source: null,
          },
          // Two like-for-like membrane rows with no cost → consolidate to a single
          // quantity row (10 rolls total) that carries no money, and both are
          // excluded from Known spend as "No cost remembered".
          {
            id: 'mem-view-010',
            memoryType: 'ordered_material',
            summary: 'Ordered 5 rolls of DPM membrane',
            materialName: 'membrane',
            quantity: '5',
            unit: 'rolls',
            supplierName: 'Travis Perkins',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: null,
            costCurrency: 'GBP',
            costQualifier: null,
            totalCostAmount: null,
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
            summary: 'Ordered 5 more rolls of DPM membrane',
            materialName: 'membrane',
            quantity: '5',
            unit: 'rolls',
            supplierName: 'Travis Perkins',
            deliveryTiming: null,
            locationOrUse: null,
            costAmount: null,
            costCurrency: 'GBP',
            costQualifier: null,
            totalCostAmount: null,
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
            summary: 'Used OSB boards on the back wall',
            materialName: 'OSB',
            quantity: null,
            unit: null,
            supplierName: null,
            deliveryTiming: null,
            locationOrUse: 'back wall',
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-002',
            reviewDecisionId: 'decision-002',
            createdAt: '2026-06-13T10:00:00.000Z',
            updatedAt: '2026-06-13T10:00:00.000Z',
            source: null,
          },
        ],
      },
      // Labour day-model cases (Labour Tracking V2), rebased so the "0 days ago"
      // items land today and mem-labour-1 lands yesterday:
      //  - Mike 4h + Kurt 6h: two entries from ONE note, same day → 10h day total
      //  - mem-labour-1: hours-only, no named person, yesterday
      //  - mem-labour-2: rated (8h × £35 = £280), assigned to the labour category
      //  - mem-labour-3: trusted £600 total, no category → still under Labour in Spend
      //  - mem-labour-6: worth checking → visible but excluded from hour totals
      {
        key: 'labour',
        label: 'Labour',
        items: [
          // Two labour entries extracted from one voice note (same source).
          {
            id: 'mem-labour-4',
            memoryType: 'labour',
            summary: 'Mike worked 4 hours',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
            labourHours: '4', labourPerson: 'Mike', labourTask: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l4', reviewDecisionId: 'decision-l4',
            createdAt: '2026-06-13T11:30:00.000Z', updatedAt: '2026-06-13T11:30:00.000Z',
            source: {
              candidateFactId: 'fact-l4', noteId: 'note-l4', transcriptId: 'trans-l4',
              capturedAt: '2026-06-13T11:25:00.000Z',
              transcriptText: 'Mike 4 hours, Kurt 6.',
            },
          },
          {
            id: 'mem-labour-5',
            memoryType: 'labour',
            summary: 'Kurt worked 6 hours',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
            labourHours: '6', labourPerson: 'Kurt', labourTask: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l5', reviewDecisionId: 'decision-l5',
            createdAt: '2026-06-13T11:29:00.000Z', updatedAt: '2026-06-13T11:29:00.000Z',
            source: {
              candidateFactId: 'fact-l5', noteId: 'note-l4', transcriptId: 'trans-l4',
              capturedAt: '2026-06-13T11:25:00.000Z',
              transcriptText: 'Mike 4 hours, Kurt 6.',
            },
          },
          // Hours-only labour with no named person: remembered, no money → not
          // counted in Spend. Rebased to YESTERDAY.
          {
            id: 'mem-labour-1',
            memoryType: 'labour',
            summary: 'Spent 6 hours fitting the cladding',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
            labourHours: '6', labourPerson: null, labourTask: 'fitting cladding',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l1', reviewDecisionId: 'decision-l1',
            createdAt: '2026-06-13T11:10:00.000Z', updatedAt: '2026-06-13T11:10:00.000Z',
            source: {
              candidateFactId: 'fact-l1', noteId: 'note-l1', transcriptId: 'trans-l1',
              capturedAt: '2026-06-13T11:05:00.000Z',
              transcriptText: 'Spent about six hours fitting the cladding today.',
            },
          },
          // Rated labour: hours × per-hour rate → safe £280 (assigned to a category).
          {
            id: 'mem-labour-2',
            memoryType: 'labour',
            summary: 'Tom did 8 hours on electrics at £35 an hour',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: '35', costCurrency: 'GBP', costQualifier: 'per_hour', totalCostAmount: '280',
            labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l2', reviewDecisionId: 'decision-l2',
            createdAt: '2026-06-13T11:15:00.000Z', updatedAt: '2026-06-13T11:15:00.000Z',
            source: null,
          },
          // Explicit labour total → safe £600, deliberately NO category: must
          // still show once under Labour in Spend.
          {
            id: 'mem-labour-3',
            memoryType: 'labour',
            summary: 'Labour on the roof came to £600',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: '600', costCurrency: 'GBP', costQualifier: 'total', totalCostAmount: '600',
            labourHours: null, labourPerson: null, labourTask: 'roof',
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-l3', reviewDecisionId: 'decision-l3',
            createdAt: '2026-06-13T11:20:00.000Z', updatedAt: '2026-06-13T11:20:00.000Z',
            source: null,
          },
          // Worth-checking labour: non-numeric hours + unresolved flag → visible
          // in the daily view but excluded from hour totals and Spend.
          {
            id: 'mem-labour-6',
            memoryType: 'labour',
            summary: 'Apprentice did about 5 hours clearing up',
            materialName: null, quantity: null, unit: null, supplierName: null,
            deliveryTiming: null, locationOrUse: null,
            costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
            labourHours: 'about 5', labourPerson: 'Apprentice', labourTask: 'clearing up',
            uncertaintyFlags: ['uncertain_hours'],
            sourceCandidateFactId: 'fact-l6', reviewDecisionId: 'decision-l6',
            createdAt: '2026-06-13T11:08:00.000Z', updatedAt: '2026-06-13T11:08:00.000Z',
            source: null,
          },
        ],
      },
      {
        key: 'leftovers',
        label: 'Leftovers',
        items: [
          // Leftover with uncertainty → never consolidated, surfaced in Worth checking
          {
            id: 'mem-view-007',
            memoryType: 'leftover_material',
            summary: 'Roughly half a bag of sand left over',
            materialName: 'sand',
            quantity: 'about half',
            unit: 'bag',
            supplierName: null,
            deliveryTiming: null,
            locationOrUse: 'in the van',
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: ['approximate_quantity'],
            sourceCandidateFactId: 'fact-007',
            reviewDecisionId: 'decision-007',
            createdAt: '2026-06-13T10:30:00.000Z',
            updatedAt: '2026-06-13T10:30:00.000Z',
            source: null,
          },
        ],
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
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
            uncertaintyFlags: [],
            sourceCandidateFactId: 'fact-008',
            reviewDecisionId: 'decision-008',
            createdAt: '2026-06-13T10:45:00.000Z',
            updatedAt: '2026-06-13T10:45:00.000Z',
            source: null,
          },
        ],
      },
      { key: 'customer_changes', label: 'Customer changes', items: [] },
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
            costAmount: null,
            costCurrency: null,
            costQualifier: null,
            totalCostAmount: null,
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
      const daysAgo = item.memoryType === 'labour'
        ? (YESTERDAY_LABOUR_IDS.has(item.id) ? 1 : 0)
        : (nonLabourIdx++ % 7)
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
    const sections = jobId === MOCK_SEED_JOB_ID ? buildMockSections() : []
    rebaseMockDates(sections)
    mockMemoryByJob.set(jobId, sections)
  }
  return mockMemoryByJob.get(jobId)!
}

// Test seam: drop any accumulated mock edits.
export function _resetMockMemoryForTesting(): void {
  mockMemoryByJob = null
  mockBudgetByJob = null
}

export function findMockItem(sections: MemoryViewSection[], id: string): MemoryViewItem | undefined {
  for (const s of sections) {
    const found = s.items.find(it => it.id === id)
    if (found) return found
  }
  return undefined
}

// Remove any existing row with the item's id, then insert it at the top of the
// section matching its (possibly new) memory type, creating the section in
// canonical order if the fixture doesn't have it yet.
export function upsertMockItem(sections: MemoryViewSection[], item: MemoryViewItem): void {
  for (const s of sections) s.items = s.items.filter(it => it.id !== item.id)
  const targetKey = MEMORY_TYPE_TO_SECTION_KEY[item.memoryType] ?? item.memoryType
  let target = sections.find(s => s.key === targetKey)
  if (!target) {
    target = { key: targetKey, label: SECTION_FULL_LABELS[targetKey] ?? targetKey, items: [] }
    sections.push(target)
    sections.sort((a, b) =>
      ((SECTION_ORDER.indexOf(a.key) + 1) || 99) - ((SECTION_ORDER.indexOf(b.key) + 1) || 99))
  }
  target.items.unshift(item)
}

// ── Stateful mock: budget categories ────────────────────────────────────────
// Resets on every full page load (module re-init), so Playwright tests that
// start with page.goto get a clean fixture with no cross-test leakage.

let mockBudgetByJob: Map<string, BudgetCategory[]> | null = null

export function mockBudgetCategoriesFor(jobId: string): BudgetCategory[] {
  if (!mockBudgetByJob) mockBudgetByJob = new Map()
  if (!mockBudgetByJob.has(jobId)) {
    const now = '2026-06-28T08:00:00.000Z'
    if (jobId === MOCK_SEED_JOB_ID) {
      // timber (budget, no spend), cladding (budget + spend), electrics (no
      // budget), labour (budget + labour spend).
      mockBudgetByJob.set(jobId, [
        { id: 'cat-timber', jobId, name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: now, updatedAt: now },
        { id: 'cat-cladding', jobId, name: 'cladding', budgetAmount: '2000', budgetCurrency: 'GBP', sortOrder: 1, isArchived: false, createdAt: now, updatedAt: now },
        { id: 'cat-electrics', jobId, name: 'electrics', budgetAmount: null, budgetCurrency: null, sortOrder: 2, isArchived: false, createdAt: now, updatedAt: now },
        { id: 'cat-labour', jobId, name: 'labour', budgetAmount: '1500', budgetCurrency: 'GBP', sortOrder: 3, isArchived: false, createdAt: now, updatedAt: now },
      ])
      // Seed safe assigned items: plasterboard (£1200) → cladding, and the rated
      // labour (Tom, £280) → labour. Leaves hardcore (£40) and the £600 roof
      // labour safe-but-uncategorised, and the rest excluded.
      const sections = mockSectionsFor(jobId)
      for (const s of sections) for (const it of s.items) {
        if (it.id === 'mem-view-004' || it.id === 'mem-view-005') it.budgetCategoryId = 'cat-cladding'
        if (it.id === 'mem-labour-2') it.budgetCategoryId = 'cat-labour'
        // historical non-labour spend left assigned to the Labour category
        if (it.id === 'mem-view-015') it.budgetCategoryId = 'cat-labour'
      }
    } else {
      mockBudgetByJob.set(jobId, []) // a job with no budget categories
    }
  }
  return mockBudgetByJob.get(jobId)!
}
