import { useState } from 'react'
import MemoryCard from './MemoryCard'
import MemoryEditForm from './MemoryEditForm'
import DirectAddForm from './DirectAddForm'
import { memoryItemToEdit } from './memoryEdit'
import { canDeriveUnitCost, formatMoney, formatTotalLabel } from './memoryScan'
import type { JobMemory } from './useJobMemory'
import type { BudgetCategory, BudgetCategorySummary, BudgetSummaryResponse, MemoryViewItem, TotalKnownCost } from './types'

// One row in the "Needs cost check" attention area. Asks whether a captured
// amount is each or total, with quick resolutions. When Mike opens Fix memory it
// swaps to the full edit form in place.
function CostCheckItem({
  item,
  editing,
  submitting,
  errorMsg,
  categories,
  onTotal,
  onEach,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  item: MemoryViewItem
  editing: boolean
  submitting: boolean
  errorMsg: string | null
  categories: BudgetCategory[]
  onTotal: () => void
  onEach: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: import('./types').MemoryItemEdit) => void
}) {
  if (editing) {
    return (
      <div className="cost-check-item cost-check-item--editing">
        <MemoryEditForm initial={memoryItemToEdit(item)} submitting={submitting} categories={categories} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }
  const amount = formatTotalLabel(item.costAmount, item.costCurrency || 'GBP') ?? ''
  const identity = [item.quantity, item.materialName, item.unit].filter(Boolean).join(' ') || item.materialName || item.summary
  const showEach = canDeriveUnitCost(item)
  return (
    <div className="cost-check-item">
      <p className="cost-check-headline">{identity}{amount ? ` — ${amount}` : ''}</p>
      <p className="cost-check-q">Is {amount} each or {amount} total?</p>
      <div className="cost-check-actions">
        <button type="button" className="btn-cost-total" disabled={submitting} onClick={onTotal}>
          {submitting ? 'Saving…' : `Confirm ${amount} total`}
        </button>
        {showEach && (
          <button type="button" className="btn-cost-each" disabled={submitting} onClick={onEach}>
            Set as {amount} each
          </button>
        )}
        <button type="button" className="btn-cost-fix" disabled={submitting} onClick={onStartEdit}>Fix memory</button>
      </div>
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
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

// Hero: one job-level Known spend (bought + rated labour), against the total
// budget when one exists.
function KnownSpendHero({ total, totals }: { total: TotalKnownCost; totals: BudgetSummaryResponse['totals'] | null }) {
  const known = total.knownSpendAmount ? parseFloat(total.knownSpendAmount) : 0
  const budget = totals?.budgetAmount ? parseFloat(totals.budgetAmount) : null
  const hasBudget = budget !== null && budget > 0
  const pct = hasBudget ? Math.min(100, Math.round((known / budget!) * 100)) : 0
  const over = !!totals?.overBudget
  return (
    <section className={`mem-hero${over ? ' mem-hero--over' : ''}`} aria-label="Known spend">
      <p className="mem-hero-cap">Known spend{hasBudget ? ' vs budget' : ''}</p>
      <p className="mem-hero-amount">
        {total.knownSpendAmount ? formatMoney(known, total.knownSpendCurrency) : 'None yet'}
        {hasBudget && <span className="mem-hero-of"> of {formatMoney(budget!, 'GBP')}</span>}
      </p>
      {hasBudget
        ? <>
            <p className="mem-hero-sub">{over ? `${formatMoney(known - budget!, 'GBP')} over budget` : (totals?.remainingLabel ?? '')}</p>
            <div className="mem-hero-bar"><span style={{ width: `${pct}%` }} /></div>
          </>
        : <p className="mem-hero-sub">No budget set — add a category below</p>}
    </section>
  )
}

export default function SpendTab({ mem }: { mem: JobMemory }) {
  const {
    totalKnownCost, budgetSummary, refreshError, refetch, addMemoryItem,
    sectionItems, includedIds, exclusionReason, isUncategorised, cardProps,
    costCheckItems, resolveCostBasis,
    budgetCategories, expandedCats, toggleCat,
    editingBudgetId, setEditingBudgetId, savingCatId,
    addingCategory, setAddingCategory, savingNewCategory, budgetError,
    openMenuCatId, setOpenMenuCatId,
    handleAddCategory, handleEditBudget, handleArchiveCategory,
  } = mem

  const orderedItems = sectionItems('ordered_materials')
  const labourItems = sectionItems('labour')
  const hasSpendContent = orderedItems.length > 0 || labourItems.length > 0 || budgetCategories.length > 0

  // Cost-basis-ambiguous items are promoted to the attention area near the hero,
  // so keep them out of the lower "not in Known spend yet" list to avoid a second
  // competing action for the same item. Only no-cost items remain there.
  const costCheckIds = new Set(costCheckItems.map(i => i.id))
  const uncatBought = orderedItems.filter(isUncategorised)
  const uncatCounted = uncatBought.filter(i => includedIds.has(i.id))
  const uncatNotCounted = uncatBought.filter(i => !includedIds.has(i.id) && !costCheckIds.has(i.id))

  function renderCategoryCard(cs: BudgetCategorySummary) {
    const c = cs.category
    const notes = [...orderedItems, ...labourItems].filter(i => i.budgetCategoryId === c.id)
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
                  if (window.confirm(`Remove "${c.name}"? Its spend moves to Uncategorised.`)) handleArchiveCategory(c.id)
                }}>Remove category</button>
              </div>
            )}
          </div>
        </div>
        <div className="budget-cat-figures">
          <div className="budget-figure"><dt>Spent</dt><dd>{cs.knownSpendLabel ?? 'None yet'}</dd></div>
          {cs.budgetLabel
            ? <div className={`budget-figure${cs.overBudget ? ' budget-figure--over' : ''}`}><dt>{cs.overBudget ? 'Over budget' : 'Remaining'}</dt><dd>{cs.remainingLabel}</dd></div>
            : <div className="budget-figure"><dt>Budget</dt><dd>No budget set</dd></div>}
        </div>
        {notes.length > 0
          ? <>
              <button type="button" className="notes-toggle" aria-expanded={open} onClick={() => toggleCat(c.id)}>
                <span>{open ? 'Hide notes' : `Show notes (${notes.length})`}</span>
                <span className="notes-toggle-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
              </button>
              {open && <div className="cat-notes">{notes.map(item => (
                <MemoryCard key={item.id} item={item} {...cardProps(item, false)} excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'cost_worth_checking')} />
              ))}</div>}
            </>
          : <p className="cat-empty">No notes in this category yet.</p>}
      </section>
    )
  }

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Spend">
      {hasSpendContent && totalKnownCost && <KnownSpendHero total={totalKnownCost} totals={budgetSummary?.totals ?? null} />}

      {costCheckItems.length > 0 && (
        <section className="cost-check" aria-label="Needs cost check">
          <p className="cost-check-title">Needs cost check</p>
          <p className="cost-check-sub">Not counted yet — is the amount for each item, or the whole lot?</p>
          {costCheckItems.map(item => {
            const p = cardProps(item, budgetCategories.length > 0)
            return (
              <CostCheckItem
                key={item.id}
                item={item}
                editing={p.isEditing}
                submitting={p.submitting}
                errorMsg={p.errorMsg}
                categories={budgetCategories}
                onTotal={() => resolveCostBasis(item.id, 'total')}
                onEach={() => resolveCostBasis(item.id, 'each')}
                onStartEdit={p.onStartEdit}
                onCancelEdit={p.onCancelEdit}
                onSave={p.onSave}
              />
            )
          })}
        </section>
      )}

      <DirectAddForm kind="spend" label="Add spend" sectionLabel="Spend" categories={budgetCategories} onAdd={addMemoryItem} />

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {!hasSpendContent ? (
        <p className="mem-tab-empty">Nothing bought or labour remembered yet.</p>
      ) : (
        <>
      <section aria-label="Budget categories">
        <p className="mem-section-label">By category</p>
        {budgetSummary?.categories.map(renderCategoryCard)}
        {budgetError && <p className="queue-item-error" role="alert">{budgetError}</p>}
        {addingCategory
          ? <CategoryForm initialName="" initialAmount="" submitting={savingNewCategory} onSave={handleAddCategory} onCancel={() => setAddingCategory(false)} />
          : <button type="button" className="btn-add-category" onClick={() => setAddingCategory(true)}>+ Add budget category</button>}
      </section>

      {uncatCounted.length > 0 && (
        <section aria-label="Uncategorised bought">
          <p className="mem-section-label">Bought · uncategorised</p>
          <p className="mem-section-note">Counted in Known spend — give each a category to track it.</p>
          {uncatCounted.map(item => <MemoryCard key={item.id} item={item} {...cardProps(item, true)} />)}
        </section>
      )}

      {uncatNotCounted.length > 0 && (
        <section aria-label="Bought not in known spend">
          <p className="mem-section-label">Bought · not in Known spend yet</p>
          <p className="mem-section-note">Add a price (or confirm) to count these.</p>
          {uncatNotCounted.map(item => (
            <MemoryCard key={item.id} item={item} {...cardProps(item, true)} excludedReason={exclusionReason.get(item.id) ?? 'no_cost_remembered'} />
          ))}
        </section>
      )}
        </>
      )}
    </div>
  )
}
