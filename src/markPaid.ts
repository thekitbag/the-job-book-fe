import type { MemoryViewItem } from './types'

// Mark-as-paid capability for a Budget cost item, threaded from the workspace
// (which holds both Money and Budget state) down to the item action drawer.
// Every predicate is item-scoped so a row can decide its own affordance.
export interface MarkPaidControls {
  // An active paid marker already exists for this item.
  isPaid: (item: MemoryViewItem) => boolean
  // Eligible to be marked paid now (trusted GBP Budget cost, active, unpaid).
  canMarkPaid: (item: MemoryViewItem) => boolean
  // Fire the mark-paid; the workspace handles refetch + toast + errors.
  onMarkPaid: (item: MemoryViewItem) => void
  // Undo an accidental paid mark: soft-deletes the linked Money out and leaves
  // the Budget cost unchanged. The workspace handles refetch + toast + errors.
  onUndoPaid: (item: MemoryViewItem) => void
  // Source item id currently in flight, so its control can show a busy state
  // (covers both mark-paid and undo-paid).
  pendingItemId: string | null
}

// Bought/ordered materials, legacy labour cost, and general budget_cost items
// carry a Budget cost that can be paid out. Everything else (used/leftover/
// returned, notes, photos, hours-only labour) never can.
export function markPaidEligibleType(item: MemoryViewItem): boolean {
  return item.memoryType === 'ordered_material' || item.memoryType === 'labour' || item.memoryType === 'budget_cost'
}

// A trusted, safe GBP line total the item would be paid at, or null when it has
// none. Matches the backend's "amount derived from the trusted Budget line
// total" rule so the FE never has to send an amount.
export function trustedGbpLineTotal(item: MemoryViewItem): string | null {
  if (!markPaidEligibleType(item)) return null
  if ((item.uncertaintyFlags ?? []).length > 0) return null
  if ((item.costCurrency || 'GBP') !== 'GBP') return null
  const total = item.totalCostAmount
  if (!total || !(parseFloat(total) > 0)) return null
  return total
}
