import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  createJobPayment, deleteJobPayment, deleteMoneyEvent, getJobMoney,
  markMoneyOut, patchCustomerTotal, patchJobPayment,
} from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import { useToast } from './Toast'
import { formatSavedStamp } from './SourceHistory'
import type { JobMoneyResponse, MoneyRow } from './types'

// Money — actual movement, in and out. Displayed totals and history come from
// GET /money. Customer-payment writes still go through the existing payment
// endpoints (compatibility), after which Money is refetched as the source of
// truth. Marking a Budget item paid happens from the Budget/Labour drawers via
// this hook's markPaid — it changes Money, never Budget.

type LoadState = 'loading' | 'ready' | 'error'

export function useMoney(jobId: string) {
  const [data, setData] = useState<JobMoneyResponse | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')

  const currentJobIdRef = useRef(jobId)
  currentJobIdRef.current = jobId

  const reload = useCallback(async () => {
    const requested = jobId
    setLoadState(prev => (prev === 'ready' ? 'ready' : 'loading'))
    try {
      const fresh = await getJobMoney(requested)
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

  const adopt = useCallback((summary: JobMoneyResponse) => {
    if (currentJobIdRef.current === summary.jobId) setData(summary)
  }, [])

  // Active paid markers, keyed by the source Budget item they came from — drives
  // the Budget "Paid" state and blocks a second mark-paid on the same item.
  const paidRowBySource = useMemo(() => {
    const map = new Map<string, MoneyRow>()
    for (const r of data?.rows ?? []) {
      if (r.kind === 'cost_paid' && r.sourceMemoryItemId) map.set(r.sourceMemoryItemId, r)
    }
    return map
  }, [data])

  // Mark a trusted Budget cost item paid. Adopts the authoritative Money
  // response and returns the created row so the caller can toast the exact
  // amount added to Money out. Throws on failure (e.g. already paid).
  const markPaid = useCallback(async (sourceMemoryItemId: string): Promise<MoneyRow | null> => {
    const summary = await markMoneyOut(jobId, { sourceMemoryItemId })
    adopt(summary)
    return summary.rows.find(r => r.kind === 'cost_paid' && r.sourceMemoryItemId === sourceMemoryItemId) ?? null
  }, [jobId, adopt])

  const removeEvent = useCallback(async (moneyEventId: string) => {
    await deleteMoneyEvent(jobId, moneyEventId)
    await reload()
  }, [jobId, reload])

  return { data, loadState, reload, adopt, paidRowBySource, markPaid, removeEvent }
}

export type MoneyState = ReturnType<typeof useMoney>

// ── Forms ─────────────────────────────────────────────────────────────────────

const todayISO = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type PaymentFields = { amount: string; paidAt: string; note: string; reference: string }

function PaymentForm({ initial, saveLabel, saving, error, onSubmit, onCancel }: {
  initial?: MoneyRow
  saveLabel: string
  saving: boolean
  error: string | null
  onSubmit: (fields: PaymentFields) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(initial?.amount ?? '')
  const [paidAt, setPaidAt] = useState(initial ? initial.occurredAt.slice(0, 10) : todayISO())
  const [note, setNote] = useState(initial?.note ?? '')
  const [reference, setReference] = useState(initial?.reference ?? '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({ amount: amount.trim(), paidAt, note, reference })
  }

  return (
    <form className="pay-form" aria-label={saveLabel} onSubmit={submit}>
      <p className="pay-form-hint">Money received from the customer — not a reduction in cost.</p>
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

// ── Section ─────────────────────────────────────────────────────────────────

type MoneyFilter = 'all' | 'in' | 'out'

const KIND_LABEL: Record<MoneyRow['kind'], string> = {
  customer_payment: 'Customer payment',
  refund: 'Refund',
  cost_paid: 'Paid out',
}

export default function MoneySection({ jobId, money }: { jobId: string; money: MoneyState }) {
  const { data, loadState, reload } = money
  const toast = useToast()

  const [filter, setFilter] = useState<MoneyFilter>('all')
  const [totalSheetOpen, setTotalSheetOpen] = useState(false)
  const [totalDraft, setTotalDraft] = useState('')
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [editing, setEditing] = useState<MoneyRow | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<MoneyRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => { track('money_opened', { job_id: jobId }) }, [jobId])

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
      await patchCustomerTotal(jobId, { customerTotalAmount: amount })
      track('payment_customer_total_updated', { job_id: jobId, has_customer_total: amount !== null })
      await reload()
      closeSheets()
    } catch {
      setFormError('Could not save — check the amount and try again')
    } finally {
      setSaving(false)
    }
  }

  const addPayment = async (fields: PaymentFields) => {
    setSaving(true)
    setFormError(null)
    try {
      await createJobPayment(jobId, {
        amount: fields.amount,
        paidAt: fields.paidAt,
        note: fields.note.trim() || null,
        reference: fields.reference.trim() || null,
      })
      track('payment_added', { job_id: jobId, has_note: fields.note.trim() !== '', has_reference: fields.reference.trim() !== '' })
      await reload()
      closeSheets()
    } catch {
      setFormError('Could not save the payment — check the details and try again')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (fields: PaymentFields) => {
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

  // Remove a row: a customer payment (existing endpoint) or a paid marker
  // (money event — Money-only correction, Budget cost stays put).
  const removeRow = async (row: MoneyRow) => {
    setSaving(true)
    setListError(null)
    try {
      if (row.kind === 'cost_paid') {
        await money.removeEvent(row.id)
        toast({ title: 'Paid marker removed', body: 'Removed the Money out entry. Budget cost is unchanged.' })
      } else {
        await deleteJobPayment(jobId, row.id)
        track('payment_deleted', { job_id: jobId })
        await reload()
      }
      setConfirmingRemove(null)
    } catch {
      setListError('Could not remove — try again')
    } finally {
      setSaving(false)
    }
  }

  if (loadState === 'error') {
    return (
      <div className="mem-error" role="alert">
        <p>Couldn’t load Money.</p>
        <button className="mem-retry" onClick={() => void reload()}>Try again</button>
      </div>
    )
  }
  if (loadState === 'loading' || !data) {
    return <p className="mem-loading">Loading…</p>
  }

  const rows = data.rows.filter(r => filter === 'all' || r.direction === filter)
  const hasIn = data.moneyInAmount !== null
  const hasOut = data.moneyOutAmount !== null

  return (
    <div className="money-section" role="tabpanel" aria-label="Money">
      {/* Summary: money in and money out side by side, on the same ink band the
          Budget and Labour heroes use. Still owed (customer) rides underneath —
          a merchant refund never changes what the customer owes. */}
      <section className="mem-hero money-hero" aria-label="Money summary">
        <div className="money-hero-figures">
          <div className="money-hero-fig money-hero-fig--in">
            <span className="money-hero-cap">Money in</span>
            <span className="money-hero-amount">{hasIn ? `£${data.moneyInAmount}` : 'None yet'}</span>
          </div>
          <div className="money-hero-fig money-hero-fig--out">
            <span className="money-hero-cap">Money out</span>
            <span className="money-hero-amount">{hasOut ? `£${data.moneyOutAmount}` : 'None yet'}</span>
          </div>
        </div>
        {data.overpaid ? (
          <p className="mem-hero-warning" role="status">
            <span className="mem-hero-warning-dot" aria-hidden="true" />
            £{data.overpaidAmount} more than the customer total
          </p>
        ) : (
          <button
            type="button"
            className="mem-hero-sub"
            aria-label={data.customerTotalAmount !== null ? 'Edit customer total' : 'Set customer total'}
            onClick={() => { setTotalDraft(data.customerTotalAmount ?? ''); setFormError(null); setTotalSheetOpen(true) }}
          >
            {data.stillOwedAmount !== null ? `£${data.stillOwedAmount} still owed ›` : 'Set customer total ›'}
          </button>
        )}
      </section>

      <div className="money-filters" role="tablist" aria-label="Money views">
        {([['all', 'All'], ['in', 'Money in'], ['out', 'Money out']] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={`money-filter${filter === key ? ' money-filter--active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="lens-add-head">
        <span className="lens-add-label">Money history</span>
        <button type="button" className="btn-lens-add-text" onClick={() => { setFormError(null); setAddSheetOpen(true) }}>
          Add payment
        </button>
      </div>

      {listError && <p className="queue-item-error" role="alert">{listError}</p>}

      {rows.length === 0 ? (
        <p className="mem-tab-empty">
          {filter === 'in' ? 'No money in yet. Add a customer payment when the customer pays.'
            : filter === 'out' ? 'No money out yet. Mark a Budget cost as paid to record it here.'
            : 'No money movement yet. Add a customer payment, or mark a Budget cost as paid.'}
        </p>
      ) : (
        <ul className="money-list">
          {rows.map(row => (
            <li key={row.id} className={`money-row money-row--${row.direction}`}>
              <div className="money-row-main">
                <span className="money-row-label">
                  {KIND_LABEL[row.kind]}
                  {row.sourceItemLabel && <span className="money-row-source"> · {row.sourceItemLabel}</span>}
                </span>
                <span className={`money-row-amount money-row-amount--${row.direction}`}>{row.amountLabel}</span>
              </div>
              <div className="money-row-meta-line">
                <span className="money-row-when">{formatSavedStamp(row.occurredAt)}</span>
                {(row.note || row.reference) && (
                  <span className="money-row-meta">
                    {row.note}
                    {row.note && row.reference ? ' · ' : ''}
                    {row.reference && `Ref: ${row.reference}`}
                  </span>
                )}
              </div>
              {(row.editable || row.removable) && (
                <div className="money-row-actions">
                  {confirmingRemove?.id === row.id ? (
                    <>
                      <span className="pay-delete-copy">
                        {row.kind === 'cost_paid' ? 'Remove this paid marker? Budget cost stays unchanged.' : 'Delete this payment?'}
                      </span>
                      <button type="button" className="pay-delete-confirm" disabled={saving} onClick={() => void removeRow(row)}>
                        {saving ? 'Removing…' : 'Remove'}
                      </button>
                      <button type="button" className="btn-queue-cancel" disabled={saving} onClick={() => setConfirmingRemove(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      {row.editable && (
                        <button type="button" className="pay-row-action" onClick={() => { setFormError(null); setEditing(row) }}>Edit</button>
                      )}
                      {row.removable && (
                        <button type="button" className="pay-row-action pay-row-action--danger" onClick={() => setConfirmingRemove(row)}>
                          {row.kind === 'cost_paid' ? 'Remove marker' : 'Delete'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalSheetOpen && (
        <BottomSheet title={data.customerTotalAmount !== null ? 'Edit customer total' : 'Set customer total'} onClose={closeSheets}>
          <form className="pay-form" aria-label="Customer total" onSubmit={e => { e.preventDefault(); void saveCustomerTotal(totalDraft.trim()) }}>
            <label className="queue-field">
              <span className="queue-field-label">Customer total (£)</span>
              <input className="queue-field-input" name="customerTotal" type="text" inputMode="decimal" value={totalDraft} onChange={e => setTotalDraft(e.target.value)} required />
            </label>
            {formError && <p className="queue-item-error" role="alert">{formError}</p>}
            <div className="pay-form-actions">
              <button type="submit" className="btn-queue-save" disabled={saving || totalDraft.trim() === ''}>
                {saving ? 'Saving…' : 'Save total'}
              </button>
              {data.customerTotalAmount !== null && (
                <button type="button" className="pay-clear-total" disabled={saving} onClick={() => void saveCustomerTotal(null)}>Clear total</button>
              )}
              <button type="button" className="btn-queue-cancel" onClick={closeSheets} disabled={saving}>Cancel</button>
            </div>
          </form>
        </BottomSheet>
      )}

      {addSheetOpen && (
        <BottomSheet title="Add customer payment" onClose={closeSheets}>
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
