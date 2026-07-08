import { useState } from 'react'
import MemoryCard from './MemoryCard'
import MemoryEditForm from './MemoryEditForm'
import DirectAddForm from './DirectAddForm'
import EmptyState from './EmptyState'
import { memoryItemToEdit } from './memoryEdit'
import { canDeriveUnitCost, formatMoney, formatTotalLabel, hasCostLikeAmount } from './memoryScan'
import type { JobMemory } from './useJobMemory'
import type { BudgetCategory, BudgetCategorySummary, BudgetSummaryResponse, MemoryViewItem, TotalKnownCost } from './types'

const POS_DECIMAL = /^\d+(\.\d+)?$/

// Compact, purpose-built price entry for a no-price bought item. Defaults to an
// explicit total (so the typed figure becomes totalCostAmount + GBP and enters
// known spend); offers a per-item basis only when quantity + unit are known.
function PriceForm({ item, submitting, error, onSave, onCancel }: {
  item: MemoryViewItem
  submitting: boolean
  error: string | null
  onSave: (price: string, basis: 'total' | 'each') => void
  onCancel: () => void
}) {
  const [price, setPrice] = useState('')
  const [basis, setBasis] = useState<'total' | 'each'>('total')
  const eachAvailable = canDeriveUnitCost(item)
  const priceOk = POS_DECIMAL.test(price.trim()) && parseFloat(price) > 0
  const derived = basis === 'each' && eachAvailable && priceOk
    ? String(Math.round(parseFloat(item.quantity!) * parseFloat(price) * 100) / 100)
    : null
  return (
    <form className="price-form queue-edit-form" aria-label="Add price" onSubmit={e => { e.preventDefault(); if (priceOk) onSave(price.trim(), basis) }}>
      <label className="queue-field">
        <span className="queue-field-label">Price (£)</span>
        <input className="queue-field-input" name="price" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 120" autoFocus />
      </label>
      {eachAvailable && (
        <label className="queue-field">
          <span className="queue-field-label">This price is</span>
          <select className="queue-field-input" name="priceBasis" aria-label="Price basis" value={basis} onChange={e => setBasis(e.target.value as 'total' | 'each')}>
            <option value="total">the total</option>
            <option value="each">per {item.unit}</option>
          </select>
        </label>
      )}
      {derived && (
        <p className="cost-preview">{item.quantity} × {formatMoney(Number(price), 'GBP')} each = <strong>{formatMoney(Number(derived), 'GBP')} total</strong></p>
      )}
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || !priceOk}>{submitting ? 'Saving…' : 'Save price'}</button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
      {error && <p className="queue-item-error" role="alert">{error}</p>}
    </form>
  )
}

// One row in the "Not counted yet" area. Two treatments share one place:
//  - cost-basis: has a price but an unclear basis → ask each vs total.
//  - no-price:   no amount to classify → add a price (defaults to a total).
function NotCountedItem({
  item,
  mode,
  editing,
  submitting,
  errorMsg,
  categories,
  onTotal,
  onEach,
  onAddPrice,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  item: MemoryViewItem
  mode: 'cost-basis' | 'no-price'
  editing: boolean
  submitting: boolean
  errorMsg: string | null
  categories: BudgetCategory[]
  onTotal: () => void
  onEach: () => void
  onAddPrice: (price: string, basis: 'total' | 'each') => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: import('./types').MemoryItemEdit) => void
}) {
  const [addingPrice, setAddingPrice] = useState(false)

  if (editing) {
    return (
      <div className="cost-check-item cost-check-item--editing">
        <MemoryEditForm initial={memoryItemToEdit(item)} submitting={submitting} categories={categories} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }
  const identity = [item.quantity, item.materialName, item.unit].filter(Boolean).join(' ') || item.materialName || item.summary

  if (mode === 'no-price') {
    if (addingPrice) {
      return (
        <div className="cost-check-item cost-check-item--editing">
          <p className="cost-check-headline">{identity}</p>
          <PriceForm item={item} submitting={submitting} error={errorMsg} onSave={onAddPrice} onCancel={() => setAddingPrice(false)} />
        </div>
      )
    }
    return (
      <div className="cost-check-item">
        <p className="cost-check-headline">{identity}</p>
        <p className="cost-check-q">No price yet</p>
        <div className="cost-check-actions">
          <button type="button" className="btn-cost-total" disabled={submitting} onClick={() => setAddingPrice(true)}>Add price</button>
          <button type="button" className="btn-cost-fix" disabled={submitting} onClick={onStartEdit}>Fix memory</button>
        </div>
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  const amount = formatTotalLabel(item.costAmount, item.costCurrency || 'GBP') ?? ''
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
    sectionItems, includedIds, exclusionReason, cardProps,
    notCountedItems, resolveCostBasis, addPrice,
    budgetCategories, expandedCats, toggleCat, labourSpendGroup,
    editingBudgetId, setEditingBudgetId, savingCatId,
    addingCategory, setAddingCategory, savingNewCategory, budgetError,
    openMenuCatId, setOpenMenuCatId,
    handleAddCategory, handleEditBudget, handleArchiveCategory,
  } = mem

  const orderedItems = sectionItems('ordered_materials')
  const labourItems = sectionItems('labour')
  const hasSpendContent = orderedItems.length > 0 || labourItems.length > 0 || budgetCategories.length > 0

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
  const allItemsById = new Map([...orderedItems, ...labourItems].map(i => [i.id, i] as const))
  const uncatItems = (budgetSummary?.uncategorized.rows ?? [])
    .filter(r => !labourRowIds.has(r.memoryItemId))
    .map(r => allItemsById.get(r.memoryItemId))
    .filter((i): i is MemoryViewItem => !!i)

  const labourGroupItems = (labourSpendGroup?.rows ?? [])
    .map(r => allItemsById.get(r.memoryItemId))
    .filter((i): i is MemoryViewItem => !!i)

  function renderCategoryCard(cs: BudgetCategorySummary) {
    const c = cs.category
    // The Labour budget category is presented by the Labour group instead of a
    // second, duplicate category card.
    if (showLabourGroup && labourSpendGroup?.budgetCategory?.id === c.id) return null
    const notes = [...orderedItems, ...labourItems].filter(i => i.budgetCategoryId === c.id && !labourRowIds.has(i.id))
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
        {notes.length === 0 && (
          <p className="cat-empty">No spend in this category yet — add it straight to {c.name}.</p>
        )}
        {/* Category-context add: opens the spend sheet with this category
            preselected (changeable/clearable in the form's category select). */}
        <div className="budget-cat-foot">
          {notes.length > 0 && (
            <button type="button" className="notes-toggle" aria-expanded={open} onClick={() => toggleCat(c.id)}>
              <span>{open ? 'Hide notes' : `Show notes (${notes.length})`}</span>
              <span className="notes-toggle-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
            </button>
          )}
          <DirectAddForm
            kind="spend"
            variant="button"
            buttonLabel={`Add to ${c.name}`}
            label="Add spend"
            title={`Add spend — ${c.name}`}
            initialCategoryId={c.id}
            categories={budgetCategories}
            onAdd={addMemoryItem}
          />
        </div>
        {notes.length > 0 && open && <div className="cat-notes">{notes.map(item => (
          <MemoryCard key={item.id} item={item} {...cardProps(item, false)} excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'cost_worth_checking')} />
        ))}</div>}
      </section>
    )
  }

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Spend">
      {hasSpendContent && totalKnownCost && <KnownSpendHero total={totalKnownCost} totals={budgetSummary?.totals ?? null} />}

      {notCountedItems.length > 0 && (
        <section className="cost-check" aria-label="Not counted yet">
          <p className="cost-check-title">Not counted yet</p>
          <p className="cost-check-sub">These bought items aren’t in your known spend — add a price, or confirm each vs total.</p>
          {notCountedItems.map(item => {
            const p = cardProps(item, budgetCategories.length > 0)
            const costBasis = exclusionReason.get(item.id) === 'cost_worth_checking' && hasCostLikeAmount(item)
            return (
              <NotCountedItem
                key={item.id}
                item={item}
                mode={costBasis ? 'cost-basis' : 'no-price'}
                editing={p.isEditing}
                submitting={p.submitting}
                errorMsg={p.errorMsg}
                categories={budgetCategories}
                onTotal={() => resolveCostBasis(item.id, 'total')}
                onEach={() => resolveCostBasis(item.id, 'each')}
                onAddPrice={(price, basis) => addPrice(item.id, price, basis)}
                onStartEdit={p.onStartEdit}
                onCancelEdit={p.onCancelEdit}
                onSave={p.onSave}
              />
            )
          })}
        </section>
      )}

      <DirectAddForm kind="spend" label="Add spend" sectionLabel="Spend" categories={budgetCategories} onAdd={addMemoryItem} actionHidden={!hasSpendContent} />

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {!hasSpendContent ? (
        <EmptyState
          title="Nothing spent yet"
          hint="Add what you’ve bought for this job, or say it with Record and it’ll be picked up for you."
          action={<DirectAddForm kind="spend" variant="button" label="Add spend" categories={budgetCategories} onAdd={addMemoryItem} />}
        />
      ) : (
        <>
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
          <section className="budget-cat budget-cat--labour" aria-label="Labour spend">
            <div className="budget-cat-head">
              <h3 className="budget-cat-name">Labour</h3>
              {labourSpendGroup.budgetCategory && (
                <div className="budget-cat-menu-wrap">
                  <button
                    type="button"
                    className="btn-cat-menu"
                    aria-label="Actions for Labour"
                    aria-haspopup="menu"
                    aria-expanded={openMenuCatId === labourSpendGroup.budgetCategory.id}
                    onClick={() => setOpenMenuCatId(openMenuCatId === labourSpendGroup.budgetCategory!.id ? null : labourSpendGroup.budgetCategory!.id)}
                  >⋯</button>
                  {openMenuCatId === labourSpendGroup.budgetCategory.id && (
                    <div className="budget-cat-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setOpenMenuCatId(null); setEditingBudgetId(labourSpendGroup.budgetCategory!.id) }}>Edit budget</button>
                      <button type="button" role="menuitem" className="budget-cat-menu-danger" disabled={savingCatId === labourSpendGroup.budgetCategory.id} onClick={() => {
                        setOpenMenuCatId(null)
                        if (window.confirm('Remove the labour budget? Labour cost still shows here.')) handleArchiveCategory(labourSpendGroup.budgetCategory!.id)
                      }}>Remove budget</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="budget-cat-figures">
              <div className="budget-figure"><dt>Spent</dt><dd>{labourSpendGroup.knownSpendLabel ?? 'None yet'}</dd></div>
              {labourSpendGroup.budgetLabel
                ? <div className={`budget-figure${labourSpendGroup.overBudget ? ' budget-figure--over' : ''}`}><dt>{labourSpendGroup.overBudget ? 'Over budget' : 'Remaining'}</dt><dd>{labourSpendGroup.remainingLabel}</dd></div>
                : <div className="budget-figure"><dt>Budget</dt><dd>No budget set</dd></div>}
            </div>
            {labourGroupItems.length > 0
              ? <>
                  <button type="button" className="notes-toggle" aria-expanded={!!expandedCats[LABOUR_GROUP_KEY]} onClick={() => toggleCat(LABOUR_GROUP_KEY)}>
                    <span>{expandedCats[LABOUR_GROUP_KEY] ? 'Hide notes' : `Show notes (${labourGroupItems.length})`}</span>
                    <span className="notes-toggle-chev" aria-hidden="true">{expandedCats[LABOUR_GROUP_KEY] ? '▴' : '▾'}</span>
                  </button>
                  {expandedCats[LABOUR_GROUP_KEY] && <div className="cat-notes">{labourGroupItems.map(item => (
                    <MemoryCard key={item.id} item={item} {...cardProps(item, false)} />
                  ))}</div>}
                </>
              : <p className="cat-empty">No labour cost yet — hours are remembered on the Labour tab.</p>}
          </section>
        )
      )}

      <section aria-label="Budget categories">
        <p className="mem-section-label">By category</p>
        {budgetSummary?.categories.map(renderCategoryCard)}
        {budgetError && <p className="queue-item-error" role="alert">{budgetError}</p>}
        {addingCategory
          ? <CategoryForm initialName="" initialAmount="" submitting={savingNewCategory} onSave={handleAddCategory} onCancel={() => setAddingCategory(false)} />
          : <button type="button" className="btn-add-category" onClick={() => setAddingCategory(true)}>+ Add budget category</button>}
      </section>

      {uncatItems.length > 0 && (
        <section aria-label="Uncategorised spend">
          <p className="mem-section-label">Uncategorised spend</p>
          <p className="mem-section-note">Counted in Known spend — give each a category to track it.</p>
          {uncatItems.map(item => <MemoryCard key={item.id} item={item} {...cardProps(item, true)} />)}
        </section>
      )}
        </>
      )}
    </div>
  )
}
