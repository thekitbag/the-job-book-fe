import { useState } from 'react'
import { deriveEachTotal, formatMoney } from './memoryScan'
import type { BudgetCategory, CreateMemoryItemRequest, MemoryType } from './types'

export type DirectAddKind = 'spend' | 'labour' | 'used' | 'leftover' | 'note'

const NOTE_TYPE_OPTIONS: { value: MemoryType; label: string }[] = [
  { value: 'general_note', label: 'Plain note' },
  { value: 'supplier_delivery_note', label: 'Delivery / supplier note' },
  { value: 'customer_change', label: 'Customer change' },
  { value: 'watch_out', label: 'Watch-out' },
]

function todayISODate(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Section-specific fields for one direct-add flow. Field state lives here so a
// failed save preserves the entered values (the form stays mounted) and a
// successful save starts fresh (the parent unmounts it).
function DirectAddFields({
  kind,
  categories,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  kind: DirectAddKind
  categories: BudgetCategory[]
  submitting: boolean
  error: string | null
  onSubmit: (req: CreateMemoryItemRequest) => void
  onCancel: () => void
}) {
  const [item, setItem] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costBasis, setCostBasis] = useState<'total' | 'each'>('total')
  const [supplier, setSupplier] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [locationOrUse, setLocationOrUse] = useState('')
  const [person, setPerson] = useState('')
  const [hours, setHours] = useState('')
  const [task, setTask] = useState('')
  const [rate, setRate] = useState('')
  const [happenedDate, setHappenedDate] = useState(todayISODate())
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState<MemoryType>('general_note')

  const isMaterialUse = kind === 'used' || kind === 'leftover'
  const label =
    kind === 'spend' ? 'Add spend' :
    kind === 'labour' ? 'Add labour' :
    kind === 'used' ? 'Add used item' :
    kind === 'leftover' ? 'Add leftover' : 'Add note'

  const canSave =
    kind === 'spend' ? item.trim() !== '' :
    kind === 'labour' ? hours.trim() !== '' :
    isMaterialUse ? item.trim() !== '' :
    noteText.trim() !== ''

  // Live derived-total preview for a clear `each` spend line (display only).
  const spendPreviewTotal = kind === 'spend' && costBasis === 'each'
    ? deriveEachTotal({ quantity, unit, costAmount, costQualifier: 'each' })
    : null

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
      }
      // Only send an explicit total for a `total` basis; for `each` omit the key
      // so the backend derives quantity × unit cost.
      if (amount && costBasis === 'total') req.totalCostAmount = amount
      return req
    }
    if (kind === 'labour') {
      const r = rate.trim() || null
      return {
        memoryType: 'labour',
        happenedAt: `${happenedDate}T12:00:00`,
        labourPerson: person.trim() || null,
        labourHours: hours.trim() || null,
        labourTask: task.trim() || null,
        costAmount: r,
        costQualifier: r ? 'per_hour' : null,
        costCurrency: r ? 'GBP' : null,
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
            <input className="queue-field-input" name="materialName" value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. plasterboard" autoFocus />
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
        </>
      )}

      {kind === 'labour' && (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Day</span>
            <input className="queue-field-input" type="date" name="happenedAt" value={happenedDate} onChange={e => setHappenedDate(e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Person / role</span>
            <input className="queue-field-input" name="labourPerson" value={person} onChange={e => setPerson(e.target.value)} placeholder="e.g. Tom" />
          </label>
          <div className="direct-add-row">
            <label className="queue-field">
              <span className="queue-field-label">Hours</span>
              <input className="queue-field-input" name="labourHours" value={hours} inputMode="decimal" onChange={e => setHours(e.target.value)} placeholder="e.g. 8" autoFocus />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Rate £/hr (optional)</span>
              <input className="queue-field-input" name="rate" value={rate} inputMode="decimal" onChange={e => setRate(e.target.value)} placeholder="e.g. 35" />
            </label>
          </div>
          <label className="queue-field">
            <span className="queue-field-label">Task (optional)</span>
            <input className="queue-field-input" name="labourTask" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. electrics" />
          </label>
        </>
      )}

      {isMaterialUse && (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Item</span>
            <input className="queue-field-input" name="materialName" value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. OSB" autoFocus />
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
            <textarea className="queue-field-input direct-add-note" name="summary" value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} placeholder="What do you want to remember?" autoFocus />
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
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
      {error && <p className="queue-item-error" role="alert">{error}</p>}
    </form>
  )
}

// Self-contained direct-add widget: a quiet section header (small label + a
// round "+" that expands the section-specific form). Direct add stays secondary
// to voice + the lens summary. Owns the save/submitting/error lifecycle.
export default function DirectAddForm({
  kind,
  label,
  sectionLabel,
  categories = [],
  onAdd,
}: {
  kind: DirectAddKind
  label: string       // accessible action name, e.g. "Add spend"
  sectionLabel: string // small-caps header text, e.g. "Spend"
  categories?: BudgetCategory[]
  onAdd: (req: CreateMemoryItemRequest) => Promise<unknown>
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

  return (
    <div className="lens-add">
      <div className="lens-add-head">
        <span className="lens-add-label">{sectionLabel}</span>
        <button
          type="button"
          className={`btn-lens-add${open ? ' btn-lens-add--open' : ''}`}
          aria-label={open ? `Close ${label.toLowerCase()}` : label}
          aria-expanded={open}
          onClick={() => { setError(null); setOpen(o => !o) }}
        >
          {open ? '×' : '+'}
        </button>
      </div>
      {open && (
        <div className="direct-add">
          <DirectAddFields
            kind={kind}
            categories={categories}
            submitting={submitting}
            error={error}
            onSubmit={submit}
            onCancel={() => { setOpen(false); setError(null) }}
          />
        </div>
      )}
    </div>
  )
}
