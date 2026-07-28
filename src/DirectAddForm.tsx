import { useEffect, useState } from 'react'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import { deriveEachTotal, formatMoney } from './memoryScan'
import type { BudgetCategory, CreateMemoryItemRequest, MemoryType } from './types'

// 'spend' = a bought/ordered material (Materials → Bought). 'cost' = a general
// Budget cost (labour cost, plant, hire, subcontractor, or anything else) —
// Budget owns all cost. See labour-hours-budget-costs-paid-undo spec.
export type DirectAddKind = 'spend' | 'cost' | 'used' | 'leftover' | 'note'

const NOTE_TYPE_OPTIONS: { value: MemoryType; label: string }[] = [
  { value: 'general_note', label: 'Plain note' },
  { value: 'supplier_delivery_note', label: 'Delivery / supplier note' },
  { value: 'customer_change', label: 'Customer change' },
  { value: 'watch_out', label: 'Watch-out' },
]

const POS_DECIMAL = /^\d+(\.\d+)?$/

// Section-specific fields for one direct-add flow. Field state lives here so a
// failed save preserves the entered values (the form stays mounted) and a
// successful save starts fresh (the parent unmounts it).
function DirectAddFields({
  kind,
  categories,
  initialCategoryId,
  submitting,
  error,
  saveLabel,
  onSubmit,
  onCancel,
}: {
  kind: DirectAddKind
  categories: BudgetCategory[]
  // Category context inherited from the launching card (Budget category add).
  // Preselected but changeable/clearable through the normal category select.
  initialCategoryId?: string
  submitting: boolean
  error: string | null
  saveLabel: string
  onSubmit: (req: CreateMemoryItemRequest) => void
  onCancel: () => void
}) {
  const [item, setItem] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costBasis, setCostBasis] = useState<'total' | 'each'>('total')
  const [supplier, setSupplier] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? '')
  const [locationOrUse, setLocationOrUse] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState<MemoryType>('general_note')
  // Budget cost only: record the cost as already paid (adds Money out).
  const [alreadyPaid, setAlreadyPaid] = useState(false)

  const isMaterialUse = kind === 'used' || kind === 'leftover'
  // User-facing form name. 'spend' is a bought material; 'cost' is a Budget cost.
  const label =
    kind === 'spend' ? 'Add bought item' :
    kind === 'cost' ? 'Add cost' :
    kind === 'used' ? 'Add used item' :
    kind === 'leftover' ? 'Add leftover' : 'Add note'

  const costOk = POS_DECIMAL.test(costAmount.trim()) && parseFloat(costAmount) > 0
  const canSave =
    kind === 'spend' ? item.trim() !== '' :
    kind === 'cost' ? item.trim() !== '' && costOk :
    isMaterialUse ? item.trim() !== '' :
    noteText.trim() !== ''

  // Live derived-total preview for a clear `each` spend line (display only).
  const spendPreviewTotal = kind === 'spend' && costBasis === 'each'
    ? deriveEachTotal({ quantity, unit, costAmount, costQualifier: 'each' })
    : null
  const canMarkBoughtPaid = kind === 'spend' && (
    costBasis === 'total'
      ? costOk
      : spendPreviewTotal !== null && parseFloat(spendPreviewTotal) > 0
  )

  useEffect(() => {
    if (kind === 'spend' && !canMarkBoughtPaid) setAlreadyPaid(false)
  }, [kind, canMarkBoughtPaid])

  function build(): CreateMemoryItemRequest {
    if (kind === 'spend') {
      const amount = costAmount.trim() || null
      const req: CreateMemoryItemRequest = {
        memoryType: 'ordered_material',
        materialName: item.trim() || null,
        quantity: quantity.trim() || null,
        unit: unit.trim() || null,
        supplierName: supplier.trim() || null,
        locationOrUse: locationOrUse.trim() || null,
        costAmount: amount,
        // 'total' → the amount is the trusted line total; 'each' → per-item cost.
        costQualifier: amount ? costBasis : null,
        costCurrency: amount ? 'GBP' : null,
        budgetCategoryId: categoryId || null,
        markPaid: alreadyPaid && canMarkBoughtPaid,
      }
      // Only send an explicit total for a `total` basis; for `each` omit the key
      // so the backend derives quantity × unit cost.
      if (amount && costBasis === 'total') req.totalCostAmount = amount
      return req
    }
    if (kind === 'cost') {
      const amount = costAmount.trim()
      // A general Budget cost: a trusted GBP total that counts in Budget. It is
      // neither a bought material nor an hours entry.
      return {
        memoryType: 'budget_cost',
        materialName: item.trim() || null,
        supplierName: supplier.trim() || null,
        locationOrUse: locationOrUse.trim() || null,
        costAmount: amount,
        costQualifier: 'total',
        costCurrency: 'GBP',
        totalCostAmount: amount,
        budgetCategoryId: categoryId || null,
        // FE-only signal consumed by the workspace add-cost wrapper (stripped
        // before the create call, which then records Money out separately).
        markPaid: alreadyPaid,
      }
    }
    if (isMaterialUse) {
      return {
        memoryType: kind === 'leftover' ? 'leftover_material' : 'used_material',
        materialName: item.trim() || null,
        quantity: quantity.trim() || null,
        unit: unit.trim() || null,
        locationOrUse: locationOrUse.trim() || null,
      }
    }
    return { memoryType: noteType, summary: noteText.trim() }
  }

  return (
    <form
      className="direct-add-form queue-edit-form"
      aria-label={label}
      onSubmit={e => { e.preventDefault(); if (canSave) onSubmit(build()) }}
    >
      {kind === 'spend' && (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Item</span>
            <input className="queue-field-input" name="materialName" value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. plasterboard" />
          </label>
          <div className="direct-add-row">
            <label className="queue-field">
              <span className="queue-field-label">Quantity</span>
              <input className="queue-field-input" name="quantity" value={quantity} inputMode="decimal" onChange={e => setQuantity(e.target.value)} placeholder="e.g. 12" />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Unit</span>
              <input className="queue-field-input" name="unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. sheets" />
            </label>
          </div>
          <div className="direct-add-row">
            <label className="queue-field">
              <span className="queue-field-label">Cost (£)</span>
              <input className="queue-field-input" name="costAmount" value={costAmount} inputMode="decimal" onChange={e => setCostAmount(e.target.value)} placeholder="e.g. 40" />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Cost is</span>
              <select className="queue-field-input" name="costBasis" aria-label="Cost basis" value={costBasis} onChange={e => setCostBasis(e.target.value as 'total' | 'each')}>
                <option value="total">a total</option>
                <option value="each">per item</option>
              </select>
            </label>
          </div>
          {spendPreviewTotal && (
            <p className="cost-preview" role="status">
              {quantity} × {formatMoney(Number(costAmount), 'GBP')} each = <strong>{formatMoney(Number(spendPreviewTotal), 'GBP')} total</strong>
            </p>
          )}
          <label className="queue-field">
            <span className="queue-field-label">Supplier (optional)</span>
            <input className="queue-field-input" name="supplierName" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Jewson" />
          </label>
          {categories.length > 0 && (
            <label className="queue-field">
              <span className="queue-field-label">Budget category (optional)</span>
              <select className="queue-field-input" name="budgetCategoryId" aria-label="Budget category" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="queue-field">
            <span className="queue-field-label">Note (optional)</span>
            <input className="queue-field-input" name="locationOrUse" value={locationOrUse} onChange={e => setLocationOrUse(e.target.value)} placeholder="e.g. for the back wall" />
          </label>
          {canMarkBoughtPaid && (
            <label className="direct-add-paid">
              <input type="checkbox" name="alreadyPaid" aria-label="Already paid" checked={alreadyPaid} onChange={e => setAlreadyPaid(e.target.checked)} />
              <span className="direct-add-paid-text">
                <span className="direct-add-paid-title">Already paid</span>
                <span className="direct-add-paid-sub">Also records it in Money out</span>
              </span>
            </label>
          )}
        </>
      )}

      {kind === 'cost' && (
        <>
          <label className="queue-field">
            <span className="queue-field-label">What was it for</span>
            <input className="queue-field-input" name="materialName" value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Kurt — cladding, plant hire" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Cost (£)</span>
            <input className="queue-field-input" name="costAmount" value={costAmount} inputMode="decimal" onChange={e => setCostAmount(e.target.value)} placeholder="e.g. 120" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Supplier / who (optional)</span>
            <input className="queue-field-input" name="supplierName" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Kurt, HSS Hire" />
          </label>
          {categories.length > 0 && (
            <label className="queue-field">
              <span className="queue-field-label">Budget category (optional)</span>
              <select className="queue-field-input" name="budgetCategoryId" aria-label="Budget category" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {/* Already paid → records Money out too. Budget still counts the cost;
              the two are separate (Budget = commitment, Money = movement). */}
          <label className="direct-add-paid">
            <input type="checkbox" name="alreadyPaid" aria-label="Already paid" checked={alreadyPaid} disabled={!costOk} onChange={e => setAlreadyPaid(e.target.checked)} />
            <span className="direct-add-paid-text">
              <span className="direct-add-paid-title">Already paid</span>
              <span className="direct-add-paid-sub">Also records it in Money out</span>
            </span>
          </label>
        </>
      )}

      {isMaterialUse && (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Item</span>
            <input className="queue-field-input" name="materialName" value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. OSB" />
          </label>
          <div className="direct-add-row">
            <label className="queue-field">
              <span className="queue-field-label">Quantity</span>
              <input className="queue-field-input" name="quantity" value={quantity} inputMode="decimal" onChange={e => setQuantity(e.target.value)} placeholder="e.g. 6" />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Unit</span>
              <input className="queue-field-input" name="unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. boards" />
            </label>
          </div>
          <label className="queue-field">
            <span className="queue-field-label">Location / use (optional)</span>
            <input className="queue-field-input" name="locationOrUse" value={locationOrUse} onChange={e => setLocationOrUse(e.target.value)} placeholder="e.g. back wall" />
          </label>
        </>
      )}

      {kind === 'note' && (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Note</span>
            <textarea className="queue-field-input direct-add-note" name="summary" value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} placeholder="What do you want to remember?" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Type</span>
            <select className="queue-field-input" name="noteType" aria-label="Note type" value={noteType} onChange={e => setNoteType(e.target.value as MemoryType)}>
              {NOTE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </>
      )}

      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || !canSave}>
          {submitting ? 'Saving…' : saveLabel}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
      {error && <p className="queue-item-error" role="alert">{error}</p>}
    </form>
  )
}

// Self-contained direct-add widget (Manual Add V2): a trigger that opens the
// section-specific form in an in-context bottom sheet. Two trigger shapes:
//  - 'header' → the lens header (small-caps label + a clear text action,
//    e.g. "Add cost" — never a bare "+", which reads as leftover chrome);
//  - 'button' → an inline text action ("Add to Timber" on a category card,
//    "Add cost" in an empty state).
// All triggers carry accessible names that say what will be added.
// Direct add stays secondary to voice + the lens summary. Owns the sheet
// open/close and save/submitting/error lifecycle; a failed save keeps the
// sheet open with the entered values, and closing returns to the untouched
// section behind it.
export default function DirectAddForm({
  kind,
  label,
  sectionLabel,
  categories = [],
  onAdd,
  variant = 'header',
  buttonLabel,
  title,
  initialCategoryId,
  actionHidden = false,
}: {
  kind: DirectAddKind
  label: string       // accessible action name, e.g. "Add cost"
  sectionLabel?: string // small-caps header text, e.g. "By category" (header variant)
  categories?: BudgetCategory[]
  onAdd: (req: CreateMemoryItemRequest) => Promise<unknown>
  variant?: 'header' | 'button'
  buttonLabel?: string // visible text for the 'button' variant, e.g. "Add to Timber"
  title?: string       // sheet title; defaults to label (e.g. "Add cost — Timber")
  initialCategoryId?: string // category context from the launching card
  // Header variant only: render just the section label, no action — used when
  // the section is empty and its EmptyState carries the (same-named) add
  // action, so there is exactly one "Add …" button per section at a time.
  actionHidden?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (req: CreateMemoryItemRequest) => {
    setSubmitting(true)
    setError(null)
    try {
      await onAdd(req)
      setOpen(false)
    } catch {
      setError('Could not save — check the details and try again')
    } finally {
      setSubmitting(false)
    }
  }

  const close = () => { setOpen(false); setError(null) }

  return (
    <div className={variant === 'header' ? 'lens-add' : 'lens-add-inline'}>
      {variant === 'header' ? (
        <div className="lens-add-head">
          <span className="lens-add-label">{sectionLabel}</span>
          {!actionHidden && (
            <button
              type="button"
              className="btn-lens-add-text"
              aria-expanded={open}
              onClick={() => { setError(null); setOpen(true); track('manual_add_opened', { kind }) }}
            >
              {label}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="btn-add-inline"
          aria-expanded={open}
          onClick={() => { setError(null); setOpen(true); track('manual_add_opened', { kind }) }}
        >
          {buttonLabel ?? label}
        </button>
      )}
      {open && (
        <BottomSheet title={title ?? label} onClose={close} onRecordInstead={close}>
          <DirectAddFields
            kind={kind}
            categories={categories}
            initialCategoryId={initialCategoryId}
            submitting={submitting}
            error={error}
            saveLabel={label.replace(/^Add /, 'Save ')}
            onSubmit={submit}
            onCancel={close}
          />
        </BottomSheet>
      )}
    </div>
  )
}
