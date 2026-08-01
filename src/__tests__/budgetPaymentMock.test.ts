import { beforeEach, describe, expect, it } from 'vitest'
import { mockBudgetSummary } from '../api/mock/budget'
import { mockAssignMemoryItemCategory, mockCreateMemoryItem, mockMemoryView } from '../api/mock/memory'
import { mockDeleteMoneyEvent, mockGetJobMoney, mockMarkMoneyOut } from '../api/mock/money'
import { resetMockApiForE2e } from '../api/mock/reset'

const JOB_ID = 'job-pilot-garden-room-001'

describe('category-aware payment mock contract', () => {
  beforeEach(() => {
    resetMockApiForE2e('payment-state')
  })

  it('seeds paid, not-paid, mixed, zero-cost, missing-price and uncategorised cases', () => {
    const summary = mockBudgetSummary(JOB_ID)
    const byName = new Map(summary.categories.map(category => [category.category.name, category]))

    expect(byName.get('cladding')).toMatchObject({
      paymentState: 'some_paid',
      paidAmount: '600',
      notPaidAmount: '600',
      paymentStateReason: 'eligible_items',
    })
    expect(byName.get('electrics')).toMatchObject({
      paymentState: 'paid',
      paidAmount: '40',
      notPaidAmount: null,
      paymentStateReason: 'eligible_items',
    })
    expect(byName.get('electrics')?.rows.some(row => row.memoryItemId === 'mem-view-zero')).toBe(false)
    expect(byName.get('timber')).toMatchObject({
      paymentState: null,
      paymentStateReason: 'missing_price_present',
    })
    expect(summary.labour).toMatchObject({
      paymentState: 'not_paid',
      paidAmount: null,
      notPaidAmount: '880',
      paymentStateReason: 'eligible_items',
    })
    expect(summary.totals).toMatchObject({
      knownSpendAmount: '2270',
      notPaidAmount: '1630',
      notPaidCurrency: 'GBP',
      notPaidLabel: '£1,630 not paid',
      allKnownCostsPaid: false,
      hasKnownPayableCosts: true,
      hasMissingPriceAttention: true,
    })

    const money = mockGetJobMoney(JOB_ID)
    expect(money.rows.find(row => row.sourceItemLabel === 'Plant hire')).toMatchObject({
      sourceBudgetCategoryId: null,
      sourceBudgetCategoryName: null,
    })
  })

  it('resolves a paid row category from its current source assignment without duplicating Money', () => {
    const before = mockGetJobMoney(JOB_ID)
    const paid = before.rows.find(row => row.sourceMemoryItemId === 'mem-view-004')
    expect(paid).toMatchObject({ sourceBudgetCategoryName: 'cladding' })

    mockAssignMemoryItemCategory(JOB_ID, 'mem-view-004', 'cat-electrics')

    const after = mockGetJobMoney(JOB_ID)
    expect(after.rows).toHaveLength(before.rows.length)
    expect(after.rows.find(row => row.id === paid?.id)).toMatchObject({
      sourceBudgetCategoryId: 'cat-electrics',
      sourceBudgetCategoryName: 'electrics',
    })
  })

  it('creates a bought item and its paid Money movement atomically', () => {
    const created = mockCreateMemoryItem(JOB_ID, {
      memoryType: 'ordered_material',
      materialName: 'nails',
      costAmount: '30',
      costCurrency: 'GBP',
      costQualifier: 'total',
      budgetCategoryId: 'cat-electrics',
      markPaid: true,
    })

    expect(mockGetJobMoney(JOB_ID).rows.filter(row => row.sourceMemoryItemId === created.id)).toEqual([
      expect.objectContaining({
        direction: 'out',
        amount: '30',
        sourceBudgetCategoryName: 'electrics',
      }),
    ])
    expect(mockBudgetSummary(JOB_ID).categories.find(category => category.category.id === 'cat-electrics')).toMatchObject({
      knownSpendAmount: '70',
      paymentState: 'paid',
      paidAmount: '70',
    })
  })

  it('rejects ineligible paid-now creation without leaving a partial source item', () => {
    const beforeIds = mockMemoryView(JOB_ID).sections.flatMap(section => section.items.map(item => item.id))

    expect(() => mockCreateMemoryItem(JOB_ID, {
      memoryType: 'ordered_material',
      materialName: 'free offcuts',
      costAmount: '0',
      costCurrency: 'GBP',
      costQualifier: 'total',
      markPaid: true,
    })).toThrow('can’t be marked paid')

    expect(mockMemoryView(JOB_ID).sections.flatMap(section => section.items.map(item => item.id))).toEqual(beforeIds)
    expect(mockGetJobMoney(JOB_ID).rows.some(row => row.sourceItemLabel === 'free offcuts')).toBe(false)
  })

  it('Mark paid and Undo paid change authoritative overall not-paid only', () => {
    const before = mockBudgetSummary(JOB_ID)
    const position = {
      knownSpendAmount: before.totals.knownSpendAmount,
      budgetAmount: before.totals.budgetAmount,
      remainingAmount: before.totals.remainingAmount,
      overBudget: before.totals.overBudget,
    }

    const money = mockMarkMoneyOut(JOB_ID, { sourceMemoryItemId: 'mem-view-005' })
    const paidEvent = money.rows.find(row => row.sourceMemoryItemId === 'mem-view-005')
    const afterPaid = mockBudgetSummary(JOB_ID)
    expect(afterPaid.totals).toMatchObject({
      ...position,
      notPaidAmount: '1030',
      notPaidLabel: '£1,030 not paid',
      allKnownCostsPaid: false,
    })

    mockDeleteMoneyEvent(JOB_ID, paidEvent!.id)
    expect(mockBudgetSummary(JOB_ID).totals).toMatchObject({
      ...position,
      notPaidAmount: '1630',
      notPaidLabel: '£1,630 not paid',
      allKnownCostsPaid: false,
    })
  })

  it('reports all known costs paid only after every eligible source is paid', () => {
    for (const sourceMemoryItemId of ['mem-view-005', 'mem-labour-2', 'mem-labour-3', 'mem-view-015']) {
      mockMarkMoneyOut(JOB_ID, { sourceMemoryItemId })
    }

    expect(mockBudgetSummary(JOB_ID).totals).toMatchObject({
      notPaidAmount: '0',
      notPaidCurrency: 'GBP',
      notPaidLabel: 'All known costs paid',
      allKnownCostsPaid: true,
      hasKnownPayableCosts: true,
      hasMissingPriceAttention: true,
    })
  })

  it('omits overall payment context when no eligible payable source exists', () => {
    expect(mockBudgetSummary('job-with-no-costs').totals).toMatchObject({
      notPaidAmount: null,
      notPaidCurrency: null,
      notPaidLabel: null,
      allKnownCostsPaid: false,
      hasKnownPayableCosts: false,
      hasMissingPriceAttention: false,
    })
  })
})
