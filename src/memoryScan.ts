import type { MemoryViewItem } from './types'
export function localNoonISO(dateOnly: string): string {
  return `${dateOnly}T12:00:00`
}

// YYYY-MM-DD local calendar day for an ISO timestamp ('' when unparseable).
export function localDateKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

// Builder-facing day heading: Today / Yesterday / "Mon 6 Jul" (with the year
// only when it isn't this year).
export function friendlyDayLabel(dateKey: string, now: Date = new Date()): string {
  if (!dateKey) return 'Day not known'
  const today = localDateKey(now.toISOString())
  if (dateKey === today) return 'Today'
  const yesterday = localDateKey(new Date(now.getTime() - 86_400_000).toISOString())
  if (dateKey === yesterday) return 'Yesterday'
  const d = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 'Day not known'
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// When an item happened, best-effort: the remembered date, else when the note
// was captured, else when the row was created. Same order the labour day
// grouping uses, so a card and its day heading can never disagree.
export function effectiveItemDate(item: MemoryViewItem): string | null {
  return item.happenedAt ?? item.source?.capturedAt ?? item.createdAt ?? null
}

// Concise date cue on an item card: Today / Yesterday / "8 Jul" / "31 Dec 2025".
// Deliberately shorter than friendlyDayLabel (no weekday) — this sits inline on
// a card as a memory/audit cue, not as a day heading. Not an accounting date.
export function itemDateLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const key = localDateKey(iso)
  if (key === localDateKey(now.toISOString())) return 'Today'
  if (key === localDateKey(new Date(now.getTime() - 86_400_000).toISOString())) return 'Yesterday'
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export const MEMORY_TYPE_TO_SECTION_KEY: Record<string, string> = {
  ordered_material: 'ordered_materials',
  used_material: 'used_materials',
  leftover_material: 'leftovers',
  returned_material: 'returned_materials',
  labour: 'labour',
  general_note: 'general_notes',
  supplier_delivery_note: 'supplier_delivery_notes',
  customer_change: 'customer_changes',
  watch_out: 'watch_outs',
}
export const SECTION_ORDER = [
  'labour',
  'ordered_materials',
  'used_materials',
  'leftovers',
  'returned_materials',
  'general_notes',
  'supplier_delivery_notes',
  'customer_changes',
  'watch_outs',
]
export const SECTION_FULL_LABELS: Record<string, string> = {
  labour: 'Hours',
  ordered_materials: 'Bought',
  used_materials: 'Used',
  leftovers: 'Left over',
  returned_materials: 'Returned',
  general_notes: 'Notes',
  supplier_delivery_notes: 'Notes',
  customer_changes: 'Notes',
  watch_outs: 'Notes',
}
