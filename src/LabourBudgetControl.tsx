import { useState } from 'react'
import type { BudgetCategory } from './types'

// Set/edit the Labour budget from the user-facing Labour concept. Mike never
// needs to know whether Labour is backed by a manual category or the system
// grouping: with no Labour category, saving creates one named "Labour" behind
// the scenes; with one, saving edits its budget. Amount-only — the name is
// not Mike's problem here.
export default function LabourBudgetControl({ budgetCategory, onSave, error, autoOpen = false, onClose }: {
  budgetCategory: BudgetCategory | null
  // Resolves true on success (the caller refetches the authoritative summary).
  onSave: (amount: string, existing: BudgetCategory | null) => Promise<boolean>
  error?: string
  // Opens straight into the form instead of showing an inline trigger
  // button — used when a parent's own "⋯" menu is the entry point (Spend
  // tab's Labour group, so the affordance stays "⋯" regardless of whether a
  // budget exists yet). The parent unmounts this component to close it.
  autoOpen?: boolean
  onClose?: () => void
}) {
  const [open, setOpen] = useState(autoOpen)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const hasBudget = !!budgetCategory?.budgetAmount

  const start = () => {
    setAmount(budgetCategory?.budgetAmount ?? '')
    setOpen(true)
  }

  const cancel = () => {
    setOpen(false)
    onClose?.()
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    const ok = await onSave(amount, budgetCategory)
    setSaving(false)
    if (ok) { setOpen(false); onClose?.() }
  }

  if (!open) {
    // A controlled entry point (autoOpen) has no button of its own — the
    // parent's "⋯" menu is the trigger, and the parent unmounts us on close.
    if (autoOpen) return null
    return (
      <button type="button" className="btn-add-inline" onClick={start}>
        {hasBudget ? 'Edit Labour budget' : 'Set Labour budget'}
      </button>
    )
  }

  return (
    <form className="labour-budget-form queue-edit-form" aria-label="Labour budget" onSubmit={e => { e.preventDefault(); void save() }}>
      <label className="queue-field">
        <span className="queue-field-label">Labour budget (£)</span>
        <input
          className="queue-field-input"
          name="labourBudgetAmount"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="e.g. 1500"
        />
      </label>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={saving}>{saving ? 'Saving…' : 'Save budget'}</button>
        <button type="button" className="btn-queue-cancel" onClick={cancel} disabled={saving}>Cancel</button>
      </div>
      {error && <p className="queue-item-error" role="alert">{error}</p>}
    </form>
  )
}
