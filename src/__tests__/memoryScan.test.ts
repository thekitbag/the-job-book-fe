import { describe, it, expect, vi } from 'vitest'
import { costDetailRows, deriveBudgetSummary, deriveCostSummary, deriveScanGroups, safeLineTotal, spendExclusionCopy, suggestBudgetCategory } from '../memoryScan'
import type { BudgetCategory, MemoryViewItem, MemoryViewSection } from '../types'

function item(overrides: Partial<MemoryViewItem>): MemoryViewItem {
  return {
    id: Math.random().toString(36).slice(2),
    memoryType: 'ordered_material',
    summary: '',
    materialName: null, quantity: null, unit: null, supplierName: null,
    deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    uncertaintyFlags: [],
    sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '', updatedAt: '', source: null,
    ...overrides,
  }
}

function section(key: string, items: MemoryViewItem[]): MemoryViewSection {
  return { key, label: key, items }
}

const ordered = (items: MemoryViewItem[]) => [section('ordered_materials', items)]

describe('deriveScanGroups — bought/ordered consolidation', () => {
  it('consolidates like-for-like ordered rows into a safe total', () => {
    const groups = deriveScanGroups(ordered([
      item({ id: 'a', materialName: 'plasterboard', quantity: '12', unit: 'sheets' }),
      item({ id: 'b', materialName: 'plasterboard', quantity: '12', unit: 'sheets' }),
    ]))
    const rows = groups[0].items
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe('24')
    expect(rows[0].unit).toBe('sheets')
    expect(rows[0].consolidated).toBe(true)
    expect(rows[0].memoryItemIds).toEqual(['a', 'b'])
  })

  it('does not consolidate mixed units', () => {
    const groups = deriveScanGroups(ordered([
      item({ materialName: 'plasterboard', quantity: '12', unit: 'sheets' }),
      item({ materialName: 'plasterboard', quantity: '6', unit: 'boards' }),
    ]))
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items.every(r => !r.consolidated)).toBe(true)
  })

  it('does not consolidate different materials', () => {
    const groups = deriveScanGroups(ordered([
      item({ materialName: 'plasterboard', quantity: '12', unit: 'sheets' }),
      item({ materialName: 'hardcore', quantity: '12', unit: 'sheets' }),
    ]))
    expect(groups[0].items).toHaveLength(2)
  })

  it('does not consolidate rows with uncertainty flags', () => {
    const groups = deriveScanGroups(ordered([
      item({ materialName: 'plasterboard', quantity: '12', unit: 'sheets' }),
      item({ materialName: 'plasterboard', quantity: '12', unit: 'sheets', uncertaintyFlags: ['approximate_quantity'] }),
    ]))
    // one consolidated-eligible row stays single, the uncertain one separate
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items.every(r => !r.consolidated)).toBe(true)
  })

  it('does not consolidate non-decimal quantities', () => {
    const groups = deriveScanGroups(ordered([
      item({ materialName: 'sand', quantity: 'about 8', unit: 'bags' }),
      item({ materialName: 'sand', quantity: '4', unit: 'bags' }),
    ]))
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items.every(r => !r.consolidated)).toBe(true)
  })

  it('does not consolidate when material or unit is missing', () => {
    const groups = deriveScanGroups(ordered([
      item({ materialName: null, quantity: '12', unit: 'sheets' }),
      item({ materialName: 'plasterboard', quantity: '12', unit: null }),
    ]))
    expect(groups[0].items).toHaveLength(2)
  })

  it('keeps an identical per-unit (each) cost on a consolidated row', () => {
    const same = deriveScanGroups(ordered([
      item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '5', costCurrency: 'GBP', costQualifier: 'each' }),
      item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '5', costCurrency: 'GBP', costQualifier: 'each' }),
    ]))[0].items[0]
    expect(same.consolidated).toBe(true)
    expect(same.costLabel).toBe('£5 each')
  })

  it('omits cost from a consolidated row when costs differ (no fake spend total)', () => {
    const differ = deriveScanGroups(ordered([
      item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '5', costCurrency: 'GBP', costQualifier: 'each' }),
      item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '7', costCurrency: 'GBP', costQualifier: 'each' }),
    ]))[0].items[0]
    expect(differ.costLabel).toBeNull()
    expect(differ.consolidated).toBe(true)
  })

  it('hides cost on a consolidated row when the identical qualifier is "total"', () => {
    const row = deriveScanGroups(ordered([
      item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '40', costCurrency: 'GBP', costQualifier: 'total' }),
      item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '40', costCurrency: 'GBP', costQualifier: 'total' }),
    ]))[0].items[0]
    expect(row.consolidated).toBe(true)
    expect(row.costLabel).toBeNull()
  })

  it('hides cost on a consolidated row for approx / unknown qualifiers', () => {
    for (const qualifier of ['approx', 'unknown'] as const) {
      const row = deriveScanGroups(ordered([
        item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '5', costCurrency: 'GBP', costQualifier: qualifier }),
        item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '5', costCurrency: 'GBP', costQualifier: qualifier }),
      ]))[0].items[0]
      expect(row.costLabel).toBeNull()
    }
  })

  it('always hides the total amount on a consolidated row even when identical', () => {
    const row = deriveScanGroups(ordered([
      item({ materialName: 'p', quantity: '1', unit: 'u', totalCostAmount: '40', costCurrency: 'GBP' }),
      item({ materialName: 'p', quantity: '1', unit: 'u', totalCostAmount: '40', costCurrency: 'GBP' }),
    ]))[0].items[0]
    expect(row.consolidated).toBe(true)
    expect(row.totalCostLabel).toBeNull()
  })

  it('still surfaces a single ordered row’s total and non-each cost (only consolidation is restricted)', () => {
    const row = deriveScanGroups(ordered([
      item({ materialName: 'p', quantity: '1', unit: 'u', costAmount: '40', costCurrency: 'GBP', costQualifier: 'total', totalCostAmount: '40' }),
    ]))[0].items[0]
    expect(row.consolidated).toBe(false)
    expect(row.costLabel).toBe('£40 total')
    expect(row.totalCostLabel).toBe('£40')
  })
})

describe('deriveScanGroups — used/leftover never total', () => {
  it('used material rows are not consolidated', () => {
    const groups = deriveScanGroups([section('used_materials', [
      item({ memoryType: 'used_material', materialName: 'sand', quantity: '9', unit: 'bags' }),
      item({ memoryType: 'used_material', materialName: 'sand', quantity: '4', unit: 'bags' }),
    ])])
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items.every(r => !r.consolidated)).toBe(true)
  })
})

describe('deriveScanGroups — groups, prose, worth-checking', () => {
  it('uses plain group labels and prose for non-material groups', () => {
    const groups = deriveScanGroups([
      section('ordered_materials', [item({ materialName: 'hardcore', quantity: '8', unit: 'bags' })]),
      section('watch_outs', [item({ memoryType: 'watch_out', summary: 'Uneven floor near back door' })]),
    ])
    const labels = groups.map(g => g.label)
    expect(labels).toContain('Bought / ordered')
    expect(labels).toContain('Watch-outs')
    const watch = groups.find(g => g.key === 'watch_outs')!
    expect(watch.items[0].primaryText).toBe('Uneven floor near back door')
  })

  it('rolls uncertain items from any section into a Worth checking group', () => {
    const groups = deriveScanGroups([
      section('leftovers', [item({ memoryType: 'leftover_material', materialName: 'sand', summary: 'half a bag', uncertaintyFlags: ['approximate_quantity'] })]),
    ])
    const wc = groups.find(g => g.key === 'worth_checking')
    expect(wc).toBeTruthy()
    expect(wc!.label).toBe('Worth checking')
    expect(wc!.items).toHaveLength(1)
  })

  it('omits the Worth checking group when nothing is uncertain', () => {
    const groups = deriveScanGroups(ordered([item({ materialName: 'hardcore', quantity: '8', unit: 'bags' })]))
    expect(groups.find(g => g.key === 'worth_checking')).toBeUndefined()
  })

  it('skips empty sections', () => {
    const groups = deriveScanGroups([
      section('ordered_materials', [item({ materialName: 'hardcore', quantity: '8', unit: 'bags' })]),
      section('customer_changes', []),
    ])
    expect(groups.find(g => g.key === 'customer_changes')).toBeUndefined()
  })
})

// ── Cost summary (Known spend) derivation ───────────────────────────────────

const orderedItem = (o: Partial<MemoryViewItem>) => item({ memoryType: 'ordered_material', ...o })

describe('safeLineTotal', () => {
  it('uses an explicit trusted total', () => {
    expect(safeLineTotal(orderedItem({ totalCostAmount: '40', costCurrency: 'GBP' }))).toEqual({ amount: 40, currency: 'GBP' })
  })

  it('derives quantity × unit cost when each + decimals + unit + currency', () => {
    expect(safeLineTotal(orderedItem({ quantity: '12', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' })))
      .toEqual({ amount: 600, currency: 'GBP' })
  })

  it('does not derive with approximate/non-decimal quantity', () => {
    expect(safeLineTotal(orderedItem({ quantity: 'about 12', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' }))).toBeNull()
  })

  it('does not derive with missing unit', () => {
    expect(safeLineTotal(orderedItem({ quantity: '12', unit: null, costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' }))).toBeNull()
  })

  it('does not total an unknown / unqualified basis cost', () => {
    expect(safeLineTotal(orderedItem({ costAmount: '50', costQualifier: 'unknown', costCurrency: 'GBP' }))).toBeNull()
  })

  it('excludes items with unresolved flags even with an explicit total', () => {
    expect(safeLineTotal(orderedItem({ totalCostAmount: '40', costCurrency: 'GBP', uncertaintyFlags: ['cost_uncertain'] }))).toBeNull()
  })

  it('requires a currency', () => {
    expect(safeLineTotal(orderedItem({ totalCostAmount: '40', costCurrency: null }))).toBeNull()
  })
})

describe('deriveCostSummary (Known spend)', () => {
  it('sums only safe ordered line totals and labels it known spend', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: 'hardcore', quantity: '8', unit: 'bags', costAmount: '5', costQualifier: 'each', costCurrency: 'GBP', totalCostAmount: '40' }),
      orderedItem({ id: 'b', materialName: 'plasterboard', quantity: '12', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' }),
    ]))
    expect(s.knownSpendAmount).toBe('640')
    expect(s.knownSpendLabel).toBe('£640 known spend')
    expect(s.includedMemoryItemIds).toEqual(['a', 'b'])
  })

  it('counts missing-cost ordered items and excludes them', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: 'hardcore', quantity: '8', unit: 'bags', costAmount: '5', costQualifier: 'each', costCurrency: 'GBP' }),
      orderedItem({ id: 'b', materialName: 'timber', quantity: '6', unit: 'lengths' }),
    ]))
    expect(s.knownSpendAmount).toBe('40')
    expect(s.missingCostCount).toBe(1)
    expect(s.excludedMemoryItemIds).toContain('b')
  })

  it('counts worth-checking / uncertain cost items separately and excludes them', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: 'screws', costAmount: '50', costQualifier: 'unknown', costCurrency: 'GBP', uncertaintyFlags: ['cost_uncertain'] }),
    ]))
    expect(s.knownSpendAmount).toBeNull()
    expect(s.uncertainCostCount).toBe(1)
    expect(s.missingCostCount).toBe(0)
  })

  it('consolidates like-for-like ordered rows and sums their line totals', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: 'plasterboard', quantity: '12', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' }),
      orderedItem({ id: 'b', materialName: 'plasterboard', quantity: '12', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' }),
    ]))
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0].lineTotalLabel).toBe('£1200 total')
    expect(s.rows[0].memoryItemIds).toEqual(['a', 'b'])
    expect(s.knownSpendAmount).toBe('1200')
  })

  it('ignores non-ordered sections', () => {
    const s = deriveCostSummary([
      section('used_materials', [orderedItem({ memoryType: 'used_material', totalCostAmount: '99', costCurrency: 'GBP' })]),
    ])
    expect(s.knownSpendAmount).toBeNull()
  })

  it('does not consolidate two explicit-total ordered items with null unit', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: 'sundries', quantity: null, unit: null, totalCostAmount: '30', costCurrency: 'GBP' }),
      orderedItem({ id: 'b', materialName: 'sundries', quantity: null, unit: null, totalCostAmount: '20', costCurrency: 'GBP' }),
    ]))
    // both are safe (explicit totals) so still counted, but kept as separate rows
    expect(s.knownSpendAmount).toBe('50')
    expect(s.rows).toHaveLength(2)
    expect(s.rows.map(r => r.memoryItemIds)).toEqual([['a'], ['b']])
  })

  it('does not consolidate ordered items with null materialName', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: null, unit: 'job', totalCostAmount: '30', costCurrency: 'GBP' }),
      orderedItem({ id: 'b', materialName: null, unit: 'job', totalCostAmount: '20', costCurrency: 'GBP' }),
    ]))
    expect(s.rows).toHaveLength(2)
  })

  it('sums the quantity on a consolidated included row (not the first item only)', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: 'plasterboard', quantity: '12', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' }),
      orderedItem({ id: 'b', materialName: 'plasterboard', quantity: '12', unit: 'sheets', costAmount: '50', costQualifier: 'each', costCurrency: 'GBP' }),
    ]))
    expect(s.rows[0].quantity).toBe('24')
  })
})

describe('deriveCostSummary — excludedRows (Known spend clarity)', () => {
  it('names a no-cost item with reason no_cost_remembered', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 't', materialName: 'timber', quantity: '6', unit: 'lengths' }),
    ]))
    expect(s.excludedRows).toEqual([
      { memoryItemId: 't', itemLabel: 'timber', materialName: 'timber', quantity: '6', unit: 'lengths', reason: 'no_cost_remembered' },
    ])
  })

  it('names an untrusted-cost item with reason cost_worth_checking', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'i', materialName: 'insulation', quantity: '4', unit: 'packs', costAmount: '120', costQualifier: 'approx', costCurrency: 'GBP' }),
    ]))
    expect(s.excludedRows).toEqual([
      { memoryItemId: 'i', itemLabel: 'insulation', materialName: 'insulation', quantity: '4', unit: 'packs', reason: 'cost_worth_checking' },
    ])
  })

  it('keeps one excluded row per item — does not consolidate exclusions', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'm1', materialName: 'membrane', quantity: '5', unit: 'rolls' }),
      orderedItem({ id: 'm2', materialName: 'membrane', quantity: '5', unit: 'rolls' }),
    ]))
    expect(s.excludedRows).toHaveLength(2)
    expect(s.excludedRows!.map(r => r.memoryItemId)).toEqual(['m1', 'm2'])
  })

  it('falls back to the summary for itemLabel when material name is absent', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'x', materialName: null, summary: 'Misc sundries from the merchant' }),
    ]))
    expect(s.excludedRows![0].itemLabel).toBe('Misc sundries from the merchant')
  })

  it('produces an empty excludedRows array when nothing is excluded', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'a', materialName: 'hardcore', quantity: '8', unit: 'bags', totalCostAmount: '40', costCurrency: 'GBP' }),
    ]))
    expect(s.excludedRows).toEqual([])
  })

  it('every trusted item appears exactly once across rows and excludedRows', () => {
    const s = deriveCostSummary(ordered([
      orderedItem({ id: 'inc', materialName: 'hardcore', quantity: '8', unit: 'bags', totalCostAmount: '40', costCurrency: 'GBP' }),
      orderedItem({ id: 'miss', materialName: 'timber', quantity: '6', unit: 'lengths' }),
      orderedItem({ id: 'unsure', materialName: 'insulation', costAmount: '120', costQualifier: 'approx', costCurrency: 'GBP' }),
    ]))
    const includedIds = s.rows.flatMap(r => r.memoryItemIds)
    const excludedIds = s.excludedRows!.map(r => r.memoryItemId)
    expect([...includedIds, ...excludedIds].sort()).toEqual(['inc', 'miss', 'unsure'])
    expect(s.includedMemoryItemIds.sort()).toEqual(includedIds.sort())
    expect(s.excludedMemoryItemIds.sort()).toEqual(excludedIds.sort())
  })
})

describe('spendExclusionCopy', () => {
  it('maps the two known reasons to product copy', () => {
    expect(spendExclusionCopy('no_cost_remembered')).toBe('No cost remembered')
    expect(spendExclusionCopy('cost_worth_checking')).toBe('Cost worth checking')
  })

  it('falls back to "Cost worth checking" for an unknown future reason and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(spendExclusionCopy('some_future_reason')).toBe('Cost worth checking')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('some_future_reason'))
    warn.mockRestore()
  })
})

describe('costDetailRows', () => {
  it('shows unit cost for an each basis', () => {
    expect(costDetailRows({ costAmount: '50', costCurrency: 'GBP', costQualifier: 'each', totalCostAmount: '600' }))
      .toEqual([['Unit cost', '£50 each'], ['Total', '£600']])
  })

  it('shows a worth-checking note for an unknown basis, never a bare number', () => {
    expect(costDetailRows({ costAmount: '50', costCurrency: 'GBP', costQualifier: 'unknown', totalCostAmount: null }))
      .toEqual([['Cost', '£50 — worth checking']])
  })

  it('renders a total-basis amount as Total', () => {
    expect(costDetailRows({ costAmount: '600', costCurrency: 'GBP', costQualifier: 'total', totalCostAmount: null }))
      .toEqual([['Total', '£600']])
  })

  it('returns nothing when there is no cost', () => {
    expect(costDetailRows({ costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null })).toEqual([])
  })
})

// ── Budget summary derivation ───────────────────────────────────────────────

function cat(over: Partial<BudgetCategory>): BudgetCategory {
  return {
    id: 'cat-x', jobId: 'job-1', name: 'cat', budgetAmount: null, budgetCurrency: null,
    sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '',
    ...over,
  }
}

const safeItem = (o: Partial<MemoryViewItem>) =>
  item({ memoryType: 'ordered_material', materialName: 'x', quantity: '1', unit: 'load', totalCostAmount: '100', costCurrency: 'GBP', ...o })

describe('deriveBudgetSummary', () => {
  it('groups safe spend under its assigned category and computes remaining', () => {
    const cats = [cat({ id: 'c1', name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP' })]
    const s = deriveBudgetSummary('job-1', ordered([
      safeItem({ id: 'a', materialName: 'timber', totalCostAmount: '1850', budgetCategoryId: 'c1' }),
    ]), cats)
    const timber = s.categories[0]
    expect(timber.knownSpendAmount).toBe('1850')
    expect(timber.knownSpendLabel).toBe('£1850 known spend')
    expect(timber.budgetLabel).toBe('£4000 budget')
    expect(timber.remainingAmount).toBe('2150')
    expect(timber.remainingLabel).toBe('£2150 remaining')
    expect(timber.overBudget).toBe(false)
    expect(timber.rows.map(r => r.memoryItemId)).toEqual(['a'])
  })

  it('puts safe spend with no category into uncategorised', () => {
    const s = deriveBudgetSummary('job-1', ordered([
      safeItem({ id: 'a', totalCostAmount: '320', budgetCategoryId: null }),
    ]), [])
    expect(s.uncategorized.knownSpendAmount).toBe('320')
    expect(s.uncategorized.rows.map(r => r.memoryItemId)).toEqual(['a'])
  })

  it('shows No budget set (null remaining) for a category with no budget amount', () => {
    const cats = [cat({ id: 'c1', name: 'electrics', budgetAmount: null })]
    const s = deriveBudgetSummary('job-1', ordered([
      safeItem({ id: 'a', totalCostAmount: '200', budgetCategoryId: 'c1' }),
    ]), cats)
    const electrics = s.categories[0]
    expect(electrics.budgetLabel).toBeNull()
    expect(electrics.knownSpendLabel).toBe('£200 known spend')
    expect(electrics.remainingAmount).toBeNull()
    expect(electrics.overBudget).toBe(false)
  })

  it('flags over budget when known spend exceeds the budget amount', () => {
    const cats = [cat({ id: 'c1', name: 'timber', budgetAmount: '100', budgetCurrency: 'GBP' })]
    const s = deriveBudgetSummary('job-1', ordered([
      safeItem({ id: 'a', totalCostAmount: '150', budgetCategoryId: 'c1' }),
    ]), cats)
    expect(s.categories[0].overBudget).toBe(true)
    expect(s.categories[0].remainingLabel).toBe('£50 over budget')
  })

  it('excludes missing-cost, worth-checking, and non-ordered items from category totals', () => {
    const cats = [cat({ id: 'c1', name: 'timber', budgetAmount: '1000', budgetCurrency: 'GBP' })]
    const s = deriveBudgetSummary('job-1', [
      section('ordered_materials', [
        safeItem({ id: 'safe', totalCostAmount: '100', budgetCategoryId: 'c1' }),
        // missing cost
        item({ id: 'missing', materialName: 'timber', quantity: '6', unit: 'lengths', budgetCategoryId: 'c1' }),
        // worth checking (approx basis → not safe)
        item({ id: 'unsure', materialName: 'timber', costAmount: '50', costQualifier: 'approx', costCurrency: 'GBP', budgetCategoryId: 'c1' }),
      ]),
      // used material never contributes
      section('used_materials', [safeItem({ id: 'used', memoryType: 'used_material', totalCostAmount: '999', budgetCategoryId: 'c1' })]),
    ], cats)
    expect(s.categories[0].knownSpendAmount).toBe('100')
    expect(s.categories[0].rows.map(r => r.memoryItemId)).toEqual(['safe'])
  })

  it('ignores archived categories and treats their (cleared) spend as uncategorised', () => {
    const cats = [cat({ id: 'c1', name: 'old', budgetAmount: '500', budgetCurrency: 'GBP', isArchived: true })]
    const s = deriveBudgetSummary('job-1', ordered([
      // item still points at the archived category id (defensive)
      safeItem({ id: 'a', totalCostAmount: '80', budgetCategoryId: 'c1' }),
    ]), cats)
    expect(s.categories).toHaveLength(0)
    expect(s.uncategorized.knownSpendAmount).toBe('80')
  })

  it('computes totals across categories and uncategorised', () => {
    const cats = [
      cat({ id: 'c1', name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP', sortOrder: 0 }),
      cat({ id: 'c2', name: 'electrics', budgetAmount: null, sortOrder: 1 }),
    ]
    const s = deriveBudgetSummary('job-1', ordered([
      safeItem({ id: 'a', totalCostAmount: '1850', budgetCategoryId: 'c1' }),
      safeItem({ id: 'b', totalCostAmount: '200', budgetCategoryId: 'c2' }),
      safeItem({ id: 'c', totalCostAmount: '320', budgetCategoryId: null }),
    ]), cats)
    expect(s.totals.budgetAmount).toBe('4000') // only categories with a budget amount
    expect(s.totals.knownSpendAmount).toBe('2370') // 1850 + 200 + 320
    expect(s.totals.remainingAmount).toBe('1630')
    expect(s.totals.overBudget).toBe(false)
  })

  it('reports a null total budget (no remaining) when no category has a budget amount', () => {
    const cats = [cat({ id: 'c1', name: 'electrics', budgetAmount: null })]
    const s = deriveBudgetSummary('job-1', ordered([
      safeItem({ id: 'a', totalCostAmount: '200', budgetCategoryId: 'c1' }),
    ]), cats)
    expect(s.totals.budgetAmount).toBeNull()
    expect(s.totals.remainingAmount).toBeNull()
    expect(s.totals.knownSpendAmount).toBe('200')
  })
})

describe('suggestBudgetCategory', () => {
  const cats = [
    cat({ id: 'c-timber', name: 'timber' }),
    cat({ id: 'c-clad', name: 'cladding' }),
    cat({ id: 'c-elec', name: 'electrics' }),
  ]
  const ordered = (o: { materialName?: string | null; summary?: string }) =>
    ({ memoryType: 'ordered_material', materialName: o.materialName ?? null, summary: o.summary ?? '' })

  it('suggests on an exact material-name match', () => {
    expect(suggestBudgetCategory(ordered({ materialName: 'Timber' }), cats))
      .toEqual({ budgetCategoryId: 'c-timber', categoryName: 'timber', reason: 'material_name_match' })
  })

  it('suggests on an exact token match in the summary', () => {
    expect(suggestBudgetCategory(ordered({ materialName: 'DPM', summary: 'Ordered cladding boards' }), cats))
      .toEqual({ budgetCategoryId: 'c-clad', categoryName: 'cladding', reason: 'summary_match' })
  })

  it('does not match a substring (token boundary required)', () => {
    expect(suggestBudgetCategory(ordered({ materialName: 'x', summary: 'electricssupplies order' }), cats)).toBeNull()
  })

  it('returns no suggestion for non-ordered memory', () => {
    expect(suggestBudgetCategory({ memoryType: 'used_material', materialName: 'timber', summary: '' }, cats)).toBeNull()
  })

  it('returns no suggestion when there are no active categories', () => {
    expect(suggestBudgetCategory(ordered({ materialName: 'timber' }), [])).toBeNull()
    expect(suggestBudgetCategory(ordered({ materialName: 'timber' }), [cat({ id: 'a', name: 'timber', isArchived: true })])).toBeNull()
  })

  it('returns no suggestion when the summary matches more than one category', () => {
    expect(suggestBudgetCategory(ordered({ materialName: 'x', summary: 'timber and cladding delivered' }), cats)).toBeNull()
  })

  it('prefers a material-name match over summary matches', () => {
    expect(suggestBudgetCategory(ordered({ materialName: 'electrics', summary: 'timber and cladding' }), cats))
      .toEqual({ budgetCategoryId: 'c-elec', categoryName: 'electrics', reason: 'material_name_match' })
  })
})

describe('spend invariant — budget totals match cost summary', () => {
  it('budget-summary total known spend equals deriveCostSummary known spend for a mixed fixture', () => {
    const cats = [cat({ id: 'c1', name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP' })]
    const sections = ordered([
      orderedItem({ id: 'inc1', materialName: 'timber', quantity: '1', unit: 'load', totalCostAmount: '1850', costCurrency: 'GBP', budgetCategoryId: 'c1' }),
      orderedItem({ id: 'inc2', materialName: 'hardcore', quantity: '8', unit: 'bags', totalCostAmount: '320', costCurrency: 'GBP' }), // uncategorised
      orderedItem({ id: 'miss', materialName: 'sand', quantity: '2', unit: 'bags' }), // missing cost, excluded
    ])
    const cost = deriveCostSummary(sections)
    const budget = deriveBudgetSummary('job-1', sections, cats)
    expect(budget.totals.knownSpendAmount).toBe(cost.knownSpendAmount)
    expect(budget.totals.knownSpendAmount).toBe('2170') // 1850 categorised + 320 uncategorised
  })
})
