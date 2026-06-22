import { describe, it, expect } from 'vitest'
import { costDetailRows, deriveCostSummary, deriveScanGroups, safeLineTotal } from '../memoryScan'
import type { MemoryViewItem, MemoryViewSection } from '../types'

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
