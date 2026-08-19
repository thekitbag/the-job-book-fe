import type {
  CreateManualWorkshopItemRequest, MemoryViewItem, MoveLeftoverToWorkshopRequest,
  PatchWorkshopItemRequest, SourceWorkshopState, WorkshopActionResponse, WorkshopBookHomeSummary,
  WorkshopItem, WorkshopItemState, WorkshopMoveResponse, WorkshopResponse,
} from '../../types'
import { ApiError } from '../client'
import { MOCK_JOBS } from './jobs'
import { findMockItem, mockSectionsFor } from './state'

// Mock stand-in for the Workshop endpoints.
//
// The real backend owns the ordering, the counts, the labels and the state
// machine. This module therefore does that work the way the backend would —
// inside the mock only — so the Book Home preview is provably the first three
// of the same available list the Workshop page renders, and so a source job and
// the Workshop can never be seeded into disagreeing with each other.
//
// What it deliberately does NOT do is touch money. There is no code path here
// that reads or writes a cost, a Budget category, a paid state or a job status,
// which is the strongest form the "moving is not spending" invariant can take
// in a fixture: the arithmetic simply isn't reachable from these calls.

type Stored = {
  id: string
  materialName: string
  roughAmount: string | null
  sourceKind: 'leftover' | 'manual'
  state: WorkshopItemState
  enteredWorkshopAt: string
  resolvedAt: string | null
  sourceJobId: string | null
  sourceMemoryItemId: string | null
}

const KITCHEN = 'job-pilot-extension-002'
const WHITMORE = 'job-pilot-finished-005'
const OKORO = 'job-pilot-finished-006'

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

/**
 * "today" / "yesterday" / "6 Aug".
 *
 * Recency, not a timestamp: what Mike wants from a Workshop row is how stale
 * the belief is, and "today" says that better than a date he has to subtract.
 */
function recencyLabel(iso: string): string {
  const then = new Date(iso)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(then)
}

// ── The seeded workshop ─────────────────────────────────────────────────────
// Six available items covering every row shape the list has to survive: source
// jobs in progress and finished, two added by hand, one with no rough amount at
// all, and two materials whose names are near-duplicates of leftovers still
// sitting on the Garden Room job (sand, fence posts) — genuinely separate stuff
// that must never be merged into one row.
//
// Two terminal items complete the lifecycle: one used up, one that was never
// there, both source-linked so "Put back in the Workshop" has something to act
// on from the source job.
const DEFAULT_SEED: Stored[] = [
  { id: 'ws-osb', materialName: 'OSB', roughAmount: 'about 3 sheets', sourceKind: 'leftover', state: 'available', enteredWorkshopAt: isoDaysAgo(0), resolvedAt: null, sourceJobId: KITCHEN, sourceMemoryItemId: 'mem-kitchen-left-1' },
  { id: 'ws-screws', materialName: 'Screws, 5.0×80', roughAmount: 'half a box', sourceKind: 'leftover', state: 'available', enteredWorkshopAt: isoDaysAgo(2), resolvedAt: null, sourceJobId: KITCHEN, sourceMemoryItemId: 'mem-kitchen-left-2' },
  { id: 'ws-sand', materialName: 'Sand', roughAmount: 'part of a bag', sourceKind: 'manual', state: 'available', enteredWorkshopAt: isoDaysAgo(5), resolvedAt: null, sourceJobId: null, sourceMemoryItemId: null },
  { id: 'ws-membrane', materialName: 'Membrane', roughAmount: 'part of a roll', sourceKind: 'leftover', state: 'available', enteredWorkshopAt: isoDaysAgo(9), resolvedAt: null, sourceJobId: KITCHEN, sourceMemoryItemId: 'mem-kitchen-left-3' },
  // No rough amount at all. Must render as material alone — never "0", never
  // "unknown stock", never a prompt to invent a quantity.
  { id: 'ws-insulation', materialName: 'Insulation, 100mm', roughAmount: null, sourceKind: 'manual', state: 'available', enteredWorkshopAt: isoDaysAgo(14), resolvedAt: null, sourceJobId: null, sourceMemoryItemId: null },
  // Finished source job: the provenance stays visible and the job stays finished.
  { id: 'ws-posts', materialName: 'Fence posts', roughAmount: '4 or 5', sourceKind: 'leftover', state: 'available', enteredWorkshopAt: isoDaysAgo(26), resolvedAt: null, sourceJobId: WHITMORE, sourceMemoryItemId: 'mem-whitmore-left-1' },
  // Terminal outcomes — out of the available list, still correctable.
  { id: 'ws-decking', materialName: 'Decking boards', roughAmount: '7 or 8', sourceKind: 'leftover', state: 'used_up', enteredWorkshopAt: isoDaysAgo(40), resolvedAt: isoDaysAgo(6), sourceJobId: OKORO, sourceMemoryItemId: 'mem-okoro-left-1' },
  { id: 'ws-cement-board', materialName: 'Cement board', roughAmount: 'a sheet', sourceKind: 'leftover', state: 'wasnt_there', enteredWorkshopAt: isoDaysAgo(35), resolvedAt: isoDaysAgo(4), sourceJobId: WHITMORE, sourceMemoryItemId: 'mem-whitmore-left-3' },
]

let items: Stored[] | null = null
let scenario = 'default'
let nextId = 1

function store(): Stored[] {
  if (!items) items = scenario === 'workshop-empty' ? [] : DEFAULT_SEED.map(i => ({ ...i }))
  return items
}

export function _resetMockWorkshopForTesting(nextScenario = 'default'): void {
  scenario = nextScenario
  items = null
  nextId = 1
}

// The one scenario that makes every write fail. It exists to prove the rule
// that matters most here: a failed action leaves the source job and the
// Workshop exactly as they were, rather than half-moved.
function failIfScenarioSaysSo(): void {
  if (scenario === 'workshop-fails') throw new ApiError('Workshop is unavailable', 500)
}

// ── Shaping ─────────────────────────────────────────────────────────────────

function sourceItemLabel(stored: Stored): string | null {
  if (!stored.sourceJobId || !stored.sourceMemoryItemId) return null
  const item = findMockItem(mockSectionsFor(stored.sourceJobId), stored.sourceMemoryItemId)
  if (!item) return null
  return item.materialName ? `${item.materialName} left over` : item.summary
}

function shape(stored: Stored): WorkshopItem {
  const job = stored.sourceJobId ? MOCK_JOBS.find(j => j.id === stored.sourceJobId) ?? null : null
  const status = job && job.status !== 'archived' ? job.status : null
  return {
    id: stored.id,
    materialName: stored.materialName,
    roughAmount: stored.roughAmount,
    sourceKind: stored.sourceKind,
    state: stored.state,
    enteredWorkshopAt: stored.enteredWorkshopAt,
    enteredWorkshopLabel: recencyLabel(stored.enteredWorkshopAt),
    resolvedAt: stored.resolvedAt,
    resolvedLabel: stored.resolvedAt ? recencyLabel(stored.resolvedAt) : null,
    sourceJobId: stored.sourceJobId,
    sourceJobTitle: job?.title ?? null,
    sourceJobStatus: status,
    sourceJobStatusLabel: status === 'planning' ? 'Planning' : status === 'finished' ? 'Finished' : status === 'started' ? 'In progress' : null,
    sourceMemoryItemId: stored.sourceMemoryItemId,
    sourceItemLabel: sourceItemLabel(stored),
    // Provenance in one printable string, so a row never has to decide what
    // "no source job" should read as.
    sourceLabel: job?.title ?? 'Added by hand',
  }
}

/** Newest entered first, tie-broken by id so the order is stable across reads. */
function availableSorted(): Stored[] {
  return store()
    .filter(i => i.state === 'available')
    .sort((a, b) => b.enteredWorkshopAt.localeCompare(a.enteredWorkshopAt) || a.id.localeCompare(b.id))
}

function bookHome(available: WorkshopItem[]): WorkshopBookHomeSummary {
  const count = available.length
  return {
    // True even when empty: Workshop is a destination now, and a row that
    // disappears when there is nothing in it is a route Mike cannot learn.
    showWorkshopRow: true,
    availableCount: count,
    availableLabel: count === 0 ? null : `${count} ${count === 1 ? 'thing' : 'things'}`,
    // The same first three, not a separate query — the cover cannot show
    // something the page then fails to list.
    previewItems: available.slice(0, 3).map(i => ({
      id: i.id,
      materialName: i.materialName,
      roughAmount: i.roughAmount,
      sourceLabel: i.sourceLabel ?? i.sourceJobTitle ?? 'Added by hand',
    })),
  }
}

export function mockGetWorkshop(): WorkshopResponse {
  const availableItems = availableSorted().map(shape)
  return {
    generatedAt: new Date().toISOString(),
    bookHome: bookHome(availableItems),
    availableItems,
  }
}

// ── Source-leftover read model ──────────────────────────────────────────────

const STATE_TO_SOURCE: Record<WorkshopItemState, SourceWorkshopState | null> = {
  available: 'in_workshop',
  used_up: 'used_up',
  wasnt_there: 'wasnt_there',
  // An undone move leaves no trace on the source row: the material is simply a
  // leftover on that job again, which is exactly what undoing it claimed.
  moved_back: null,
}

function linkFor(jobId: string, memoryItemId: string): Stored | undefined {
  return store().find(i =>
    i.sourceJobId === jobId && i.sourceMemoryItemId === memoryItemId && i.state !== 'moved_back')
}

/**
 * Decorate a memory-view item with its current Workshop state.
 *
 * The recorded quantity and unit are left exactly as they are — the leftover is
 * still the memory it always was. The Workshop's current wording rides
 * alongside as `workshopRoughAmount`, so there is one current amount for the
 * material without a job's own record being overwritten by a later correction
 * made somewhere else. Cost, supplier and every other field pass through
 * untouched, because nothing here has any business changing them.
 */
export function mockDecorateWorkshopState(jobId: string, item: MemoryViewItem): MemoryViewItem {
  if (item.memoryType !== 'leftover_material') return item
  const link = linkFor(jobId, item.id)
  const state = link ? STATE_TO_SOURCE[link.state] : null
  if (!link || !state) {
    return { ...item, workshopState: 'not_moved', workshopItemId: null, workshopRoughAmount: null }
  }
  return {
    ...item,
    workshopState: state,
    workshopItemId: link.id,
    workshopRoughAmount: link.roughAmount,
    workshopEnteredAt: link.enteredWorkshopAt,
    workshopEnteredLabel: recencyLabel(link.enteredWorkshopAt),
    workshopResolvedAt: link.resolvedAt,
    workshopResolvedLabel: link.resolvedAt ? recencyLabel(link.resolvedAt) : null,
  }
}

function sourceItemResponse(stored: Stored): MemoryViewItem | null {
  if (!stored.sourceJobId || !stored.sourceMemoryItemId) return null
  const item = findMockItem(mockSectionsFor(stored.sourceJobId), stored.sourceMemoryItemId)
  if (!item) return null
  return mockDecorateWorkshopState(stored.sourceJobId, { ...item })
}

// ── Writes ──────────────────────────────────────────────────────────────────

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function find(workshopItemId: string): Stored {
  const item = store().find(i => i.id === workshopItemId)
  if (!item) throw workshopError('WORKSHOP_ITEM_NOT_FOUND', 'That is not in the Workshop', 404)
  return item
}

function workshopError(code: string, message: string, status: number): ApiError {
  const err = new ApiError(message, status) as ApiError & { code?: string }
  err.code = code
  return err
}

export function mockMoveLeftoverToWorkshop(
  jobId: string,
  memoryItemId: string,
  req: MoveLeftoverToWorkshopRequest,
): WorkshopMoveResponse {
  failIfScenarioSaysSo()
  const sections = mockSectionsFor(jobId)
  const source = findMockItem(sections, memoryItemId)
  if (!source || source.memoryType !== 'leftover_material') {
    throw workshopError('WORKSHOP_SOURCE_NOT_FOUND', 'That leftover is no longer on this job', 404)
  }
  // A leftover cannot be in the Workshop twice at once. This is the rule that
  // keeps one physical pile from becoming two availability claims.
  if (linkFor(jobId, memoryItemId)) {
    throw workshopError('WORKSHOP_SOURCE_ALREADY_MOVED', 'That is already in the Workshop', 400)
  }
  const fallback = [source.quantity, source.unit].filter(Boolean).join(' ') || null
  const stored: Stored = {
    id: `ws-mock-${nextId++}`,
    materialName: source.materialName?.trim() || source.summary,
    roughAmount: 'roughAmount' in req ? trimToNull(req.roughAmount) : fallback,
    sourceKind: 'leftover',
    state: 'available',
    enteredWorkshopAt: new Date().toISOString(),
    resolvedAt: null,
    sourceJobId: jobId,
    sourceMemoryItemId: memoryItemId,
  }
  store().push(stored)
  // Note what is absent: no job status change, no budget category, no cost
  // field, no money event. The source memory item itself is not modified at all.
  return { workshopItem: shape(stored), sourceItem: sourceItemResponse(stored)! }
}

export function mockAddManualWorkshopItem(req: CreateManualWorkshopItemRequest): WorkshopItem {
  failIfScenarioSaysSo()
  const materialName = (req.materialName ?? '').trim()
  if (!materialName) throw workshopError('MISSING_FIELD', 'Say what it is', 400)
  const stored: Stored = {
    id: `ws-mock-${nextId++}`,
    materialName,
    roughAmount: trimToNull(req.roughAmount),
    sourceKind: 'manual',
    state: 'available',
    enteredWorkshopAt: new Date().toISOString(),
    resolvedAt: null,
    sourceJobId: null,
    sourceMemoryItemId: null,
  }
  store().push(stored)
  return shape(stored)
}

export function mockPatchWorkshopItem(workshopItemId: string, req: PatchWorkshopItemRequest): WorkshopItem {
  failIfScenarioSaysSo()
  const item = find(workshopItemId)
  if (item.state !== 'available') {
    throw workshopError('WORKSHOP_INVALID_STATE', 'That is not in the Workshop any more', 400)
  }
  if (req.materialName !== undefined) {
    // Correcting the material of a source-linked item belongs on the source
    // item, where the leftover's own wording lives — see the v1 rule in the
    // spec. Only a hand-added item can be renamed from here.
    if (item.sourceKind !== 'manual') {
      throw workshopError('WORKSHOP_INVALID_STATE', 'Change the material on the source job', 400)
    }
    const name = req.materialName.trim()
    if (!name) throw workshopError('INVALID_FIELD', 'Say what it is', 400)
    item.materialName = name
  }
  // Free text in, free text out. Blank means blank — never 0.
  if ('roughAmount' in req) item.roughAmount = trimToNull(req.roughAmount)
  return shape(item)
}

function resolve(workshopItemId: string, state: WorkshopItemState): WorkshopActionResponse {
  failIfScenarioSaysSo()
  const item = find(workshopItemId)
  if (item.state !== 'available') {
    throw workshopError('WORKSHOP_INVALID_STATE', 'That is not in the Workshop any more', 400)
  }
  item.state = state
  // moved_back is an undone move, not an outcome with a date: there is nothing
  // that happened to the material to record the day of.
  item.resolvedAt = state === 'moved_back' ? null : new Date().toISOString()
  return { workshopItem: shape(item), sourceItem: sourceItemResponse(item) }
}

export function mockUndoWorkshopMove(workshopItemId: string): WorkshopActionResponse {
  failIfScenarioSaysSo()
  const item = find(workshopItemId)
  if (item.sourceKind !== 'leftover') {
    throw workshopError('WORKSHOP_INVALID_STATE', 'This was added by hand, so there is nothing to undo', 400)
  }
  return resolve(workshopItemId, 'moved_back')
}

export function mockWorkshopUsedUp(workshopItemId: string): WorkshopActionResponse {
  return resolve(workshopItemId, 'used_up')
}

export function mockWorkshopWasntThere(workshopItemId: string): WorkshopActionResponse {
  return resolve(workshopItemId, 'wasnt_there')
}

export function mockPutBackWorkshopItem(workshopItemId: string): WorkshopActionResponse {
  failIfScenarioSaysSo()
  const item = find(workshopItemId)
  if (item.state !== 'used_up' && item.state !== 'wasnt_there') {
    throw workshopError('WORKSHOP_INVALID_STATE', 'That is already in the Workshop', 400)
  }
  // The same item comes back with the rough amount it left with — never a
  // second Workshop item for the same material.
  item.state = 'available'
  item.resolvedAt = null
  return { workshopItem: shape(item), sourceItem: sourceItemResponse(item) }
}
