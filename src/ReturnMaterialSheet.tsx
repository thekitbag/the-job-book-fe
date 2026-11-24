import { useState } from 'react'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import { ApiError } from './api'
import { useToast } from './Toast'
import type { MemoryViewItem, ReturnMaterialRequest } from './types'

const POS_DECIMAL = /^\d+(\.\d+)?$/
const isPositive = (s: string) => POS_DECIMAL.test(s.trim()) && parseFloat(s) > 0

function todayISODate(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// What Mike is returning, in his words: "6 fence posts".
function itemIdentity(item: MemoryViewItem): string {
  const qtyUnit = [item.quantity, item.unit].filter(Boolean).join(' ')
  return [qtyUnit, item.materialName].filter(Boolean).join(' ').trim() ||
    item.materialName?.trim() || item.summary
}

function ReturnFields({ item, submitting, error, onSubmit, onCancel }: {
  item: MemoryViewItem
  submitting: boolean
  error: string | null
  onSubmit: (req: ReturnMaterialRequest) => void
  onCancel: () => void
}) {
  // Quantity defaults to the whole leftover — taking the lot back is the common
  // case, and a partial return is one edit away.
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [supplier, setSupplier] = useState(item.supplierName ?? '')
  const [returnedDate, setReturnedDate] = useState(todayISODate())

  const canSave = isPositive(quantity)

  function build(): ReturnMaterialRequest {
    return {
      quantity: quantity.trim(),
      unit: item.unit,
      supplierName: supplier.trim() || null,
      happenedAt: `${returnedDate}T12:00:00`,
    }
  }

  return (
    <form
      className="direct-add-form queue-edit-form"
      aria-label="Mark as returned"
      onSubmit={e => { e.preventDefault(); if (canSave) onSubmit(build()) }}
    >
      <p className="return-form-identity">{itemIdentity(item)} left over</p>
      <label className="queue-field">
        <span className="queue-field-label">How many did you take back?</span>
        <input className="queue-field-input" name="quantity" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 4" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Took them back to (optional)</span>
        <input className="queue-field-input" name="supplierName" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Jewson" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Date returned</span>
        <input className="queue-field-input" type="date" name="happenedAt" value={returnedDate} onChange={e => setReturnedDate(e.target.value)} />
      </label>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || !canSave}>
          {submitting ? 'Saving…' : 'Save return'}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
      {error && <p className="queue-item-error" role="alert">{error}</p>}
    </form>
  )
}

/**
 * "Mark as returned" on a Left over item: the trigger plus its bottom sheet.
 *
 * Returning is deliberately not deletion — the material was really bought, so
 * the return is recorded as a job event and the original purchase stays in the
 * record. Quantity is never subtracted locally: the sheet stays open with
 * Mike's values until the backend has accepted, so a refused return (e.g. more
 * than is left over) can't leave the screen showing a move that didn't happen.
 */
export default function ReturnMaterialSheet({ item, onReturn, controlledOpen, onOpenChange }: {
  item: MemoryViewItem
  onReturn: (req: ReturnMaterialRequest) => Promise<unknown>
  // Controlled mode: the row's actions sheet owns the open state and renders no
  // trigger of its own, so "Mark as returned" is one row in one sheet rather
  // than a competing button on the item.
  controlledOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const controlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setUncontrolledOpen(v))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const submit = async (req: ReturnMaterialRequest) => {
    setSubmitting(true)
    setError(null)
    try {
      await onReturn(req)
      toast({ title: 'Marked returned', body: 'The returned material is saved.' })
      setOpen(false)
    } catch (err: unknown) {
      // A 400 here is nearly always over-returning, but the copy asks him to
      // check rather than asserting a cause the server didn't actually name.
      setError(err instanceof ApiError && err.status === 400
        ? 'Could not save — check you’re not returning more than is left over.'
        : 'Could not save the return — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const close = () => { setOpen(false); setError(null) }

  return (
    <div className="lens-add-inline">
      {!controlled && (
        <button
          type="button"
          className="btn-mem-return"
          aria-expanded={open}
          onClick={() => { setError(null); setOpen(true); track('material_return_opened', { memory_item_id: item.id }) }}
        >
          Mark as returned
        </button>
      )}
      {open && (
        <BottomSheet title="Mark as returned" onClose={close}>
          <ReturnFields item={item} submitting={submitting} error={error} onSubmit={submit} onCancel={close} />
        </BottomSheet>
      )}
    </div>
  )
}
