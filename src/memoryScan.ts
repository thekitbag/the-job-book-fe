import type { MemoryViewItem, MemoryViewSection, OrderedCostSummary, ScanViewItem, ScanViewSection } from './types'

// ── Shared display formatting ───────────────────────────────────────────────
// Centralised so the scan summary and the detail cards (and the review queue)
// format cost/total identically and cannot drift.

export function formatCostLabel(amount: string | null, currency: string | null, qualifier: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  const q: Record<string, string> = { each: ' each', total: ' total', approx: ' approx.' }
  return `${sym}${amount}${qualifier ? (q[qualifier] ?? '') : ''}`
}

export function formatTotalLabel(amount: string | null, currency: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  return `${sym}${amount}`
}

function currencySymbol(currency: string | null): string {
  return currency === 'GBP' ? '£' : (currency ? `${currency} ` : '£')
}

// Money formatter for derived sums — trims a trailing .00, keeps real decimals.
export function formatMoney(amount: number, currency: string | null): string {
  const rounded = Math.round(amount * 100) / 100
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
  return `${currencySymbol(currency)}${text}`
}

// Detail-card cost rows: distinguish unit cost from line total, and mark an
// unclear basis as worth checking rather than a trusted figure. No bare numbers.
export function costDetailRows(item: {
  costAmount: string | null
  costCurrency: string | null
  costQualifier: string | null
  totalCostAmount: string | null
}): [string, string][] {
  const rows: [string, string][] = []
  const sym = currencySymbol(item.costCurrency)
  const { costAmount: amount, costQualifier: qualifier, totalCostAmount: total } = item

  if (amount && qualifier === 'each') {
    rows.push(['Unit cost', `${sym}${amount} each`])
  } else if (amount && qualifier === 'total') {
    // amount is itself the line total; fold into the Total row below if no
    // explicit total is set
    if (!total) rows.push(['Total', `${sym}${amount}`])
  } else if (amount) {
    // approx / unknown / unqualified basis — show but flag, never as a total
    rows.push(['Cost', `${sym}${amount} — worth checking`])
  }

  if (total) rows.push(['Total', `${sym}${total}`])
  return rows
}

const DECIMAL = /^\d+(\.\d+)?$/

/**
 * Safe line total for a single bought/ordered memory item, mirroring the
 * backend rules. Returns null when it is not safe to total (missing/approx
 * quantity, missing unit, ambiguous basis, unresolved flags, missing currency).
 */
export function safeLineTotal(item: MemoryViewItem): { amount: number; currency: string } | null {
  if ((item.uncertaintyFlags ?? []).length > 0) return null
  const currency = item.costCurrency
  if (!currency) return null

  // 1. explicit, trusted line total
  if (item.totalCostAmount && DECIMAL.test(item.totalCostAmount) && item.costQualifier !== 'approx' && item.costQualifier !== 'unknown') {
    return { amount: parseFloat(item.totalCostAmount), currency }
  }
  // 2. safely derived from quantity × unit cost
  if (
    item.costQualifier === 'each' &&
    item.costAmount && DECIMAL.test(item.costAmount) &&
    item.quantity && DECIMAL.test(item.quantity) &&
    item.unit
  ) {
    return { amount: parseFloat(item.quantity) * parseFloat(item.costAmount), currency }
  }
  return null
}

/**
 * Frontend fallback that mirrors the backend memory-view.costSummary safe
 * rules — used for mock/local resilience and to keep Known spend live after an
 * in-place edit. Backend costSummary is preferred when present.
 */
export function deriveCostSummary(sections: MemoryViewSection[]): OrderedCostSummary {
  const ordered = sections.find(s => s.key === 'ordered_materials')?.items ?? []
  const currency = 'GBP'

  const included: MemoryViewItem[] = []
  const excludedMemoryItemIds: string[] = []
  let missingCostCount = 0
  let uncertainCostCount = 0
  let total = 0

  for (const item of ordered) {
    const hasAnyCost = !!(item.costAmount || item.totalCostAmount)
    const line = safeLineTotal(item)
    if (line && line.currency === currency) {
      included.push(item)
      total += line.amount
    } else if (!hasAnyCost) {
      missingCostCount++
      excludedMemoryItemIds.push(item.id)
    } else {
      // has a cost but it's not safe to total (uncertain / ambiguous basis)
      uncertainCostCount++
      excludedMemoryItemIds.push(item.id)
    }
  }

  // Consolidate included items into like-for-like rows — only when BOTH
  // material and unit are present (matches the backend rule). Items missing
  // either stay standalone so we never merge unlike explicit totals.
  const rowMap = new Map<string, { item: MemoryViewItem; amount: number; ids: string[] }>()
  for (const item of included) {
    const groupable = !!item.materialName && !!item.unit
    const key = groupable ? `${item.materialName}|${item.unit}` : `__standalone__${item.id}`
    const amount = safeLineTotal(item)!.amount
    const existing = rowMap.get(key)
    if (existing) {
      existing.amount += amount
      existing.ids.push(item.id)
    } else {
      rowMap.set(key, { item, amount, ids: [item.id] })
    }
  }
  const rows = [...rowMap.entries()].map(([key, { item, amount, ids }]) => ({
    key,
    materialName: item.materialName ?? '',
    quantity: item.quantity,
    unit: item.unit,
    lineTotalAmount: String(Math.round(amount * 100) / 100),
    lineTotalCurrency: currency,
    lineTotalLabel: `${formatMoney(amount, currency)} total`,
    memoryItemIds: ids,
  }))

  const hasKnown = included.length > 0
  return {
    knownSpendAmount: hasKnown ? String(Math.round(total * 100) / 100) : null,
    knownSpendCurrency: hasKnown ? currency : null,
    knownSpendLabel: hasKnown ? `${formatMoney(total, currency)} known spend` : null,
    includedMemoryItemIds: included.map(i => i.id),
    missingCostCount,
    uncertainCostCount,
    excludedMemoryItemIds,
    rows,
  }
}

// memoryType → memory-view section key (used to re-home an item after a type edit)
export const MEMORY_TYPE_TO_SECTION_KEY: Record<string, string> = {
  ordered_material: 'ordered_materials',
  used_material: 'used_materials',
  leftover_material: 'leftovers',
  supplier_delivery_note: 'supplier_delivery_notes',
  customer_change: 'customer_changes',
  watch_out: 'watch_outs',
}

export const SECTION_ORDER = [
  'ordered_materials', 'used_materials', 'leftovers',
  'supplier_delivery_notes', 'customer_changes', 'watch_outs',
]

export const SECTION_FULL_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered materials',
  used_materials: 'Used materials',
  leftovers: 'Leftovers',
  supplier_delivery_notes: 'Supplier delivery notes',
  customer_changes: 'Customer changes',
  watch_outs: 'Watch outs',
}

// ── Scan summary derivation ─────────────────────────────────────────────────

type ScanGroupKind = 'material' | 'prose'

interface ScanGroupConfig {
  key: string
  label: string
  kind: ScanGroupKind
  // Only bought/ordered consolidates like-for-like quantities into totals.
  consolidate: boolean
}

const SCAN_GROUPS: ScanGroupConfig[] = [
  { key: 'ordered_materials', label: 'Bought / ordered', kind: 'material', consolidate: true },
  { key: 'used_materials', label: 'Used', kind: 'material', consolidate: false },
  { key: 'leftovers', label: 'Left over', kind: 'material', consolidate: false },
  { key: 'supplier_delivery_notes', label: 'Supplier notes', kind: 'prose', consolidate: false },
  { key: 'customer_changes', label: 'Customer changes', kind: 'prose', consolidate: false },
  { key: 'watch_outs', label: 'Watch-outs', kind: 'prose', consolidate: false },
]

const DECIMAL_RE = /^\d+(\.\d+)?$/

function isUncertain(item: MemoryViewItem): boolean {
  return (item.uncertaintyFlags ?? []).length > 0
}

function singleRow(item: MemoryViewItem, kind: ScanGroupKind): ScanViewItem {
  return {
    memoryType: item.memoryType,
    primaryText: kind === 'prose' ? item.summary : null,
    materialName: item.materialName,
    quantity: item.quantity,
    unit: item.unit,
    supplierName: item.supplierName,
    deliveryTiming: item.deliveryTiming,
    locationOrUse: item.locationOrUse,
    costLabel: formatCostLabel(item.costAmount, item.costCurrency, item.costQualifier),
    totalCostLabel: formatTotalLabel(item.totalCostAmount, item.costCurrency),
    uncertaintyFlags: item.uncertaintyFlags ?? [],
    consolidated: false,
    memoryItemIds: [item.id],
  }
}

// Consolidate like-for-like rows for a material section. Only items that are
// safe to total (same material+unit, strict-decimal quantity, no uncertainty)
// are summed; everything else stays as its own row.
function buildMaterialRows(items: MemoryViewItem[], consolidate: boolean): ScanViewItem[] {
  if (!consolidate) return items.map(it => singleRow(it, 'material'))

  const groups = new Map<string, MemoryViewItem[]>()
  const rows: ScanViewItem[] = []

  for (const item of items) {
    const canGroup =
      item.materialName != null && item.materialName !== '' &&
      item.unit != null && item.unit !== '' &&
      DECIMAL_RE.test(item.quantity ?? '') &&
      !isUncertain(item)
    if (canGroup) {
      const k = `${item.materialName}|${item.unit}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(item)
    } else {
      rows.push(singleRow(item, 'material'))
    }
  }

  for (const groupItems of groups.values()) {
    if (groupItems.length === 1) {
      rows.push(singleRow(groupItems[0], 'material'))
      continue
    }
    const first = groupItems[0]
    const totalQty = groupItems.reduce((sum, it) => sum + parseFloat(it.quantity!), 0)
    const allSameCost = groupItems.every(it =>
      it.costAmount === first.costAmount &&
      it.costCurrency === first.costCurrency &&
      it.costQualifier === first.costQualifier)
    const allSameSupplier = groupItems.every(it => it.supplierName === first.supplierName)
    // Cost on a consolidated row must stay safe against the summed quantity:
    //  - only an identical per-unit ('each') cost is shown — it still holds
    //    for the combined quantity
    //  - 'total' / 'approx' / 'unknown' (or unqualified) costs are hidden,
    //    as they would misrepresent the total
    //  - a single total amount is never shown on a consolidated row
    // Full cost/total values remain visible on the underlying detail cards.
    const showUnitCost = allSameCost && first.costQualifier === 'each'
    rows.push({
      memoryType: first.memoryType,
      primaryText: null,
      materialName: first.materialName,
      quantity: String(Math.round(totalQty * 1000) / 1000),
      unit: first.unit,
      supplierName: allSameSupplier ? first.supplierName : null,
      deliveryTiming: null,
      locationOrUse: null,
      costLabel: showUnitCost ? formatCostLabel(first.costAmount, first.costCurrency, first.costQualifier) : null,
      totalCostLabel: null,
      uncertaintyFlags: [],
      consolidated: true,
      memoryItemIds: groupItems.map(it => it.id),
    })
  }

  return rows
}

/**
 * Build the "Memory at a glance" scan from trusted memory-view sections.
 * Pending (stillToCheck) items are never passed in here, so they can never
 * leak into a trusted summary or total.
 */
export function deriveScanGroups(sections: MemoryViewSection[]): ScanViewSection[] {
  const byKey = new Map(sections.map(s => [s.key, s]))
  const out: ScanViewSection[] = []

  for (const group of SCAN_GROUPS) {
    const section = byKey.get(group.key)
    if (!section || section.items.length === 0) continue
    const rows = group.kind === 'material'
      ? buildMaterialRows(section.items, group.consolidate)
      : section.items.map(it => singleRow(it, 'prose'))
    if (rows.length > 0) out.push({ key: group.key, label: group.label, items: rows })
  }

  // "Worth checking" — a cross-section roll-up of everything with an
  // uncertainty flag, so attention items are scannable in one place.
  const uncertain: ScanViewItem[] = []
  for (const group of SCAN_GROUPS) {
    const section = byKey.get(group.key)
    if (!section) continue
    for (const item of section.items) {
      if (isUncertain(item)) uncertain.push(singleRow(item, group.kind))
    }
  }
  if (uncertain.length > 0) out.push({ key: 'worth_checking', label: 'Worth checking', items: uncertain })

  return out
}
