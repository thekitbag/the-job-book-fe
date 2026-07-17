import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createJobPayment, deleteJobPayment, getJobPayments, patchCustomerTotal, patchJobPayment } from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import { formatSavedStamp } from './SourceHistory'
import type { JobPayment, JobPaymentsResponse } from './types'

// Customer payments — money in. This workspace never reads or writes any
// spend/budget/memory state: Paid going up must never move Known spend.

type LoadState = 'loading' | 'ready' | 'error'

export function usePayments(jobId: string) {
  const [data, setData] = useState<JobPaymentsResponse | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')

  // Stale guard: ignore a summary that resolves after a job switch.
  const currentJobIdRef = useRef(jobId)
  currentJobIdRef.current = jobId

  const reload = useCallback(async () => {
    const requested = jobId
    setLoadState(prev => (prev === 'ready' ? 'ready' : 'loading'))
    try {
      const fresh = await getJobPayments(requested)
      if (currentJobIdRef.current !== requested) return
      setData(fresh)
      setLoadState('ready')
    } catch {
      if (currentJobIdRef.current !== requested) return
      setLoadState('error')
    }
  }, [jobId])

  useEffect(() => {
    setData(null)
    setLoadState('loading')
    void reload()
  }, [reload])

  // Mutations that return the authoritative summary adopt it directly.
  const adopt = useCallback((summary: JobPaymentsResponse) => {
    if (currentJobIdRef.current === summary.jobId) setData(summary)
  }, [])

  return { data, loadState, reload, adopt }
}

export type JobPaymentsState = ReturnType<typeof usePayments>

// ── Forms ─────────────────────────────────────────────────────────────────────

const todayISO = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function PaymentForm({ initial, saveLabel, saving, error, onSubmit, onCancel }: {
  initial?: JobPayment
  saveLabel: string
  saving: boolean
  error: string | null
  onSubmit: (fields: { amount: string; paidAt: string; note: string; reference: string }) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(initial?.amount ?? '')
  const [paidAt, setPaidAt] = useState(initial ? initial.paidAt.slice(0, 10) : todayISO())
  const [note, setNote] = useState(initial?.note ?? '')
  const [reference, setReference] = useState(initial?.reference ?? '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({ amount: amount.trim(), paidAt, note, reference })
  }

  return (
    <form className="pay-form" aria-label={saveLabel} onSubmit={submit}>
      <label className="queue-field">
        <span className="queue-field-label">Amount (£)</span>
        <input className="queue-field-input" name="amount" type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Date</span>
        <input className="queue-field-input" name="paidAt" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} required />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Note (optional)</span>
        <input className="queue-field-input" name="note" type="text" maxLength={120} value={note} onChange={e => setNote(e.target.value)} placeholder="Deposit, stage payment…" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Reference (optional)</span>
        <input className="queue-field-input" name="reference" type="text" maxLength={80} value={reference} onChange={e => setReference(e.target.value)} />
      </label>
      {error && <p className="queue-item-error" role="alert">{error}</p>}
      <div className="pay-form-actions">
        <button type="submit" className="btn-queue-save" disabled={saving || amount.trim() === '' || !paidAt}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  )
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export default function PaymentsSection({ jobId, payments }: { jobId: string; payments: JobPaymentsState }) {
  const { data, loadState, reload, adopt } = payments

  const [totalSheetOpen, setTotalSheetOpen] = useState(false)
  const [totalDraft, setTotalDraft] = useState('')
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [editing, setEditing] = useState<JobPayment | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => { track('payments_opened', { job_id: jobId }) }, [jobId])

  const closeSheets = () => {
    setTotalSheetOpen(false)
    setAddSheetOpen(false)
    setEditing(null)
    setFormError(null)
  }

  const saveCustomerTotal = async (amount: string | null) => {
    setSaving(true)
    setFormError(null)
    try {
      const summary = await patchCustomerTotal(jobId, { customerTotalAmount: amount })
      track('payment_customer_total_updated', { job_id: jobId, has_customer_total: amount !== null })
      adopt(summary)
      closeSheets()
    } catch {
      setFormError('Could not save — check the amount and try again')
    } finally {
      setSaving(false)
    }
  }

  const addPayment = async (fields: { amount: string; paidAt: string; note: string; reference: string }) => {
    setSaving(true)
    setFormError(null)
    try {
      await createJobPayment(jobId, {
        amount: fields.amount,
        paidAt: fields.paidAt,
        note: fields.note.trim() || null,
        reference: fields.reference.trim() || null,
      })
      track('payment_added', {
        job_id: jobId,
        has_note: fields.note.trim() !== '',
        has_reference: fields.reference.trim() !== '',
      })
      await reload()
      closeSheets()
    } catch {
      setFormError('Could not save the payment — check the details and try again')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (fields: { amount: string; paidAt: string; note: string; reference: string }) => {
    if (!editing) return
    setSaving(true)
    setFormError(null)
    try {
      await patchJobPayment(jobId, editing.id, {
        amount: fields.amount,
        paidAt: fields.paidAt,
        note: fields.note.trim() || null,
        reference: fields.reference.trim() || null,
      })
      track('payment_updated', { job_id: jobId })
      await reload()
      closeSheets()
    } catch {
      setFormError('Could not save the payment — check the details and try again')
    } finally {
      setSaving(false)
    }
  }

  const removePayment = async (paymentId: string) => {
    setSaving(true)
    setListError(null)
    try {
      await deleteJobPayment(jobId, paymentId)
      track('payment_deleted', { job_id: jobId })
      setConfirmingDeleteId(null)
      await reload()
    } catch {
      setListError('Could not delete the payment — try again')
    } finally {
      setSaving(false)
    }
  }

  if (loadState === 'error') {
    return (
      <div className="mem-error" role="alert">
        <p>Couldn’t load payments.</p>
        <button className="mem-retry" onClick={() => void reload()}>Try again</button>
      </div>
    )
  }
  if (loadState === 'loading' || !data) {
    return <p className="mem-loading">Loading…</p>
  }

  const hasTotal = data.customerTotalAmount !== null
  // Paid against the customer total, same 6px bar as Spend's spent-vs-budget.
  const paidPct = hasTotal && parseFloat(data.customerTotalAmount!) > 0
    ? Math.min(100, Math.round((parseFloat(data.totalPaidAmount ?? '0') / parseFloat(data.customerTotalAmount!)) * 100))
    : 0

  return (
    <div className="pay-section" role="tabpanel" aria-label="Payments">
      {/* Summary: money in only — known spend lives in Spend and is untouched.
          Deliberately the same hero primitives as the Spend summary (figure, of,
          accent sub-line, bar) on the same ink band, so the two money screens
          read identically instead of drifting apart. */}
      <section className={`mem-hero${data.overpaid ? ' mem-hero--over' : ''}`} aria-label="Payment summary">
        <p className="mem-hero-amount">
          {data.totalPaidAmount !== null ? `£${data.totalPaidAmount}` : 'None yet'}
          {hasTotal && <span className="mem-hero-of"> of £{data.customerTotalAmount}</span>}
        </p>
        {/* Overpaid is a warning state, so it takes warning-red — same
            treatment as over budget on Spend. */}
        {data.overpaid && (
          <p className="mem-hero-warning" role="status">
            <span className="mem-hero-warning-dot" aria-hidden="true" />
            £{data.overpaidAmount} more than the customer total
          </p>
        )}
        {/* The accent sub-line is tappable, like "left to spend ›": the
            customer total is what defines what's still owed, so it opens it. */}
        <button
          type="button"
          className="mem-hero-sub"
          aria-label={hasTotal ? 'Edit customer total' : 'Set customer total'}
          onClick={() => { setTotalDraft(data.customerTotalAmount ?? ''); setFormError(null); setTotalSheetOpen(true) }}
        >
          {hasTotal && !data.overpaid ? `£${data.stillOwedAmount} still owed ›` : hasTotal ? 'Edit customer total ›' : 'Set customer total ›'}
        </button>
        {hasTotal && <div className="mem-hero-bar"><span style={{ width: `${paidPct}%` }} /></div>}
      </section>

      <div className="lens-add-head">
        <span className="lens-add-label">Payments received</span>
        <button type="button" className="btn-lens-add-text" onClick={() => { setFormError(null); setAddSheetOpen(true) }}>
          Add payment
        </button>
      </div>

      {listError && <p className="queue-item-error" role="alert">{listError}</p>}

      {data.payments.length === 0 ? (
        <p className="mem-tab-empty">No payments yet. Add the first payment when the customer pays.</p>
      ) : (
        <ul className="pay-list">
          {data.payments.map(p => (
            <li key={p.id} className="pay-row">
              <div className="pay-row-main">
                <span className="pay-row-amount">{p.amountLabel}</span>
                <span className="pay-row-when">{formatSavedStamp(p.paidAt)}</span>
              </div>
              {(p.note || p.reference) && (
                <p className="pay-row-meta">
                  {p.note}
                  {p.note && p.reference ? ' · ' : ''}
                  {p.reference && `Ref: ${p.reference}`}
                </p>
              )}
              <div className="pay-row-actions">
                {confirmingDeleteId === p.id ? (
                  <>
                    <span className="pay-delete-copy">Delete this payment?</span>
                    <button type="button" className="pay-delete-confirm" disabled={saving} onClick={() => void removePayment(p.id)}>
                      {saving ? 'Deleting…' : 'Delete'}
                    </button>
                    <button type="button" className="btn-queue-cancel" disabled={saving} onClick={() => setConfirmingDeleteId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="pay-row-action" onClick={() => { setFormError(null); setEditing(p) }}>Edit</button>
                    <button type="button" className="pay-row-action pay-row-action--danger" onClick={() => setConfirmingDeleteId(p.id)}>Delete</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalSheetOpen && (
        <BottomSheet title={hasTotal ? 'Edit customer total' : 'Set customer total'} onClose={closeSheets}>
          <form
            className="pay-form"
            aria-label="Customer total"
            onSubmit={e => { e.preventDefault(); void saveCustomerTotal(totalDraft.trim()) }}
          >
            <label className="queue-field">
              <span className="queue-field-label">Customer total (£)</span>
              <input className="queue-field-input" name="customerTotal" type="text" inputMode="decimal" value={totalDraft} onChange={e => setTotalDraft(e.target.value)} required />
            </label>
            {formError && <p className="queue-item-error" role="alert">{formError}</p>}
            <div className="pay-form-actions">
              <button type="submit" className="btn-queue-save" disabled={saving || totalDraft.trim() === ''}>
                {saving ? 'Saving…' : 'Save total'}
              </button>
              {hasTotal && (
                <button type="button" className="pay-clear-total" disabled={saving} onClick={() => void saveCustomerTotal(null)}>
                  Clear total
                </button>
              )}
              <button type="button" className="btn-queue-cancel" onClick={closeSheets} disabled={saving}>Cancel</button>
            </div>
          </form>
        </BottomSheet>
      )}

      {addSheetOpen && (
        <BottomSheet title="Add payment" onClose={closeSheets}>
          <PaymentForm saveLabel="Save payment" saving={saving} error={formError} onSubmit={f => void addPayment(f)} onCancel={closeSheets} />
        </BottomSheet>
      )}

      {editing && (
        <BottomSheet title="Edit payment" onClose={closeSheets}>
          <PaymentForm initial={editing} saveLabel="Save payment" saving={saving} error={formError} onSubmit={f => void saveEdit(f)} onCancel={closeSheets} />
        </BottomSheet>
      )}
    </div>
  )
}
