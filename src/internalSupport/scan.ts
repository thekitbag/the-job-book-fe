import type { BudgetCategory, BudgetCategorySummary, BudgetSpendRow, BudgetSummaryResponse, ExcludedSpendRow, GrossKnownCost, LabourCostSummary, LabourDayItem, LabourDaySummary, LabourExcludedRow, LabourExclusionReason, LabourHoursSummary, LabourSpendRow, LabourSpendSummary, MemoryViewItem, MemoryViewSection, OrderedCostSummary, RefundsSummary, ReturnedRefundRow, SpendExclusionReason, TotalKnownCost } from './types'
function withThousands(amount: string): string {
  const [int, frac] = amount.split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac !== undefined ? `${withSep}.${frac}` : withSep
}

export function formatCostLabel(amount: string | null, currency: string | null, qualifier: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  const q: Record<string, string> = { each: ' each', total: ' total', approx: ' approx.', per_hour: '/hour' }
  return `${sym}${withThousands(amount)}${qualifier ? (q[qualifier] ?? '') : ''}`
}

export function formatTotalLabel(amount: string | null, currency: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  return `${sym}${withThousands(amount)}`
}

function currencySymbol(currency: string | null): string {
  return currency === 'GBP' ? '£' : (currency ? `${currency} ` : '£')
}

export function formatMoney(amount: number, currency: string | null): string {
  const rounded = Math.round(amount * 100) / 100
  const text = rounded.toLocaleString('en-GB', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `${currencySymbol(currency)}${text}`
}

export function moneyFigure(amount: string | null | undefined, currency: string | null = 'GBP'): string | null {
  if (!amount || !DECIMAL.test(amount)) return null
  return formatMoney(parseFloat(amount), currency)
}

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
    rows.push(['Unit cost', `${sym}${withThousands(amount)} each`])
  } else if (amount && qualifier === 'per_hour') {
    rows.push(['Rate', `${sym}${withThousands(amount)}/hour`])
  } else if (amount && qualifier === 'total') {
    // amount is itself the line total; fold into the Total row below if no
    // explicit total is set
    if (!total) rows.push(['Total', `${sym}${withThousands(amount)}`])
  } else if (amount) {
    // approx / unknown / unqualified basis — show but flag, never as a total
    rows.push(['Cost', `${sym}${withThousands(amount)} — worth checking`])
  }

  if (total) {
    rows.push(['Total', `${sym}${withThousands(total)}`])
  } else {
    const derived = deriveEachTotal(item)
    if (derived) rows.push(['Total', `${sym}${withThousands(derived)}`])
  }
  return rows
}

const DECIMAL = /^\d+(\.\d+)?$/

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

export function safeLabourCost(item: MemoryViewItem): { amount: number; currency: string } | null {
  if (item.memoryType !== 'labour') return null
  if ((item.uncertaintyFlags ?? []).length > 0) return null
  const currency = item.costCurrency
  if (currency !== 'GBP') return null
  // explicit, trusted total
  if (item.totalCostAmount && POS_DECIMAL(item.totalCostAmount) && item.costQualifier !== 'approx' && item.costQualifier !== 'unknown') {
    return { amount: parseFloat(item.totalCostAmount), currency }
  }
  // hours × hourly rate
  if (item.costQualifier === 'per_hour' && POS_DECIMAL(item.labourHours) && POS_DECIMAL(item.costAmount)) {
    return { amount: parseFloat(item.labourHours!) * parseFloat(item.costAmount!), currency }
  }
  return null
}

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
    if (line && line.currency === currency && line.amount > 0) {
      included.push(item)
      total += line.amount
    } else if (trustedExplicitZero(item)) {
      // A trusted £0 is an honest no-cost fact, not Budget spend and not a
      // missing-price correction.
      continue
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

export type BudgetPaidMarker = { moneyEventId: string; paidAt: string | null }

function budgetSpendRow(
  item: MemoryViewItem,
  amount: number,
  currency: string,
  paidMarker?: BudgetPaidMarker,
): BudgetSpendRow {
  const isLabour = item.memoryType === 'labour'
  const isBudgetCost = item.memoryType === 'budget_cost'
  const fallback = isLabour ? 'Labour' : 'Cost'
  // A budget_cost may describe a labour cost (person/task) or a plain cost;
  // prefer its most specific identity, then the remembered summary.
  const primaryLabel = isLabour ? item.labourTask
    : isBudgetCost ? (item.labourTask || item.labourPerson || item.materialName)
    : item.materialName
  return {
    memoryItemId: item.id,
    memoryType: item.memoryType,
    itemLabel: primaryLabel?.trim() || item.summary?.trim() || fallback,
    materialName: item.materialName,
    quantity: item.quantity,
    unit: item.unit,
    labourHours: item.labourHours ?? null,
    labourPerson: item.labourPerson ?? null,
    labourTask: item.labourTask ?? null,
    lineTotalAmount: String(Math.round(amount * 100) / 100),
    lineTotalCurrency: currency,
    lineTotalLabel: `${formatMoney(amount, currency)} total`,
    paymentState: paidMarker ? 'paid' : 'not_paid',
    paidMoneyEventId: paidMarker?.moneyEventId ?? null,
    paidAt: paidMarker?.paidAt ?? null,
    eligibleForPaymentState: amount > 0,
  }
}

function sumRows(rows: BudgetSpendRow[]): number {
  return rows.reduce((n, r) => n + parseFloat(r.lineTotalAmount), 0)
}

function roundedAmount(n: number): string {
  return String(Math.round(n * 100) / 100)
}

function paymentFields(rows: BudgetSpendRow[], missingPricePresent: boolean) {
  const eligible = rows.filter(r => r.eligibleForPaymentState === true && parseFloat(r.lineTotalAmount) > 0)
  const paid = eligible.filter(r => r.paymentState === 'paid')
  const notPaid = eligible.filter(r => r.paymentState === 'not_paid')
  const paidTotal = sumRows(paid)
  const notPaidTotal = sumRows(notPaid)
  const state = eligible.length === 0 ? null
    : paid.length === eligible.length ? 'paid' as const
    : notPaid.length === eligible.length ? 'not_paid' as const
    : 'some_paid' as const

  return {
    paymentState: state,
    paidAmount: paid.length > 0 ? roundedAmount(paidTotal) : null,
    paidCurrency: paid.length > 0 ? 'GBP' as const : null,
    paidLabel: paid.length > 0 ? `${formatMoney(paidTotal, 'GBP')} paid` : null,
    notPaidAmount: notPaid.length > 0 ? roundedAmount(notPaidTotal) : null,
    notPaidCurrency: notPaid.length > 0 ? 'GBP' as const : null,
    notPaidLabel: notPaid.length > 0 ? `${formatMoney(notPaidTotal, 'GBP')} not paid` : null,
    paymentStateReason: missingPricePresent
      ? 'missing_price_present' as const
      : eligible.length > 0 ? 'eligible_items' as const : 'no_eligible_items' as const,
  }
}

function trustedExplicitZero(item: MemoryViewItem): boolean {
  if ((item.uncertaintyFlags ?? []).length > 0 || (item.costCurrency && item.costCurrency !== 'GBP')) return false
  const explicit = item.totalCostAmount ?? (
    (item.costQualifier === 'total' || item.costQualifier === 'per_hour') ? item.costAmount : null
  )
  return explicit !== null && DECIMAL.test(explicit) && parseFloat(explicit) === 0
}

function unresolvedPrice(item: MemoryViewItem): boolean {
  if (trustedExplicitZero(item)) return false
  if (item.memoryType === 'ordered_material') return safeLineTotal(item) === null
  if (item.memoryType === 'budget_cost') return safeBudgetCost(item) === null
  if (item.memoryType === 'labour') {
    const hasCostClaim = item.costAmount !== null || item.totalCostAmount !== null
    return hasCostClaim && safeLabourCost(item) === null
  }
  return false
}

export function deriveBudgetSummary(
  jobId: string,
  sections: MemoryViewSection[],
  categories: BudgetCategory[],
  paidBySource: ReadonlyMap<string, BudgetPaidMarker> = new Map(),
): BudgetSummaryResponse {
  const currency = 'GBP'
  const active = categories.filter(c => !c.isArchived)
  const activeIds = new Set(active.map(c => c.id))
  const ordered = sections.find(s => s.key === 'ordered_materials')?.items ?? []
  const labour = sections.find(s => s.key === 'labour')?.items ?? []
  const budgetCosts = sections.find(s => s.key === 'budget_costs')?.items ?? []

  const rowsByCategory = new Map<string, BudgetSpendRow[]>()
  const uncategorizedRows: BudgetSpendRow[] = []

  // Bought/ordered, legacy labour cost, and general budget_cost items with a
  // safe GBP monetary cost all contribute to Budget.
  const contributions: Array<{ item: MemoryViewItem; amount: number }> = []
  for (const item of ordered) {
    const line = safeLineTotal(item)
    if (line && line.currency === currency && line.amount > 0) contributions.push({ item, amount: line.amount })
  }
  for (const item of labour) {
    const line = safeLabourCost(item)
    if (line && line.currency === currency && line.amount > 0) contributions.push({ item, amount: line.amount })
  }
  for (const item of budgetCosts) {
    const line = safeBudgetCost(item)
    if (line && line.amount > 0) contributions.push({ item, amount: line.amount })
  }
  for (const { item, amount } of contributions) {
    const row = budgetSpendRow(item, amount, currency, paidBySource.get(item.id))
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
      const missingPricePresent = [...ordered, ...labour, ...budgetCosts]
        .some(item => item.budgetCategoryId === category.id && unresolvedPrice(item))
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
        ...paymentFields(rows, missingPricePresent),
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
  const overallRows = [...categorySummaries.flatMap(category => category.rows), ...uncategorizedRows]
  const overallPayableRows = overallRows.filter(
    row => row.eligibleForPaymentState === true && parseFloat(row.lineTotalAmount) > 0,
  )
  const overallNotPaidRows = overallPayableRows.filter(row => row.paymentState === 'not_paid')
  const hasKnownPayableCosts = overallPayableRows.length > 0
  const allKnownCostsPaid = hasKnownPayableCosts && overallNotPaidRows.length === 0
  const overallNotPaidTotal = sumRows(overallNotPaidRows)
  const hasMissingPriceAttention = [...ordered, ...labour, ...budgetCosts].some(unresolvedPrice)

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
      notPaidAmount: hasKnownPayableCosts ? roundedAmount(overallNotPaidTotal) : null,
      notPaidCurrency: hasKnownPayableCosts ? 'GBP' : null,
      notPaidLabel: hasKnownPayableCosts
        ? (allKnownCostsPaid ? 'All known costs paid' : `${formatMoney(overallNotPaidTotal, currency)} not paid`)
        : null,
      allKnownCostsPaid,
      hasKnownPayableCosts,
      hasMissingPriceAttention,
    },
  }
  // System labour group (additive, like the backend): every safe labour money
  // row once, aligned to an active "labour" category when one exists. Labour
  // rows stay in categories/uncategorized for older clients; the new frontend
  // de-duplicates on display.
  response.labour = deriveLabourSpendGroupFromBudget(response)
  return response
}

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

export function safeBudgetCost(item: MemoryViewItem): { amount: number; currency: string } | null {
  if (item.memoryType !== 'budget_cost') return null
  const line = safeLineTotal(item)
  return line && line.currency === 'GBP' ? line : null
}

export function budgetCostContribution(sections: MemoryViewSection[]): { amount: number; ids: string[] } {
  const items = sections.find(s => s.key === 'budget_costs')?.items ?? []
  let amount = 0
  const ids: string[] = []
  for (const item of items) {
    const line = safeBudgetCost(item)
    if (line && line.amount > 0) { amount += line.amount; ids.push(item.id) }
  }
  return { amount, ids }
}

export function safeRefund(item: MemoryViewItem): { amount: number; currency: string } | null {
  if (item.memoryType !== 'returned_material') return null
  if ((item.uncertaintyFlags ?? []).length > 0) return null
  if (item.refundCurrency !== 'GBP') return null
  if (!POS_DECIMAL(item.refundAmount)) return null
  return { amount: parseFloat(item.refundAmount!), currency: 'GBP' }
}

function returnedItemLabel(item: MemoryViewItem): string {
  const qtyUnit = [item.quantity, item.unit].filter(Boolean).join(' ')
  return [qtyUnit, item.materialName].filter(Boolean).join(' ').trim() ||
    item.materialName?.trim() || item.summary?.trim() || 'Returned item'
}

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

export function deriveGrossKnownCost(sections: MemoryViewSection[]): GrossKnownCost {
  const currency = 'GBP'
  const ordered = deriveCostSummary(sections)
  const labour = deriveLabourSummary(sections)
  const budgetCosts = budgetCostContribution(sections)
  const orderedAmt = ordered.knownSpendAmount ? parseFloat(ordered.knownSpendAmount) : 0
  const labourAmt = labour.knownSpendAmount ? parseFloat(labour.knownSpendAmount) : 0
  const total = orderedAmt + labourAmt + budgetCosts.amount
  const has = ordered.includedMemoryItemIds.length + labour.includedMemoryItemIds.length + budgetCosts.ids.length > 0
  return {
    amount: has ? String(Math.round(total * 100) / 100) : null,
    currency: has ? currency : null,
    label: has ? formatMoney(total, currency) : null,
  }
}

export function deriveTotalKnownCost(sections: MemoryViewSection[]): TotalKnownCost {
  const currency = 'GBP'
  const ordered = deriveCostSummary(sections)
  const labour = deriveLabourSummary(sections)
  const budgetCosts = budgetCostContribution(sections)
  const refunds = deriveRefundsSummary(sections)
  const orderedAmt = ordered.knownSpendAmount ? parseFloat(ordered.knownSpendAmount) : 0
  const labourAmt = labour.knownSpendAmount ? parseFloat(labour.knownSpendAmount) : 0
  const refundAmt = refunds.knownRefundAmount ? parseFloat(refunds.knownRefundAmount) : 0
  const total = orderedAmt + labourAmt + budgetCosts.amount - refundAmt
  const ids = [...ordered.includedMemoryItemIds, ...labour.includedMemoryItemIds, ...budgetCosts.ids]
  const has = ids.length > 0 || refunds.rows.length > 0
  return {
    knownSpendAmount: has ? String(Math.round(total * 100) / 100) : null,
    knownSpendCurrency: has ? currency : null,
    knownSpendLabel: has ? `${formatMoney(total, currency)} known spend` : null,
    includedMemoryItemIds: ids,
  }
}

export function localDateKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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

function hoursShort(hours: string): string {
  return DECIMAL.test(hours) ? `${Math.round(parseFloat(hours) * 100) / 100}h` : hours
}

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

export function findLabourBudgetCategory(bs: BudgetSummaryResponse): BudgetCategorySummary | null {
  return bs.categories.find(c => c.category.name.trim().toLowerCase() === 'labour') ?? null
}

export function deriveLabourSpendGroupFromBudget(bs: BudgetSummaryResponse): LabourSpendSummary {
  const currency = 'GBP'
  const seen = new Set<string>()
  const rows: BudgetSpendRow[] = []
  const add = (row: BudgetSpendRow) => { if (!seen.has(row.memoryItemId)) { seen.add(row.memoryItemId); rows.push(row) } }
  const labourCat = findLabourBudgetCategory(bs)
  // Legacy labour-type cost rows anywhere, plus general budget_cost rows the
  // user filed under the Labour category — both are "labour cost".
  for (const row of [...bs.categories.flatMap(c => c.rows), ...bs.uncategorized.rows]) {
    if (row.memoryType === 'labour') add(row)
  }
  if (labourCat) for (const row of labourCat.rows) {
    if (row.memoryType === 'budget_cost') add(row)
  }
  const spend = rows.reduce((n, r) => n + parseFloat(r.lineTotalAmount), 0)
  const has = rows.length > 0

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
    ...paymentFields(rows, false),
    rows,
  }
}
