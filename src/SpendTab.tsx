import { useRef, useState } from 'react'
import MemoryCard from './MemoryCard'
import EmptyState from './EmptyState'
import LabourBudgetControl from './LabourBudgetControl'
import { formatMoney, moneyFigure } from './memoryScan'
import type { JobMemory } from './useJobMemory'
import type { MarkPaidControls } from './markPaid'
import type { BudgetCategorySummary, BudgetSpendRow, BudgetSummaryResponse, LabourSpendSummary, MemoryViewItem, TotalKnownCost } from './types'

// Spent-against-budget bar for a category block. Rendered only with a real
// budget to measure against — a bar with no denominator would be decoration,
// and this theme has no room for that. Reads the same figures as the
// SPENT/BUDGET/LEFT columns beside it, so the two can't disagree.
function BudgetBar({ spend, budget, over }: { spend: string | null; budget: string | null; over?: boolean }) {
  const spent = spend ? parseFloat(spend) : 0
  const total = budget ? parseFloat(budget) : null
  if (total === null || !(total > 0)) return null
  const pct = Math.min(100, Math.round((spent / total) * 100))
  return (
    <div className={`budget-bar${over ? ' budget-bar--over' : ''}`} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

type PaymentSummary = Pick<
  BudgetCategorySummary | LabourSpendSummary,
  'paymentState' | 'paidAmount' | 'paidLabel' | 'notPaidAmount' | 'notPaidLabel' | 'paymentStateReason'
>

const PAYMENT_STATE_LABEL = {
  paid: 'Paid',
  not_paid: 'Not paid',
  some_paid: 'Some paid',
} as const

function visiblePaymentState(summary: PaymentSummary) {
  // Missing/untrusted prices take precedence over a reassuring all-clear. The
  // backend is authoritative through paymentStateReason; the UI does not infer
  // this from labels or from £0.
  if (summary.paymentStateReason === 'missing_price_present') return null
  return summary.paymentState ?? null
}

function PaymentStateText({ summary }: { summary: PaymentSummary }) {
  const state = visiblePaymentState(summary)
  if (!state) return null
  return <span className={`budget-payment-state budget-payment-state--${state}`}>{PAYMENT_STATE_LABEL[state]}</span>
}

function PaymentBreakdown({ summary }: { summary: PaymentSummary }) {
  const state = visiblePaymentState(summary)
  if (!state) return null
  const showPaid = (state === 'paid' || state === 'some_paid') && summary.paidAmount !== null && summary.paidAmount !== undefined
  const showNotPaid = (state === 'not_paid' || state === 'some_paid') && summary.notPaidAmount !== null && summary.notPaidAmount !== undefined
  if (!showPaid && !showNotPaid) return null
  return (
    <dl className={`budget-payment-breakdown${showPaid && showNotPaid ? ' budget-payment-breakdown--split' : ''}`}>
      {showPaid && <div><dt>Paid</dt><dd>{moneyFigure(summary.paidAmount!) ?? summary.paidLabel}</dd></div>}
      {showNotPaid && <div><dt>Not paid</dt><dd>{moneyFigure(summary.notPaidAmount!) ?? summary.notPaidLabel}</dd></div>}
    </dl>
  )
}

function paymentControlsForRow(markPaid: MarkPaidControls | undefined, row: BudgetSpendRow | undefined): MarkPaidControls | undefined {
  if (!markPaid || !row || row.paymentState === undefined) return markPaid
  return {
    ...markPaid,
    isPaid: item => item.id === row.memoryItemId ? row.paymentState === 'paid' : markPaid.isPaid(item),
    canMarkPaid: item => item.id === row.memoryItemId
      ? row.eligibleForPaymentState === true && row.paymentState !== 'paid' && markPaid.canMarkPaid(item)
      : markPaid.canMarkPaid(item),
  }
}

// Inline name + budget form, reused for adding and editing a category.
function CategoryForm({
  initialName,
  initialAmount,
  submitting,
  onSave,
  onCancel,
}: {
  initialName: string
  initialAmount: string
  submitting: boolean
  onSave: (name: string, amount: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [amount, setAmount] = useState(initialAmount)
  return (
    <form className="budget-cat-form" aria-label="Budget category" onSubmit={e => { e.preventDefault(); onSave(name, amount) }}>
      <label className="queue-field">
        <span className="queue-field-label">Category name</span>
        <input className="queue-field-input" name="categoryName" value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="e.g. timber" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Budget amount (£) — optional</span>
        <input className="queue-field-input" name="budgetAmount" value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} placeholder="No budget set" />
      </label>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || name.trim() === ''}>{submitting ? 'Saving…' : 'Save category'}</button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </form>
  )
}

// Hero: one job-level known spend (bought + rated labour, less trusted
// refunds), against the total budget when one exists.
//
// Note the figure is NET of refunds and this screen no longer says so — the
// gross/refund breakdown and the refund rows were both cut as clutter. Returned
// materials and their refunds are still listed under Materials → Returned.
function KnownSpendHero({ total, totals, onShowBreakdown }: {
  total: TotalKnownCost
  totals: BudgetSummaryResponse['totals'] | null
  onShowBreakdown: () => void
}) {
  const knownAmount = totals?.knownSpendAmount ?? total.knownSpendAmount
  const knownCurrency = totals?.knownSpendCurrency ?? total.knownSpendCurrency
  const known = knownAmount ? parseFloat(knownAmount) : 0
  const budget = totals?.budgetAmount ? parseFloat(totals.budgetAmount) : null
  const hasBudget = budget !== null && budget > 0
  const pct = hasBudget ? Math.min(100, Math.round((known / budget!) * 100)) : 0
  const over = !!totals?.overBudget
  const remaining = totals?.remainingAmount != null ? parseFloat(totals.remainingAmount) : null
  // The backend owns the eligible-cost set and active paid-marker matching.
  // Older responses omit these additive fields, in which case the FE omits
  // payment context rather than inferring a second total from other APIs.
  const overallPaymentLabel = totals?.hasKnownPayableCosts ? totals.notPaidLabel : null
  // No kicker: the screen is called Budget and the figure is the biggest thing
  // on it. The region's accessible name is "Budget".
  return (
    <section className={`mem-hero${over ? ' mem-hero--over' : ''}`} aria-label="Budget">
      <p className="mem-hero-amount">
        {knownAmount ? formatMoney(known, knownCurrency) : 'None yet'}
        {knownAmount && <span className="mem-hero-cost"> cost</span>}
        {hasBudget && <span className="mem-hero-of"> of {formatMoney(budget!, 'GBP')}</span>}
      </p>
      <div className="mem-hero-outcomes">
        {/* Over budget is the one warning state here, and it takes warning-red —
            never the accent, which only ever means "tappable". */}
        {hasBudget && over && (
          <p className="mem-hero-warning">
            <span className="mem-hero-warning-dot" aria-hidden="true" />
            {formatMoney(known - budget!, 'GBP')} over
          </p>
        )}
        {/* The remaining figure is accent-coloured, so by the theme's rule it
            jumps to the per-category breakdown that explains it. */}
        {hasBudget && !over && remaining !== null && (
              <button type="button" className="mem-hero-sub" onClick={onShowBreakdown}>
                {formatMoney(remaining, 'GBP')} remaining ›
              </button>
        )}
        {overallPaymentLabel && (
          <p className="budget-overall-payment">{overallPaymentLabel}</p>
        )}
      </div>
      {hasBudget
        ? <div className="mem-hero-bar"><span style={{ width: `${pct}%` }} /></div>
        : <p className="mem-hero-sub mem-hero-sub--quiet">No budget set — add a category below</p>}
      {totals?.hasMissingPriceAttention && (
        <p className="budget-missing-price-attention">Some costs still need a price</p>
      )}
    </section>
  )
}

export default function SpendTab({ mem, markPaid }: { mem: JobMemory; markPaid?: MarkPaidControls }) {
  const {
    totalKnownCost, refunds, budgetSummary, refreshError, refetch,
    sectionItems, includedIds, exclusionReason, cardProps,
    budgetCategories, expandedCats, toggleCat, labourSpendGroup, handleSetLabourBudget,
    editingBudgetId, setEditingBudgetId, savingCatId,
    addingCategory, setAddingCategory, savingNewCategory, budgetError,
    openMenuCatId, setOpenMenuCatId,
    handleAddCategory, handleEditBudget, handleArchiveCategory,
  } = mem

  // Labour's "⋯" menu is always the entry point, whether or not a Labour
  // budget category exists yet — this tracks the amount-only "Set budget"
  // form when there's no category to key an edit off of.
  const [settingLabourBudget, setSettingLabourBudget] = useState(false)
  // Target for the hero's remaining figure — the breakdown it opens.
  const byCategoryRef = useRef<HTMLElement>(null)

  const orderedItems = sectionItems('ordered_materials')
  const labourItems = sectionItems('labour')
  // General Budget costs (labour cost, plant, hire, subcontractor, …). Budget
  // owns all cost, so these render alongside bought materials.
  const budgetCostItems = sectionItems('budget_costs')
  const hasRefunds = (refunds?.rows.length ?? 0) > 0
  // A job whose only money fact is a refund still has spend to show — the hero
  // has to render, or the refund would reduce a total Mike can't see.
  const hasSpendContent = orderedItems.length > 0 || labourItems.length > 0 || budgetCostItems.length > 0 || budgetCategories.length > 0 || hasRefunds

  // Trusted labour money lives in the Labour group (backend budgetSummary.labour
  // or the derived fallback). Its row ids drive de-duplication: a labour spend
  // row never also renders under a category card or Uncategorised.
  const labourRowIds = new Set((labourSpendGroup?.rows ?? []).map(r => r.memoryItemId))
  const showLabourGroup = !!labourSpendGroup && (labourSpendGroup.rows.length > 0 || !!labourSpendGroup.budgetCategory)
  const LABOUR_GROUP_KEY = '__labour__'

  // Uncategorised spend is driven by the authoritative budget-summary rows
  // (not re-derived from ordered_materials alone) — join back to the full
  // memory-view item for the MemoryCard. Labour rows shown under Labour are
  // excluded here (de-dup by memoryItemId).
  const allItemsById = new Map([...orderedItems, ...labourItems, ...budgetCostItems].map(i => [i.id, i] as const))
  const uncatItems = (budgetSummary?.uncategorized.rows ?? [])
    .filter(r => !labourRowIds.has(r.memoryItemId))
    .map(r => allItemsById.get(r.memoryItemId))
    .filter((i): i is MemoryViewItem => !!i)

  const labourGroupItems = (labourSpendGroup?.rows ?? [])
    .map(r => allItemsById.get(r.memoryItemId))
    .filter((i): i is MemoryViewItem => !!i)

  // The section header states how much is sitting outside a category — the
  // point of the section, in one figure.
  const uncatTotal = (budgetSummary?.uncategorized.rows ?? [])
    .filter(r => !labourRowIds.has(r.memoryItemId))
    .reduce((n, r) => n + parseFloat(r.lineTotalAmount), 0)

  // Budget owns all cost, including labour cost: Add cost can target any active
  // category, the Labour category included.

  // Historical rule: don't hide, don't double-count. Ordinary (non-labour)
  // spend already assigned to the Labour category stays visible for fixing —
  // it renders under the Labour group as clearly historical spend, with no
  // fresh add action for the category.
  const labourCategoryId = labourSpendGroup?.budgetCategory?.id ?? null
  const historicalLabourCategoryItems = labourCategoryId
    ? [...orderedItems].filter(i => i.budgetCategoryId === labourCategoryId && i.memoryType !== 'labour')
    : []

  function renderCategoryCard(cs: BudgetCategorySummary) {
    const c = cs.category
    // The Labour budget category is presented by the Labour group instead of a
    // second, duplicate category card.
    if (showLabourGroup && labourSpendGroup?.budgetCategory?.id === c.id) return null
    const notes = [...orderedItems, ...labourItems, ...budgetCostItems].filter(i => i.budgetCategoryId === c.id && !labourRowIds.has(i.id))
    const paymentRows = new Map(cs.rows.map(row => [row.memoryItemId, row]))
    const open = !!expandedCats[c.id]
    if (editingBudgetId === c.id) {
      return (
        <div key={c.id} className="budget-cat budget-cat--editing">
          <CategoryForm
            initialName={c.name}
            initialAmount={c.budgetAmount ?? ''}
            submitting={savingCatId === c.id}
            onSave={(name, amount) => handleEditBudget(c.id, name, amount)}
            onCancel={() => setEditingBudgetId(null)}
          />
        </div>
      )
    }
    return (
      <section key={c.id} className="budget-cat" aria-label={`Budget category ${c.name}`}>
        <div className="budget-cat-head">
          <h3 className="budget-cat-name">{c.name}</h3>
          <div className="budget-cat-menu-wrap">
            <button
              type="button"
              className="btn-cat-menu"
              aria-label={`Actions for ${c.name}`}
              aria-haspopup="menu"
              aria-expanded={openMenuCatId === c.id}
              onClick={() => setOpenMenuCatId(openMenuCatId === c.id ? null : c.id)}
            >⋯</button>
            {openMenuCatId === c.id && (
              <div className="budget-cat-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setOpenMenuCatId(null); setEditingBudgetId(c.id) }}>Edit budget</button>
                <button type="button" role="menuitem" className="budget-cat-menu-danger" disabled={savingCatId === c.id} onClick={() => {
                  setOpenMenuCatId(null)
                  if (window.confirm(`Remove "${c.name}"? Its cost moves to Uncategorised.`)) handleArchiveCategory(c.id)
                }}>Remove category</button>
              </div>
            )}
          </div>
        </div>
        <BudgetBar spend={cs.knownSpendAmount} budget={cs.budgetAmount} over={cs.overBudget} />
        <div className="budget-cat-figures">
          <div className="budget-figure"><dt>Cost</dt><dd>{moneyFigure(cs.knownSpendAmount) ?? 'None yet'}</dd></div>
          <div className="budget-figure"><dt>Budget</dt><dd>{moneyFigure(cs.budgetAmount) ?? 'Not set'}</dd></div>
          {cs.budgetLabel && (
            <div className={`budget-figure${cs.overBudget ? ' budget-figure--over' : ''}`}><dt>{cs.overBudget ? 'Over' : 'Remaining'}</dt><dd>{moneyFigure(cs.remainingAmount?.replace('-', '') ?? null)}</dd></div>
          )}
        </div>
        <div className="budget-payment-line">
          <PaymentStateText summary={cs} />
        </div>
        {notes.length === 0 && (
          <p className="cat-empty">Nothing yet</p>
        )}
        {/* Category-context add: opens the spend sheet with this category
            preselected (changeable/clearable in the form's category select). */}
        <div className="budget-cat-foot">
          {notes.length > 0 && (
            <button type="button" className="notes-toggle" aria-expanded={open} onClick={() => toggleCat(c.id)}>
              <span>{open ? 'Hide items' : `Show items (${notes.length})`}</span>
              <span className="notes-toggle-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
            </button>
          )}
        </div>
        {notes.length > 0 && open && <>
          <PaymentBreakdown summary={cs} />
          <div className="cat-notes">{notes.map(item => (
            <MemoryCard key={item.id} item={item} {...cardProps(item, false)} variant="sheet" markPaid={paymentControlsForRow(markPaid, paymentRows.get(item.id))} excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'cost_worth_checking')} />
          ))}</div>
        </>}
      </section>
    )
  }

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Budget">
      {hasSpendContent && totalKnownCost && (
        <KnownSpendHero
          total={totalKnownCost}
          totals={budgetSummary?.totals ?? null}
          onShowBreakdown={() => byCategoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      )}

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {!hasSpendContent && (
        <EmptyState
          title="No costs yet"
          hint="Costs appear here from Labour and Bought items, or from Record."
        />
      )}

      {/* "BY CATEGORY kicker left, + Add spend cobalt action right, then 2px
          rule" (handoff, Spend). The add action lives on this row rather than
          floating above the first category with nothing beneath it. */}
      <section aria-label="Budget categories" ref={byCategoryRef}>
      {/* Budget setup (Labour group + category cards) must not depend on
          spend existing first — a job with nothing spent yet still needs a
          way to create its first budget category. */}
      {/* System Labour group: trusted labour cost shows here once, without
          requiring a manual Labour budget category. When an active category
          named "labour" exists, its budget/remaining render here (and its
          normal category card is suppressed to avoid duplication). */}
      {showLabourGroup && labourSpendGroup && (
        labourSpendGroup.budgetCategory && editingBudgetId === labourSpendGroup.budgetCategory.id ? (
          <div className="budget-cat budget-cat--editing">
            <CategoryForm
              initialName={labourSpendGroup.budgetCategory.name}
              initialAmount={labourSpendGroup.budgetCategory.budgetAmount ?? ''}
              submitting={savingCatId === labourSpendGroup.budgetCategory.id}
              onSave={(name, amount) => handleEditBudget(labourSpendGroup.budgetCategory!.id, name, amount)}
              onCancel={() => setEditingBudgetId(null)}
            />
          </div>
        ) : (
          <section className="budget-cat budget-cat--labour" aria-label="Labour">
            <div className="budget-cat-head">
              <h3 className="budget-cat-name">Labour</h3>
              {/* Always the "⋯" — whether or not a Labour budget category
                  exists yet — so the entry point never changes shape. The
                  menu contents adapt: "Set budget" first-time, "Edit/Remove
                  budget" once one exists. */}
              <div className="budget-cat-menu-wrap">
                <button
                  type="button"
                  className="btn-cat-menu"
                  aria-label="Actions for Labour"
                  aria-haspopup="menu"
                  aria-expanded={openMenuCatId === LABOUR_GROUP_KEY}
                  onClick={() => setOpenMenuCatId(openMenuCatId === LABOUR_GROUP_KEY ? null : LABOUR_GROUP_KEY)}
                >⋯</button>
                {openMenuCatId === LABOUR_GROUP_KEY && (
                  <div className="budget-cat-menu" role="menu">
                    {labourSpendGroup.budgetCategory ? (
                      <>
                        <button type="button" role="menuitem" onClick={() => { setOpenMenuCatId(null); setEditingBudgetId(labourSpendGroup.budgetCategory!.id) }}>Edit budget</button>
                        <button type="button" role="menuitem" className="budget-cat-menu-danger" disabled={savingCatId === labourSpendGroup.budgetCategory.id} onClick={() => {
                          setOpenMenuCatId(null)
                          if (window.confirm('Remove the labour budget? Labour cost still shows here.')) handleArchiveCategory(labourSpendGroup.budgetCategory!.id)
                        }}>Remove budget</button>
                      </>
                    ) : (
                      <button type="button" role="menuitem" onClick={() => { setOpenMenuCatId(null); setSettingLabourBudget(true) }}>Set budget</button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <BudgetBar spend={labourSpendGroup.knownSpendAmount} budget={labourSpendGroup.budgetAmount} over={labourSpendGroup.overBudget} />
            <div className="budget-cat-figures">
              <div className="budget-figure"><dt>Cost</dt><dd>{moneyFigure(labourSpendGroup.knownSpendAmount) ?? 'None yet'}</dd></div>
              <div className="budget-figure"><dt>Budget</dt><dd>{moneyFigure(labourSpendGroup.budgetAmount) ?? 'Not set'}</dd></div>
              {labourSpendGroup.budgetLabel && (
                <div className={`budget-figure${labourSpendGroup.overBudget ? ' budget-figure--over' : ''}`}><dt>{labourSpendGroup.overBudget ? 'Over' : 'Remaining'}</dt><dd>{moneyFigure(labourSpendGroup.remainingAmount?.replace('-', '') ?? null)}</dd></div>
              )}
            </div>
            <div className="budget-payment-line">
              <PaymentStateText summary={labourSpendGroup} />
            </div>
            {labourGroupItems.length > 0
              ? <>
                  <button type="button" className="notes-toggle" aria-expanded={!!expandedCats[LABOUR_GROUP_KEY]} onClick={() => toggleCat(LABOUR_GROUP_KEY)}>
                    <span>{expandedCats[LABOUR_GROUP_KEY] ? 'Hide items' : `Show items (${labourGroupItems.length})`}</span>
                    <span className="notes-toggle-chev" aria-hidden="true">{expandedCats[LABOUR_GROUP_KEY] ? '▴' : '▾'}</span>
                  </button>
                  {expandedCats[LABOUR_GROUP_KEY] && <>
                    <PaymentBreakdown summary={labourSpendGroup} />
                    <div className="cat-notes">{labourGroupItems.map(item => {
                      const row = labourSpendGroup.rows.find(candidate => candidate.memoryItemId === item.id)
                      return <MemoryCard key={item.id} item={item} {...cardProps(item, false)} variant="sheet" markPaid={paymentControlsForRow(markPaid, row)} />
                    })}</div>
                  </>}
                </>
              : <p className="cat-empty">Nothing yet</p>}
            {/* One Labour concept: with no Labour category yet, "Set budget"
                above opens this amount-only form, which creates the
                underlying "Labour" category on save; with one, the ⋯ menu's
                "Edit budget" edits it like any category. */}
            {!labourSpendGroup.budgetCategory && settingLabourBudget && (
              <LabourBudgetControl
                budgetCategory={null}
                onSave={handleSetLabourBudget}
                error={budgetError || undefined}
                autoOpen
                onClose={() => setSettingLabourBudget(false)}
              />
            )}

            {/* Historical (non-labour) spend already assigned to the Labour
                category: visible, counted once through normal spend rules, and
                fixable — but never a fresh add target. */}
            {historicalLabourCategoryItems.length > 0 && (
              <div className="labour-historical" role="group" aria-label="Existing cost in the Labour category">
                <p className="labour-historical-title">Existing cost in this category</p>
                <div className="cat-notes">
                  {historicalLabourCategoryItems.map(item => (
                    <MemoryCard key={item.id} item={item} {...cardProps(item, false)} variant="sheet" markPaid={markPaid} excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'cost_worth_checking')} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )
      )}
        {budgetSummary?.categories.map(renderCategoryCard)}
        {budgetError && <p className="queue-item-error" role="alert">{budgetError}</p>}
        {/* Its own slim white row after the last band, so it never looks like
            part of the category above it. */}
        {addingCategory
          ? <CategoryForm initialName="" initialAmount="" submitting={savingNewCategory} onSave={handleAddCategory} onCancel={() => setAddingCategory(false)} />
          : <div className="budget-add-cat-row">
              <button type="button" className="btn-add-category" onClick={() => setAddingCategory(true)}>+ Add budget category</button>
            </div>}
      </section>

      {/* Zone 3: plain rows on white. These are items, not categories — no band,
          no stat grid, and a smaller name — so the two can't be confused. */}
      {uncatItems.length > 0 && (
        <section className="uncat" aria-label="Uncategorised cost">
          <div className="uncat-head">
            <span className="mem-section-label uncat-kicker">Not in a category yet</span>
            <span className="uncat-count">{uncatItems.length} · {formatMoney(uncatTotal, 'GBP')}</span>
          </div>
          <div className="uncat-rows">
            {uncatItems.map(item => <MemoryCard key={item.id} item={item} {...cardProps(item, true)} variant="sheet" markPaid={markPaid} />)}
          </div>
        </section>
      )}
    </div>
  )
}
