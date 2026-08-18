import type { MemoryViewItem, SourceWorkshopState } from './types'

// The Workshop capability, seen from inside a job.
//
// A confirmed leftover is the one memory item that can also be availability
// memory. It never leaves its job: it stays on the Left over list with its
// purchase context intact and gains a current Workshop state, which is what
// these controls read and change. Threaded from the workspace (which holds the
// job id and the refetches) down to the item action drawer, the same way
// mark-as-paid is.
export interface WorkshopSourceControls {
  // Fire the move. The workspace handles the request, the result sheet, the
  // refetch and the error — the drawer only offers the action.
  onMoveToWorkshop: (item: MemoryViewItem) => void
  // Reactivate the same Workshop item after a mistaken terminal outcome. Never
  // creates a second one, and never touches the job's cost.
  onPutBackInWorkshop: (item: MemoryViewItem) => void
  // Item currently in flight, so its control can show a busy state.
  pendingItemId: string | null
}

/**
 * Where this leftover currently stands with the Workshop.
 *
 * Absent means an older backend that has never been asked about Workshop, which
 * is the same as never having been moved — so it reads as `not_moved` and the
 * move is offered. Nothing else in the UI branches on the field being missing.
 */
export function workshopState(item: MemoryViewItem): SourceWorkshopState {
  return item.workshopState ?? 'not_moved'
}

/** Only a confirmed leftover can go to the Workshop, and only once at a time. */
export function canMoveToWorkshop(item: MemoryViewItem): boolean {
  return item.memoryType === 'leftover_material' && workshopState(item) === 'not_moved'
}

/**
 * A terminal outcome is correctable from the source job for as long as the row
 * exists — the immediate Undo in Workshop is the first chance, not the only one.
 */
export function canPutBackInWorkshop(item: MemoryViewItem): boolean {
  if (item.memoryType !== 'leftover_material') return false
  const state = workshopState(item)
  return (state === 'used_up' || state === 'wasnt_there') && !!item.workshopItemId
}

// The state chip on the source row. State is said in words, never by fading the
// row out: a used-up leftover is a fact Mike recorded, not a deactivated record.
//
// "USED UP", not "USED UP FROM WORKSHOP" — the row it sits on already supplies
// the context, and the longer label crowds a phone-width line for no gain.
export const WORKSHOP_CHIP_LABEL: Record<SourceWorkshopState, string | null> = {
  not_moved: null,
  in_workshop: 'IN WORKSHOP',
  used_up: 'USED UP',
  wasnt_there: "WASN'T THERE",
}

/**
 * The dated half of the state, for the row's meta line: when it went in, or
 * when the outcome was recorded. Returns null when there is nothing dated to
 * say, so the meta line simply doesn't gain a segment.
 */
export function workshopStateDetail(item: MemoryViewItem): string | null {
  switch (workshopState(item)) {
    case 'in_workshop':
      return item.workshopEnteredLabel ? `in the workshop since ${item.workshopEnteredLabel}` : 'in the workshop'
    case 'used_up':
      return item.workshopResolvedLabel ? `used up ${item.workshopResolvedLabel}` : 'used up'
    case 'wasnt_there':
      return item.workshopResolvedLabel ? `corrected ${item.workshopResolvedLabel}` : 'corrected'
    default:
      return null
  }
}
