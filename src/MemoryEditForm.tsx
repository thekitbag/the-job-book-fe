import { useState } from 'react'
import { deriveEachTotal, deriveHourlyTotal, eachTotalGaps, hourlyTotalGaps, joinWithAnd, formatMoney } from './memoryScan'
import type { BudgetCategory, CostQualifier, MemoryItemEdit, MemoryType } from './types'

const MEMORY_TYPE_OPTIONS: { value: MemoryType; label: string }[] = [
  { value: 'used_material', label: 'Used material' },
  { value: 'ordered_material', label: 'Ordered material' },
  { value: 'leftover_material', label: 'Leftover material' },
  { value: 'labour', label: 'Labour' },
  { value: 'general_note', label: 'Note' },
  { value: 'supplier_delivery_note', label: 'Supplier / delivery note' },
  { value: 'customer_change', label: 'Customer change' },
  { value: 'watch_out', label: 'Watch out' },
]

const COST_QUALIFIER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— not stated —' },
  { value: 'each', label: 'Each (per item)' },
  { value: 'per_hour', label: 'Per hour' },
  { value: 'total', label: 'Total' },
  { value: 'approx', label: 'Approximate' },
  { value: 'unknown', label: 'Not clear' },
]

const CATEGORY_TYPES = new Set<MemoryType>(['ordered_material', 'labour'])

/**
 * Shared structured edit form for trusted memory ("Fix memory").
 * Used by both Job memory and the Already-remembered cards in Things to check.
 * Edits trusted memory in place — it never creates a queue item or draft fact.
 */
export default function MemoryEditForm({
  initial,
  submitting,
  categories = [],
  onSubmit,
  onCancel,
}: {
  initial: MemoryItemEdit
  submitting: boolean
  // Active budget categories; when empty (or item not bought/ordered) no category
  // control is shown. Category applies only to ordered_material memory.
  categories?: BudgetCategory[]
  onSubmit: (edit: MemoryItemEdit) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<MemoryItemEdit>(initial)
  const setStr = (k: Exclude<keyof MemoryItemEdit, 'memoryType' | 'costQualifier'>, v: string) =>
    setForm(f => ({ ...f, [k]: v || null }))
  // Changing memory type away from a category-bearing type clears the category.
  const setType = (v: MemoryType) =>
    setForm(f => ({ ...f, memoryType: v, budgetCategoryId: CATEGORY_TYPES.has(v) ? (f.budgetCategoryId ?? null) : null }))

  const isLabour = form.memoryType === 'labour'
  // A plain note is edited as free text (its summary) — no material/cost fields.
  const isNote = form.memoryType === 'general_note'
  // A clear `each` material line or `per_hour` labour line: the total is derived
  // (quantity × unit cost, or hours × rate) on save, so we omit totalCostAmount
  // (backend recalculates) and preview it instead of an explicit total field.
  const eachRecalc = !isNote && (isLabour ? form.costQualifier === 'per_hour' : form.costQualifier === 'each')
  const derivedTotal = eachRecalc
    ? (isLabour
        ? deriveHourlyTotal({ labourHours: form.labourHours, costAmount: form.costAmount, costQualifier: form.costQualifier })
        : deriveEachTotal({ quantity: form.quantity, unit: form.unit, costAmount: form.costAmount, costQualifier: 'each' }))
    : null
  // For any other basis (`total`, `approx`, `unknown`, not stated) there is a
  // single cost figure — no separate unit-cost-vs-total split to show.
  const isTotalBasis = !isNote && !eachRecalc && form.costQualifier === 'total'
  // `each`/`per_hour` claim a computable total, but without quantity+unit+cost
  // (or hours+rate) there is nothing to derive it from — block save rather than
  // silently dropping the total and leaving the item stuck worth-checking.
  const eachGaps = eachRecalc
    ? (isLabour
        ? hourlyTotalGaps({ labourHours: form.labourHours, costAmount: form.costAmount })
        : eachTotalGaps({ quantity: form.quantity, unit: form.unit, costAmount: form.costAmount }))
    : []
  const eachRecalcBlocked = eachRecalc && eachGaps.length > 0
  // Pilot is GBP, but preserve any non-GBP currency already on the item.
  const currencyCue = form.costCurrency && form.costCurrency !== 'GBP' ? `(${form.costCurrency})` : '(£)'
  const showCategory = CATEGORY_TYPES.has(form.memoryType) && categories.length > 0

  // When a cost is entered on an item with no currency yet, default it to GBP so
  // the figure can count towards Known spend. Never clobber an existing currency.
  const handleSubmit = () => {
    const hasCost = !!(form.costAmount || form.totalCostAmount)
    const costCurrency = form.costCurrency || (hasCost ? 'GBP' : null)
    const budgetCategoryId = CATEGORY_TYPES.has(form.memoryType) ? (form.budgetCategoryId ?? null) : null
    const payload: MemoryItemEdit = {
      ...form,
      costCurrency,
      budgetCategoryId,
      // Keep labour fields only for labour; material fields only for non-labour.
      labourHours: isLabour ? (form.labourHours ?? null) : null,
      labourPerson: isLabour ? (form.labourPerson ?? null) : null,
      labourTask: isLabour ? (form.labourTask ?? null) : null,
      materialName: isLabour ? null : form.materialName,
      quantity: isLabour ? null : form.quantity,
      unit: isLabour ? null : form.unit,
      supplierName: isLabour ? null : form.supplierName,
      deliveryTiming: isLabour ? null : form.deliveryTiming,
      locationOrUse: isLabour ? null : form.locationOrUse,
    }
    // `each`/`per_hour` → omit the total so the backend derives it (sending null
    // would clear it). `total` → there is one field on screen, so mirror it into
    // the explicit total. Anything else (`approx`/`unknown`/not stated) has no
    // trusted total to send — omit rather than push a stale value.
    if (!isNote) {
      if (eachRecalc) delete payload.totalCostAmount
      else if (isTotalBasis) payload.totalCostAmount = payload.costAmount
      else delete payload.totalCostAmount
    }
    onSubmit(payload)
  }

  return (
    <form
      className="queue-edit-form"
      aria-label="Edit memory"
      onSubmit={e => { e.preventDefault(); handleSubmit() }}
    >
      <label className="queue-field">
        <span className="queue-field-label">Type</span>
        <select
          className="queue-field-input"
          value={form.memoryType}
          onChange={e => setType(e.target.value as MemoryType)}
        >
          {MEMORY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {showCategory && (
        <label className="queue-field">
          <span className="queue-field-label">Budget category</span>
          <select
            className="queue-field-input"
            name="budgetCategoryId"
            aria-label="Budget category"
            value={form.budgetCategoryId ?? ''}
            onChange={e => setForm(f => ({ ...f, budgetCategoryId: e.target.value || null }))}
          >
            <option value="">Choose category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {isNote ? (
        <label className="queue-field">
          <span className="queue-field-label">Note</span>
          <textarea
            className="queue-field-input direct-add-note"
            name="summary"
            value={form.summary ?? ''}
            rows={3}
            onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
          />
        </label>
      ) : isLabour ? (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Hours</span>
            <input className="queue-field-input" name="labourHours" value={form.labourHours ?? ''} inputMode="decimal" onChange={e => setStr('labourHours', e.target.value)} placeholder="e.g. 8" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Person / role</span>
            <input className="queue-field-input" name="labourPerson" value={form.labourPerson ?? ''} onChange={e => setStr('labourPerson', e.target.value)} placeholder="e.g. Tom" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Task / work area</span>
            <input className="queue-field-input" name="labourTask" value={form.labourTask ?? ''} onChange={e => setStr('labourTask', e.target.value)} placeholder="e.g. electrics" />
          </label>
        </>
      ) : (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Material</span>
            <input className="queue-field-input" name="materialName" value={form.materialName ?? ''} onChange={e => setStr('materialName', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Quantity</span>
            <input className="queue-field-input" name="quantity" value={form.quantity ?? ''} onChange={e => setStr('quantity', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Unit</span>
            <input className="queue-field-input" name="unit" value={form.unit ?? ''} onChange={e => setStr('unit', e.target.value)} placeholder="e.g. sheets, bags, m²" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Supplier</span>
            <input className="queue-field-input" name="supplierName" value={form.supplierName ?? ''} onChange={e => setStr('supplierName', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Delivery timing</span>
            <input className="queue-field-input" name="deliveryTiming" value={form.deliveryTiming ?? ''} onChange={e => setStr('deliveryTiming', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Location / use</span>
            <input className="queue-field-input" name="locationOrUse" value={form.locationOrUse ?? ''} onChange={e => setStr('locationOrUse', e.target.value)} />
          </label>
        </>
      )}
      {!isNote && (
        <>
          {/* One cost figure on screen at a time: an editable rate/cost amount
              plus a derived preview for `each`/`per_hour`, or a single editable
              total for any other basis. Switching the qualifier swaps which one
              is shown rather than adding a second field alongside it. */}
          <label className="queue-field">
            <span className="queue-field-label">
              {eachRecalc ? (isLabour ? 'Rate per hour' : 'Unit cost') : (isTotalBasis ? 'Total cost' : 'Cost amount')} {currencyCue}
            </span>
            <input className="queue-field-input" name="costAmount" value={form.costAmount ?? ''} onChange={e => setStr('costAmount', e.target.value)} placeholder="e.g. 5.00" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Cost qualifier</span>
            <select
              className="queue-field-input"
              aria-label="Cost qualifier"
              value={form.costQualifier ?? ''}
              onChange={e => setForm(f => ({ ...f, costQualifier: (e.target.value as CostQualifier) || null }))}
            >
              {COST_QUALIFIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {eachRecalc && (
            derivedTotal ? (
              <p className="cost-preview" role="status">
                {isLabour
                  ? <>{form.labourHours} hours × {formatMoney(Number(form.costAmount), 'GBP')}/hour = <strong>{formatMoney(Number(derivedTotal), 'GBP')} total</strong></>
                  : <>{form.quantity} × {formatMoney(Number(form.costAmount), 'GBP')} each = <strong>{formatMoney(Number(derivedTotal), 'GBP')} total</strong></>}
              </p>
            ) : (
              <p className="cost-preview cost-preview--warning" role="alert">
                Add {joinWithAnd(eachGaps)} above to calculate a total — until then this stays worth checking.
              </p>
            )
          )}
        </>
      )}
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || eachRecalcBlocked}>
          {submitting ? 'Saving…' : 'Save memory'}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}
