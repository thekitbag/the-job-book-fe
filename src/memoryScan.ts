import type { BudgetCategory, BudgetCategorySuggestion, BudgetCategorySummary, BudgetSpendRow, BudgetSummaryResponse, ExcludedSpendRow, GrossKnownCost, JobPhoto, LabourCostSummary, LabourDayItem, LabourDaySummary, LabourExcludedRow, LabourExclusionReason, LabourHoursSummary, LabourSpendRow, LabourSpendSummary, LabourTodaySummary, LatestActivityItem, LatestActivityType, MemoryViewItem, MemoryViewSection, OrderedCostSummary, RefundsSummary, ReturnedRefundRow, ScanViewItem, ScanViewSection, SpendExclusionReason, TotalKnownCost } from './types'

// ── Shared display formatting ───────────────────────────────────────────────
// Centralised so the scan summary and the detail cards (and the review queue)
// format cost/total identically and cannot drift.

export function formatCostLabel(amount: string | null, currency: string | null, qualifier: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  const q: Record<string, string> = { each: ' each', total: ' total', approx: ' approx.', per_hour: '/hour' }
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
// For a clear `each` item with no explicit total, show the derived line total.
export function costDetailRows(item: {
  quantity?: string | null
  unit?: string | null
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
  } else if (amount && qualifier === 'per_hour') {
    rows.push(['Rate', `${sym}${amount}/hour`])
  } else if (amount && qualifier === 'total') {
    // amount is itself the line total; fold into the Total row below if no
    // explicit total is set
    if (!total) rows.push(['Total', `${sym}${amount}`])
  } else if (amount) {
    // approx / unknown / unqualified basis — show but flag, never as a total
    rows.push(['Cost', `${sym}${amount} — worth checking`])
  }

  if (total) {
    rows.push(['Total', `${sym}${total}`])
  } else {
    const derived = deriveEachTotal(item)
    if (derived) rows.push(['Total', `${sym}${derived}`])
  }
  return rows
}

// Map a backend exclusion reason to builder-facing copy. An unknown future
// reason is treated as the safe "Cost worth checking" — never as included — and
// surfaced in dev/tests so the unmapped value is observable.
export function spendExclusionCopy(reason: string): string {
  if (reason === 'no_cost_remembered') return 'No cost remembered'
  if (reason !== 'cost_worth_checking' && import.meta.env.DEV) {
    console.warn(`Unknown spend exclusion reason: ${reason}`)
  }
  return 'Cost worth checking'
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

const POS_DECIMAL = (s: string | null | undefined) => !!s && DECIMAL.test(s) && parseFloat(s) > 0

// Display-only safe line total for a clear `each` material — mirrors the backend
// derivation rule (quantity × unit cost). Returns a decimal string (no currency
// symbol), or null when it is not safe to derive: non-`each` basis, missing/
// approximate/non-numeric quantity, missing unit, or a bad unit cost. Currency
// is the caller's concern (the spend forms default to GBP).
export function deriveEachTotal(fields: {
  quantity?: string | null
  unit?: string | null
  costAmount: string | null
  costQualifier: string | null
}): string | null {
  if (fields.costQualifier !== 'each') return null
  if (!fields.unit || fields.unit.trim() === '') return null
  if (!POS_DECIMAL(fields.quantity) || !POS_DECIMAL(fields.costAmount)) return null
  const total = parseFloat(fields.quantity!) * parseFloat(fields.costAmount!)
  return String(Math.round(total * 100) / 100)
}

// Display-only safe line total for labour paid per hour — mirrors safeLabourCost's
// hours × rate derivation. Returns a decimal string (no currency symbol), or null
// when it is not safe to derive: non-`per_hour` basis, or missing/non-positive
// hours or rate.
export function deriveHourlyTotal(fields: {
  labourHours?: string | null
  costAmount: string | null
  costQualifier: string | null
}): string | null {
  if (fields.costQualifier !== 'per_hour') return null
  if (!POS_DECIMAL(fields.labourHours) || !POS_DECIMAL(fields.costAmount)) return null
  const total = parseFloat(fields.labourHours!) * parseFloat(fields.costAmount!)
  return String(Math.round(total * 100) / 100)
}

// Precisely what's missing for a safe `each` derivation, so the edit forms can
// prompt for exactly what's absent ("add a unit") instead of a generic message
// that lists fields the user already filled in.
export function eachTotalGaps(fields: { quantity?: string | null; unit?: string | null; costAmount: string | null }): string[] {
  const gaps: string[] = []
  if (!POS_DECIMAL(fields.quantity)) gaps.push('a quantity')
  if (!fields.unit || fields.unit.trim() === '') gaps.push('a unit')
  if (!POS_DECIMAL(fields.costAmount)) gaps.push('a unit cost')
  return gaps
}

// Precisely what's missing for a safe `per_hour` derivation.
export function hourlyTotalGaps(fields: { labourHours?: string | null; costAmount: string | null }): string[] {
  const gaps: string[] = []
  if (!POS_DECIMAL(fields.labourHours)) gaps.push('hours')
  if (!POS_DECIMAL(fields.costAmount)) gaps.push('a rate')
  return gaps
}

// "a quantity" / "a quantity and a unit" / "a quantity, a unit and a unit cost"
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// Cost-basis attention (Spend lens): an item carries a usable money amount when
// costAmount is a strict positive decimal — that's the amount Mike can classify
// as each vs total.
export function hasCostLikeAmount(item: { costAmount: string | null }): boolean {
  return POS_DECIMAL(item.costAmount)
}

// A safe unit-cost total (quantity × costAmount) can only be derived when the
// quantity is a strict positive decimal and a unit is present. Gates the
// "Set as unit cost" quick action.
export function canDeriveUnitCost(item: { quantity: string | null; unit: string | null }): boolean {
  return POS_DECIMAL(item.quantity) && !!item.unit && item.unit.trim() !== ''
}

// Labour exclusion reason → builder copy. Unknown future reason → safe fallback.
export function labourExclusionCopy(reason: string): string {
  if (reason === 'no_rate_or_cost') return 'Hours only — no cost'
  if (reason !== 'cost_worth_checking' && import.meta.env.DEV) {
    console.warn(`Unknown labour exclusion reason: ${reason}`)
  }
  return 'Cost worth checking'
}

/**
 * Safe monetary cost for a single labour memory item, mirroring the backend
 * rules. Returns null unless GBP, no unresolved flags, and either an explicit
 * trusted total or (hours × per_hour rate) can be safely derived.
 */
export function safeLabourCost(item: MemoryViewItem): { amount: number; currency: string } | null {
  if (item.memoryType !== 'labour') return null
  if ((item.uncertaintyFlags ?? []).length > 0) return null
  const currency = item.costCurrency
  if (currency !== 'GBP') return null
  // explicit, trusted total
  if (item.totalCostAmount && DECIMAL.test(item.totalCostAmount) && item.costQualifier !== 'approx' && item.costQualifier !== 'unknown') {
    return { amount: parseFloat(item.totalCostAmount), currency }
  }
  // hours × hourly rate
  if (item.costQualifier === 'per_hour' && POS_DECIMAL(item.labourHours) && POS_DECIMAL(item.costAmount)) {
    return { amount: parseFloat(item.labourHours!) * parseFloat(item.costAmount!), currency }
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
  const excludedRows: ExcludedSpendRow[] = []
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
      excludedRows.push(excludedRow(item, 'no_cost_remembered'))
    } else {
      // has a cost but it's not safe to total (uncertain / ambiguous basis)
      uncertainCostCount++
      excludedMemoryItemIds.push(item.id)
      excludedRows.push(excludedRow(item, 'cost_worth_checking'))
    }
  }

  // Consolidate included items into like-for-like rows — only when BOTH
  // material and unit are present (matches the backend rule). Items missing
  // either stay standalone so we never merge unlike explicit totals.
  const rowMap = new Map<string, { item: MemoryViewItem; amount: number; quantity: number; ids: string[] }>()
  for (const item of included) {
    const groupable = !!item.materialName && !!item.unit
    const key = groupable ? `${item.materialName}|${item.unit}` : `__standalone__${item.id}`
    const amount = safeLineTotal(item)!.amount
    const qty = DECIMAL.test(item.quantity ?? '') ? parseFloat(item.quantity!) : NaN
    const existing = rowMap.get(key)
    if (existing) {
      existing.amount += amount
      existing.quantity += qty
      existing.ids.push(item.id)
    } else {
      rowMap.set(key, { item, amount, quantity: qty, ids: [item.id] })
    }
  }
  const rows = [...rowMap.entries()].map(([key, { item, amount, quantity, ids }]) => ({
    key,
    materialName: item.materialName ?? '',
    // Consolidated rows show the summed quantity, not the first item's, so the
    // displayed total quantity matches the summed line total.
    quantity: Number.isFinite(quantity) ? String(Math.round(quantity * 1000) / 1000) : item.quantity,
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
    excludedRows,
  }
}

// One named exclusion row per excluded memory item (never consolidated — each
// item may have a distinct reason or correction path). itemLabel prefers a
// trimmed material name and falls back to the remembered summary; never blank.
function excludedRow(item: MemoryViewItem, reason: SpendExclusionReason): ExcludedSpendRow {
  const label = item.materialName?.trim() || item.summary?.trim() || 'Bought item'
  return {
    memoryItemId: item.id,
    itemLabel: label,
    materialName: item.materialName,
    quantity: item.quantity,
    unit: item.unit,
    reason,
  }
}

// ── Budget summary derivation ───────────────────────────────────────────────
// Emulates the backend budget-summary contract so the mock API behaves like the
// real one and so the rules are unit-testable. The live UI consumes the backend
// response — it never treats this local recompute as confirmed truth.

function budgetSpendRow(item: MemoryViewItem, amount: number, currency: string): BudgetSpendRow {
  const isLabour = item.memoryType === 'labour'
  const fallback = isLabour ? 'Labour' : 'Bought item'
  return {
    memoryItemId: item.id,
    memoryType: item.memoryType,
    itemLabel: (isLabour ? item.labourTask : item.materialName)?.trim() || item.summary?.trim() || fallback,
    materialName: item.materialName,
    quantity: item.quantity,
    unit: item.unit,
    labourHours: item.labourHours ?? null,
    labourPerson: item.labourPerson ?? null,
    labourTask: item.labourTask ?? null,
    lineTotalAmount: String(Math.round(amount * 100) / 100),
    lineTotalCurrency: currency,
    lineTotalLabel: `${formatMoney(amount, currency)} total`,
  }
}

function sumRows(rows: BudgetSpendRow[]): number {
  return rows.reduce((n, r) => n + parseFloat(r.lineTotalAmount), 0)
}

/**
 * Build a budget summary from trusted memory sections and active categories,
 * mirroring backend rules:
 *  - only trusted bought/ordered items with a safe GBP line total contribute
 *  - one row per contributing item (no consolidation)
 *  - items with no/archived/unknown category fall into uncategorised
 *  - remaining/over-budget only when a category (or the total) has a budget
 */
export function deriveBudgetSummary(
  jobId: string,
  sections: MemoryViewSection[],
  categories: BudgetCategory[],
): BudgetSummaryResponse {
  const currency = 'GBP'
  const active = categories.filter(c => !c.isArchived)
  const activeIds = new Set(active.map(c => c.id))
  const ordered = sections.find(s => s.key === 'ordered_materials')?.items ?? []
  const labour = sections.find(s => s.key === 'labour')?.items ?? []

  const rowsByCategory = new Map<string, BudgetSpendRow[]>()
  const uncategorizedRows: BudgetSpendRow[] = []

  // Both bought/ordered and labour with a safe GBP monetary cost contribute.
  const contributions: Array<{ item: MemoryViewItem; amount: number }> = []
  for (const item of ordered) {
    const line = safeLineTotal(item)
    if (line && line.currency === currency) contributions.push({ item, amount: line.amount })
  }
  for (const item of labour) {
    const line = safeLabourCost(item)
    if (line && line.currency === currency) contributions.push({ item, amount: line.amount })
  }
  for (const { item, amount } of contributions) {
    const row = budgetSpendRow(item, amount, currency)
    const catId = item.budgetCategoryId
    if (catId && activeIds.has(catId)) {
      const list = rowsByCategory.get(catId) ?? []
      list.push(row)
      rowsByCategory.set(catId, list)
    } else {
      uncategorizedRows.push(row)
    }
  }

  const categorySummaries: BudgetCategorySummary[] = [...active]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(category => {
      const rows = rowsByCategory.get(category.id) ?? []
      const spend = sumRows(rows)
      const hasSpend = rows.length > 0
      const budget = category.budgetAmount && DECIMAL.test(category.budgetAmount)
        ? parseFloat(category.budgetAmount) : null
      const hasBudget = budget !== null
      const remaining = hasBudget ? budget - spend : null
      return {
        category,
        knownSpendAmount: hasSpend ? String(Math.round(spend * 100) / 100) : null,
        knownSpendCurrency: hasSpend ? currency : null,
        knownSpendLabel: hasSpend ? `${formatMoney(spend, currency)} known spend` : null,
        budgetAmount: category.budgetAmount,
        budgetCurrency: hasBudget ? (category.budgetCurrency ?? currency) : category.budgetCurrency,
        budgetLabel: hasBudget ? `${formatMoney(budget, currency)} budget` : null,
        remainingAmount: remaining !== null ? String(Math.round(remaining * 100) / 100) : null,
        remainingLabel: remaining !== null ? `${formatMoney(Math.abs(remaining), currency)} ${remaining < 0 ? 'over budget' : 'remaining'}` : null,
        overBudget: hasBudget && spend > budget,
        rows,
      }
    })

  const uncatSpend = sumRows(uncategorizedRows)
  const hasUncat = uncategorizedRows.length > 0

  // Totals: budget = sum of active category budgets; known spend = all safe rows,
  // net of trusted refunds. Refunds are deliberately NOT subtracted from any
  // category: a returned material's refund can't be safely attributed back to
  // the category its purchase was filed under, and guessing would corrupt a
  // category figure Mike relies on. Job-level net is safe; category-level is not.
  const totalBudget = active.reduce((n, c) =>
    n + (c.budgetAmount && DECIMAL.test(c.budgetAmount) ? parseFloat(c.budgetAmount) : 0), 0)
  const anyBudget = active.some(c => c.budgetAmount && DECIMAL.test(c.budgetAmount))
  const refunds = deriveRefundsSummary(sections)
  const refundTotal = refunds.knownRefundAmount ? parseFloat(refunds.knownRefundAmount) : 0
  const totalSpend = categorySummaries.reduce((n, c) => n + sumRows(c.rows), 0) + uncatSpend - refundTotal
  const totalRemaining = anyBudget ? totalBudget - totalSpend : null

  const response: BudgetSummaryResponse = {
    jobId,
    generatedAt: new Date().toISOString(),
    categories: categorySummaries,
    uncategorized: {
      knownSpendAmount: hasUncat ? String(Math.round(uncatSpend * 100) / 100) : null,
      knownSpendCurrency: hasUncat ? currency : null,
      knownSpendLabel: hasUncat ? `${formatMoney(uncatSpend, currency)} known spend` : null,
      rows: uncategorizedRows,
    },
    totals: {
      budgetAmount: anyBudget ? String(Math.round(totalBudget * 100) / 100) : null,
      budgetCurrency: anyBudget ? currency : null,
      knownSpendAmount: String(Math.round(totalSpend * 100) / 100),
      knownSpendCurrency: currency,
      remainingAmount: totalRemaining !== null ? String(Math.round(totalRemaining * 100) / 100) : null,
      remainingLabel: totalRemaining !== null ? `${formatMoney(Math.abs(totalRemaining), currency)} ${totalRemaining < 0 ? 'over budget' : 'remaining'}` : null,
      overBudget: anyBudget && totalSpend > totalBudget,
    },
  }
  // System labour group (additive, like the backend): every safe labour money
  // row once, aligned to an active "labour" category when one exists. Labour
  // rows stay in categories/uncategorized for older clients; the new frontend
  // de-duplicates on display.
  response.labour = deriveLabourSpendGroupFromBudget(response)
  return response
}

// Labour money summary, mirroring the backend additive costSummary.labour shape.
// Trusted labour money → rows; hours-only / ambiguous → excludedRows with reason.
export function deriveLabourSummary(sections: MemoryViewSection[]): LabourCostSummary {
  const currency = 'GBP'
  const labour = sections.find(s => s.key === 'labour')?.items ?? []
  const rows: LabourSpendRow[] = []
  const excludedRows: LabourExcludedRow[] = []
  let total = 0

  for (const item of labour) {
    const label = item.labourTask?.trim() || item.labourPerson?.trim() || item.summary?.trim() || 'Labour'
    const line = safeLabourCost(item)
    if (line) {
      total += line.amount
      rows.push({
        memoryItemId: item.id, itemLabel: label,
        labourHours: item.labourHours ?? null, labourPerson: item.labourPerson ?? null, labourTask: item.labourTask ?? null,
        lineTotalAmount: String(Math.round(line.amount * 100) / 100), lineTotalCurrency: currency,
        lineTotalLabel: `${formatMoney(line.amount, currency)} total`,
      })
    } else {
      const hasMoney = !!(item.costAmount || item.totalCostAmount)
      const reason: LabourExclusionReason = hasMoney ? 'cost_worth_checking' : 'no_rate_or_cost'
      excludedRows.push({
        memoryItemId: item.id, itemLabel: label,
        labourHours: item.labourHours ?? null, labourPerson: item.labourPerson ?? null, labourTask: item.labourTask ?? null,
        reason,
      })
    }
  }

  const has = rows.length > 0
  return {
    knownSpendAmount: has ? String(Math.round(total * 100) / 100) : null,
    knownSpendCurrency: has ? currency : null,
    knownSpendLabel: has ? `${formatMoney(total, currency)} known spend` : null,
    includedMemoryItemIds: rows.map(r => r.memoryItemId),
    rows,
    excludedRows,
  }
}

// ── Returned materials & refunds ────────────────────────────────────────────

/**
 * Trusted refund on a single returned-material item, mirroring the backend
 * rule. Returns null unless the item is a returned material in GBP with a
 * strict positive refund amount and no unresolved flags — a return Mike hasn't
 * confirmed a refund for is real, but it is not money back, so it must never
 * move his spend.
 */
export function safeRefund(item: MemoryViewItem): { amount: number; currency: string } | null {
  if (item.memoryType !== 'returned_material') return null
  if ((item.uncertaintyFlags ?? []).length > 0) return null
  if (item.refundCurrency !== 'GBP') return null
  if (!POS_DECIMAL(item.refundAmount)) return null
  return { amount: parseFloat(item.refundAmount!), currency: 'GBP' }
}

// Builder-facing identity for a returned row: "4 fence posts".
function returnedItemLabel(item: MemoryViewItem): string {
  const qtyUnit = [item.quantity, item.unit].filter(Boolean).join(' ')
  return [qtyUnit, item.materialName].filter(Boolean).join(' ').trim() ||
    item.materialName?.trim() || item.summary?.trim() || 'Returned item'
}

/**
 * Frontend fallback mirroring the backend costSummary.refunds contract.
 * Returned items without a trusted refund appear in Materials/Returned but
 * contribute nothing here, so they cannot quietly reduce spend.
 */
export function deriveRefundsSummary(sections: MemoryViewSection[]): RefundsSummary {
  const returned = sections.find(s => s.key === 'returned_materials')?.items ?? []
  const rows: ReturnedRefundRow[] = []
  let total = 0

  for (const item of returned) {
    const refund = safeRefund(item)
    if (!refund) continue
    total += refund.amount
    rows.push({
      memoryItemId: item.id,
      itemLabel: returnedItemLabel(item),
      materialName: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
      supplierName: item.supplierName,
      refundAmount: String(Math.round(refund.amount * 100) / 100),
      refundCurrency: 'GBP',
      refundLabel: `${formatMoney(refund.amount, 'GBP')} refund`,
      happenedAt: item.happenedAt ?? null,
    })
  }

  const has = rows.length > 0
  return {
    knownRefundAmount: has ? String(Math.round(total * 100) / 100) : null,
    knownRefundCurrency: has ? 'GBP' : null,
    knownRefundLabel: has ? `${formatMoney(total, 'GBP')} refunded` : null,
    rows,
  }
}

// Gross trusted money out = bought/ordered safe spend + labour safe spend,
// before any refund. Rated labour is included; hours-only labour is not.
export function deriveGrossKnownCost(sections: MemoryViewSection[]): GrossKnownCost {
  const currency = 'GBP'
  const ordered = deriveCostSummary(sections)
  const labour = deriveLabourSummary(sections)
  const orderedAmt = ordered.knownSpendAmount ? parseFloat(ordered.knownSpendAmount) : 0
  const labourAmt = labour.knownSpendAmount ? parseFloat(labour.knownSpendAmount) : 0
  const total = orderedAmt + labourAmt
  const has = ordered.includedMemoryItemIds.length + labour.includedMemoryItemIds.length > 0
  return {
    amount: has ? String(Math.round(total * 100) / 100) : null,
    currency: has ? currency : null,
    label: has ? formatMoney(total, currency) : null,
  }
}

// Net trusted monetary cost: gross bought + labour spend, less trusted refunds
// from returned materials. Drives the spend hero. includedMemoryItemIds stays
// the money-OUT contributors — a refund reduces the figure but is not spend, so
// it is never folded into the included set.
export function deriveTotalKnownCost(sections: MemoryViewSection[]): TotalKnownCost {
  const currency = 'GBP'
  const ordered = deriveCostSummary(sections)
  const labour = deriveLabourSummary(sections)
  const refunds = deriveRefundsSummary(sections)
  const orderedAmt = ordered.knownSpendAmount ? parseFloat(ordered.knownSpendAmount) : 0
  const labourAmt = labour.knownSpendAmount ? parseFloat(labour.knownSpendAmount) : 0
  const refundAmt = refunds.knownRefundAmount ? parseFloat(refunds.knownRefundAmount) : 0
  const total = orderedAmt + labourAmt - refundAmt
  const ids = [...ordered.includedMemoryItemIds, ...labour.includedMemoryItemIds]
  const has = ids.length > 0 || refunds.rows.length > 0
  return {
    knownSpendAmount: has ? String(Math.round(total * 100) / 100) : null,
    knownSpendCurrency: has ? currency : null,
    knownSpendLabel: has ? `${formatMoney(total, currency)} known spend` : null,
    includedMemoryItemIds: ids,
  }
}

// ── Labour daily summary (Labour Tracking V2) ───────────────────────────────
// Frontend fallback mirroring the backend memory-view.labourHoursSummary rules,
// used by the mock API and for older backends without the summary. The live UI
// prefers the backend response.

// Local-noon ISO for a date-only value — avoids timezone day drift when the
// backend stores/echoes the timestamp.
export function localNoonISO(dateOnly: string): string {
  return `${dateOnly}T12:00:00`
}

// YYYY-MM-DD local calendar day for an ISO timestamp ('' when unparseable).
export function localDateKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
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
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
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
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// "4" → "4h", "3.5" → "3.5h"; non-numeric hours shown as said (never totalled).
function hoursShort(hours: string): string {
  return DECIMAL.test(hours) ? `${Math.round(parseFloat(hours) * 100) / 100}h` : hours
}

/**
 * Group labour memory items into UK-local calendar days with safe hour totals.
 * Included in totals only when hours are a strict positive decimal and the item
 * has no unresolved flags; excluded items stay visible as worth checking.
 */
export function deriveLabourHoursSummary(sections: MemoryViewSection[]): LabourHoursSummary {
  const labour = sections.find(s => s.key === 'labour')?.items ?? []
  const byDay = new Map<string, LabourDayItem[]>()

  for (const item of labour) {
    const effective = item.happenedAt ?? item.source?.capturedAt ?? item.createdAt
    const worthChecking = (item.uncertaintyFlags ?? []).length > 0
    const included = !worthChecking && POS_DECIMAL(item.labourHours)
    const line = safeLabourCost(item)
    const dayItem: LabourDayItem = {
      memoryItemId: item.id,
      labourPerson: item.labourPerson ?? null,
      labourTask: item.labourTask ?? null,
      labourHours: item.labourHours ?? null,
      hoursLabel: item.labourHours ? hoursShort(item.labourHours) : null,
      happenedAt: item.happenedAt ?? null,
      includedInHourTotal: included,
      worthChecking,
      lineTotalAmount: line ? String(Math.round(line.amount * 100) / 100) : null,
      lineTotalCurrency: line ? line.currency : null,
      lineTotalLabel: line ? formatMoney(line.amount, line.currency) : null,
    }
    const key = localDateKey(effective)
    const list = byDay.get(key) ?? []
    list.push(dayItem)
    byDay.set(key, list)
  }

  // Days newest first ('' — unparseable date — sorts last); items keep the
  // section's existing newest-first order.
  const days: LabourDaySummary[] = [...byDay.entries()]
    .sort(([a], [b]) => (b || '\0').localeCompare(a || '\0'))
    .map(([date, items]) => {
      const total = items.reduce((n, it) => n + (it.includedInHourTotal ? parseFloat(it.labourHours!) : 0), 0)
      const has = items.some(it => it.includedInHourTotal)
      const rounded = Math.round(total * 100) / 100
      return {
        date,
        totalHours: has ? String(rounded) : null,
        totalLabel: has ? `${rounded}h day total` : null,
        items,
      }
    })

  const jobTotal = days.reduce((n, d) => n + (d.totalHours ? parseFloat(d.totalHours) : 0), 0)
  const hasJobTotal = days.some(d => d.totalHours !== null)
  const jobRounded = Math.round(jobTotal * 100) / 100
  return {
    totalHours: hasJobTotal ? String(jobRounded) : null,
    totalLabel: hasJobTotal ? `${jobRounded}h job total` : null,
    days,
  }
}

// ── Labour spend group fallback (Spend tab) ─────────────────────────────────
// The one active category named "labour" (case-insensitive, trimmed), if any.
// Shared by the local derivation below and by useJobMemory's reconciliation
// of a backend labour summary whose budgetCategory came back null.
export function findLabourBudgetCategory(bs: BudgetSummaryResponse): BudgetCategorySummary | null {
  return bs.categories.find(c => c.category.name.trim().toLowerCase() === 'labour') ?? null
}

// Prefer budgetSummary.labour from the backend. For older responses, derive the
// group from existing category/uncategorised rows: every labour monetary row,
// de-duplicated by memoryItemId, with budget/remaining from an active category
// named "labour" when one exists.
export function deriveLabourSpendGroupFromBudget(bs: BudgetSummaryResponse): LabourSpendSummary {
  const currency = 'GBP'
  const seen = new Set<string>()
  const rows: BudgetSpendRow[] = []
  const allRows = [...bs.categories.flatMap(c => c.rows), ...bs.uncategorized.rows]
  for (const row of allRows) {
    if (row.memoryType !== 'labour' || seen.has(row.memoryItemId)) continue
    seen.add(row.memoryItemId)
    rows.push(row)
  }
  const spend = rows.reduce((n, r) => n + parseFloat(r.lineTotalAmount), 0)
  const has = rows.length > 0

  const labourCat = findLabourBudgetCategory(bs)
  const budget = labourCat?.category.budgetAmount && DECIMAL.test(labourCat.category.budgetAmount)
    ? parseFloat(labourCat.category.budgetAmount) : null
  const remaining = budget !== null ? budget - spend : null
  return {
    knownSpendAmount: has ? String(Math.round(spend * 100) / 100) : null,
    knownSpendCurrency: has ? currency : null,
    knownSpendLabel: has ? `${formatMoney(spend, currency)} known spend` : null,
    budgetCategory: labourCat?.category ?? null,
    budgetAmount: budget !== null ? String(budget) : null,
    budgetCurrency: budget !== null ? currency : null,
    budgetLabel: budget !== null ? `${formatMoney(budget, currency)} budget` : null,
    remainingAmount: remaining !== null ? String(Math.round(remaining * 100) / 100) : null,
    remainingLabel: remaining !== null ? `${formatMoney(Math.abs(remaining), currency)} ${remaining < 0 ? 'over budget' : 'remaining'}` : null,
    overBudget: budget !== null && spend > budget,
    rows,
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Deterministic budget-category suggestion for a proposed bought/ordered review
 * item (mirrors the backend rule; used by the mock and unit-testable). Only
 * suggests on a strong, unambiguous match:
 *  - exact case-insensitive trimmed materialName == category name, or
 *  - exact case-insensitive token/phrase match of the category name in summary.
 * A single material-name match wins over summary matches; otherwise multiple
 * matches yield no suggestion. No fuzzy/substring/supplier/AI matching.
 */
function matchActiveCategory(primary: string | null, summary: string, active: BudgetCategory[]): BudgetCategorySuggestion | null {
  const key = primary?.trim().toLowerCase() ?? ''
  const exact = key ? active.filter(c => c.name.trim().toLowerCase() === key) : []
  if (exact.length === 1) return { budgetCategoryId: exact[0].id, categoryName: exact[0].name, reason: 'material_name_match' }
  if (exact.length > 1) return null
  const summaryMatches = active.filter(c => {
    const name = c.name.trim()
    return name && new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(summary ?? '')
  })
  if (summaryMatches.length === 1) return { budgetCategoryId: summaryMatches[0].id, categoryName: summaryMatches[0].name, reason: 'summary_match' }
  return null
}

export function suggestBudgetCategory(
  proposed: { memoryType: string; materialName: string | null; summary: string; labourTask?: string | null },
  categories: BudgetCategory[],
): BudgetCategorySuggestion | null {
  const active = categories.filter(c => !c.isArchived)
  if (active.length === 0) return null

  if (proposed.memoryType === 'ordered_material') {
    return matchActiveCategory(proposed.materialName, proposed.summary, active)
  }
  if (proposed.memoryType === 'labour') {
    // Prefer an active category literally named "labour"; else match the task.
    const named = active.filter(c => c.name.trim().toLowerCase() === 'labour')
    if (named.length === 1) return { budgetCategoryId: named[0].id, categoryName: named[0].name, reason: 'material_name_match' }
    if (named.length > 1) return null
    return matchActiveCategory(proposed.labourTask ?? null, proposed.summary, active)
  }
  return null
}

// memoryType → memory-view section key (used to re-home an item after a type edit)
export const MEMORY_TYPE_TO_SECTION_KEY: Record<string, string> = {
  ordered_material: 'ordered_materials',
  used_material: 'used_materials',
  leftover_material: 'leftovers',
  returned_material: 'returned_materials',
  supplier_delivery_note: 'supplier_delivery_notes',
  customer_change: 'customer_changes',
  watch_out: 'watch_outs',
  labour: 'labour',
  general_note: 'general_notes',
}

export const SECTION_ORDER = [
  'ordered_materials', 'labour', 'used_materials', 'leftovers', 'returned_materials',
  'general_notes', 'supplier_delivery_notes', 'customer_changes', 'watch_outs',
]

export const SECTION_FULL_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered materials',
  labour: 'Labour',
  used_materials: 'Used materials',
  leftovers: 'Leftovers',
  returned_materials: 'Returned materials',
  general_notes: 'Notes',
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
  { key: 'returned_materials', label: 'Returned', kind: 'material', consolidate: false },
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

// ── Workspace Overview derivations ──────────────────────────────────────────
// Pure, unit-testable summaries for the current-job Overview. Both take trusted
// memory-view sections only — pending drafts are never passed in.

// Effective timestamp for ordering / "today" checks. Direct-add items carry an
// explicit event date (happenedAt); voice items fall back to source capture
// time, then creation time.
function effectiveAt(item: MemoryViewItem): string {
  return item.happenedAt ?? item.source?.capturedAt ?? item.createdAt
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

/**
 * Labour done today: sum of strict-numeric labourHours on labour memory items
 * whose effective day is the local device day, split per person. `now` is
 * injectable so the rule is deterministically testable. Non-numeric / unknown
 * hours are ignored (never guessed).
 */
export function deriveLabourToday(sections: MemoryViewSection[], now: Date = new Date()): LabourTodaySummary {
  const labour = sections.find(s => s.key === 'labour')?.items ?? []
  const perPersonMap = new Map<string, number>()
  let totalHours = 0
  for (const item of labour) {
    if (!isSameLocalDay(effectiveAt(item), now)) continue
    const h = item.labourHours
    if (!h || !DECIMAL.test(h)) continue
    const hours = parseFloat(h)
    totalHours += hours
    const person = item.labourPerson?.trim() || 'Labour'
    perPersonMap.set(person, (perPersonMap.get(person) ?? 0) + hours)
  }
  return {
    totalHours: Math.round(totalHours * 100) / 100,
    hasHours: totalHours > 0,
    perPerson: [...perPersonMap.entries()].map(([person, hours]) => ({ person, hours })),
  }
}

const LATEST_ACTIVITY_TYPE: Record<string, { type: LatestActivityType; label: string }> = {
  ordered_material: { type: 'bought', label: 'Bought' },
  used_material: { type: 'used', label: 'Used' },
  leftover_material: { type: 'used', label: 'Used' },
  returned_material: { type: 'returned', label: 'Returned' },
  labour: { type: 'labour', label: 'Labour' },
  general_note: { type: 'note', label: 'Note' },
  supplier_delivery_note: { type: 'note', label: 'Note' },
  customer_change: { type: 'note', label: 'Note' },
  watch_out: { type: 'note', label: 'Note' },
}

function latestHeadline(item: MemoryViewItem): string {
  if (item.memoryType === 'labour') {
    return [item.labourHours ? `${item.labourHours}h` : null, item.labourTask].filter(Boolean).join(' · ') || item.summary
  }
  if (item.memoryType === 'returned_material') {
    const base = returnedItemLabel(item)
    return item.supplierName ? `${base} — back to ${item.supplierName}` : base
  }
  if (item.memoryType === 'ordered_material' || item.memoryType === 'used_material' || item.memoryType === 'leftover_material') {
    const qtyName = [item.quantity ? `${item.quantity}×` : null, item.materialName].filter(Boolean).join(' ')
    const base = qtyName || item.summary
    const tail = item.supplierName ?? item.locationOrUse
    return tail ? `${base} — ${tail}` : base
  }
  return item.summary
}

// Money label shown on the right of a Latest row — prefer an explicit total,
// else the unit/basis cost. Uncertain-basis costs still show (they are evidence
// on a card, not a trusted spend total here).
function latestCost(item: MemoryViewItem): string | null {
  // A refund is money back, so it is labelled as one rather than sitting in the
  // same column as spend with no sign of which way it went.
  if (item.memoryType === 'returned_material') {
    const refund = formatTotalLabel(item.refundAmount ?? null, item.refundCurrency ?? null)
    return refund ? `${refund} refund` : null
  }
  return formatTotalLabel(item.totalCostAmount, item.costCurrency) ??
    formatCostLabel(item.costAmount, item.costCurrency, item.costQualifier)
}

/**
 * Latest trusted job activity across spend/labour/used/leftover/notes sections,
 * newest first. Only maps known memory types, so an unknown future type can
 * never appear as fake activity.
 */
export function deriveLatestActivity(sections: MemoryViewSection[], limit = 5): LatestActivityItem[] {
  const all: LatestActivityItem[] = []
  for (const section of sections) {
    for (const item of section.items) {
      const map = LATEST_ACTIVITY_TYPE[item.memoryType]
      if (!map) continue
      all.push({
        memoryItemId: item.id,
        type: map.type,
        typeLabel: map.label,
        headline: latestHeadline(item),
        costLabel: latestCost(item),
        effectiveAt: effectiveAt(item),
      })
    }
  }
  all.sort((a, b) => (b.effectiveAt ?? '').localeCompare(a.effectiveAt ?? ''))
  return all.slice(0, limit)
}

/**
 * Folds trusted photos into a latest-activity list as 'photo' rows, re-sorted
 * newest-first and re-limited. Photos carry no trusted cost (evidence, not
 * spend), so costLabel is always null.
 */
export function mergeLatestActivityWithPhotos(
  items: LatestActivityItem[],
  photos: JobPhoto[],
  limit = 5,
): LatestActivityItem[] {
  const photoItems: LatestActivityItem[] = photos.map(photo => ({
    memoryItemId: photo.id,
    type: 'photo',
    typeLabel: 'Photo',
    headline: photo.descriptor ?? 'Photo uploaded',
    costLabel: null,
    effectiveAt: photo.uploadedAt,
  }))
  return [...items, ...photoItems]
    .sort((a, b) => (b.effectiveAt ?? '').localeCompare(a.effectiveAt ?? ''))
    .slice(0, limit)
}
