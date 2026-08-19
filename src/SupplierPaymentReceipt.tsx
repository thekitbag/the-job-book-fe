import { useState, type FormEvent } from 'react'
import { isSettlementUnavailable, patchSupplierPaymentDate, undoSupplierPayment } from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import { moneyFigure } from './memoryScan'
import type { SupplierAccountPaymentReceipt, SupplierPaymentSourceLine } from './types'

/**
 * The allocation receipt: what one real supplier payment covered, and how much
 * of it belongs to each job.
 *
 * It is the only place a recorded payment can be changed, and only two things
 * can change: the date it was made, and whether it happened at all. There is no
 * amount field, no supplier field and no way to add or drop one covered cost —
 * to correct any of those, undo the payment, fix the source, record it again.
 *
 * Every figure here is the backend's. The sheet never re-adds the allocations
 * to check the total, because a receipt that could disagree with itself is
 * worse than one that simply reports what was recorded.
 */

type Sub = 'summary' | 'confirm-undo' | 'change-date'

function figure(amount: string, label: string): string {
  return moneyFigure(amount, 'GBP') ?? label
}

/**
 * When the purchase happened, in the backend's words.
 *
 * Two dates live on this receipt and they mean different things: the payment
 * date at the top (when money left the bank) and these, one per cost (when each
 * purchase happened). Nothing here derives one from the other — a cost with no
 * recorded date says so, rather than borrowing the payment's date and quietly
 * inventing evidence Mike would then try to match against a statement.
 *
 * `sourceDateLabel` is the backend's to give. A date with no label is formatted
 * here the way money amounts are — formatting, not invention — and a genuinely
 * absent date falls back to the fixed wording.
 */
const NO_SOURCE_DATE = 'Date not recorded'

function sourceDateLabel(line: SupplierPaymentSourceLine): string {
  if (line.sourceDateLabel) return line.sourceDateLabel
  if (!line.sourceDate) return NO_SOURCE_DATE
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(line.sourceDate))
}

// Today in the user's own calendar, for the date input's ceiling: a payment
// cannot have been made tomorrow.
function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function SupplierPaymentReceiptSheet({
  receipt,
  settlementAvailable,
  onReceiptChanged,
  onUndone,
  onSettlementUnavailable,
  onClose,
  onOpenJobMoney,
  onOpenSource,
}: {
  receipt: SupplierAccountPaymentReceipt
  // Reads stay open when settlement is switched off, so a receipt recorded while
  // the feature was on is still reachable and still readable. Its two writes are
  // not: canUndo/canChangeDate describe the payment, not the deployment's gate.
  settlementAvailable: boolean
  onReceiptChanged: (receipt: SupplierAccountPaymentReceipt) => void
  onUndone: () => void
  onSettlementUnavailable: () => void
  onClose: () => void
  onOpenJobMoney: (jobId: string) => void
  onOpenSource: (target: { jobId: string; sourceMemoryItemId: string }) => void
}) {
  // One sub-state at a time, replacing the summary rather than stacking over
  // it, so there is never a drawer on a drawer to back out of twice.
  const [sub, setSub] = useState<Sub>('summary')
  const [dateDraft, setDateDraft] = useState(receipt.paidAt.slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changeDate = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const updated = await patchSupplierPaymentDate(receipt.id, { paidAt: dateDraft })
      track('supplier_payment_date_changed', { payment_id: receipt.id })
      onReceiptChanged(updated)
      setSub('summary')
    } catch (err) {
      if (isSettlementUnavailable(err)) {
        onSettlementUnavailable()
        setSub('summary')
        setError('Changing a payment isn’t switched on at the moment.')
      } else {
        setError('Could not change the date — check it and try again')
      }
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    setBusy(true)
    setError(null)
    try {
      await undoSupplierPayment(receipt.id)
      track('supplier_payment_undone', {
        payment_id: receipt.id,
        cost_count: receipt.costCount,
        job_count: receipt.jobCount,
      })
      onUndone()
    } catch (err) {
      if (isSettlementUnavailable(err)) {
        onSettlementUnavailable()
        setSub('summary')
        setError('Undoing a payment isn’t switched on at the moment. Nothing changed.')
      } else {
        setError('Could not undo the payment — nothing changed. Try again.')
      }
      setBusy(false)
    }
  }

  if (sub === 'confirm-undo') {
    return (
      <BottomSheet title="Undo this payment?" onClose={() => setSub('summary')}>
        <div className="sap-sub">
          <p className="sap-sub-copy">
            {`All ${receipt.costCount} ${receipt.costCount === 1 ? 'cost goes' : 'costs go'} back on the ${receipt.supplierName} account as not paid, and this payment comes off ${receipt.jobCount === 1 ? 'the job' : 'every job'} it was split across.`}
          </p>
          <p className="sap-sub-copy sap-sub-copy--quiet">Budgets stay unchanged.</p>
          {error && <p className="queue-item-error" role="alert">{error}</p>}
          <div className="pay-form-actions">
            <button type="button" className="pay-delete-confirm" disabled={busy} onClick={() => void undo()}>
              {busy ? 'Undoing…' : 'Undo this payment'}
            </button>
            <button type="button" className="btn-queue-cancel" disabled={busy} onClick={() => setSub('summary')}>
              Keep it
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  if (sub === 'change-date') {
    return (
      <BottomSheet title="Change payment date" onClose={() => setSub('summary')}>
        <form className="pay-form sap-sub" aria-label="Change payment date" onSubmit={e => void changeDate(e)}>
          <p className="sap-sub-copy sap-sub-copy--quiet">
            {`Only the date changes. ${figure(receipt.totalAmount, receipt.totalLabel)} to ${receipt.supplierName}, and what it covers, stay as they are.`}
          </p>
          <label className="queue-field">
            <span className="queue-field-label">Date paid</span>
            <input
              className="queue-field-input"
              name="paidAt"
              type="date"
              value={dateDraft}
              max={todayISO()}
              onChange={e => setDateDraft(e.target.value)}
              required
            />
          </label>
          {error && <p className="queue-item-error" role="alert">{error}</p>}
          <div className="pay-form-actions">
            <button type="submit" className="btn-queue-save" disabled={busy || !dateDraft || dateDraft > todayISO()}>
              {busy ? 'Saving…' : 'Save date'}
            </button>
            <button type="button" className="btn-queue-cancel" disabled={busy} onClick={() => setSub('summary')}>
              Cancel
            </button>
          </div>
        </form>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet title={`${figure(receipt.totalAmount, receipt.totalLabel)} to ${receipt.supplierName}`} onClose={onClose}>
      <div className="sap-receipt">
        <p className="sap-receipt-stamp">{`Paid · ${receipt.paidAtLabel}`}</p>
        {/* The two things Mike needs to trust at a glance: the reach of the
            payment, and that his budgets did not move because of it. */}
        <p className="sap-receipt-covers">
          {`Covers ${receipt.costCount} recorded ${receipt.costCount === 1 ? 'cost' : 'costs'} on ${receipt.jobCount} ${receipt.jobCount === 1 ? 'job' : 'jobs'}. Budgets unchanged.`}
        </p>

        <ul className="sap-allocations">
          {receipt.allocations.map(allocation => (
            <li key={allocation.jobId} className="sap-allocation">
              <button
                type="button"
                className="bm-row sap-allocation-row"
                aria-label={`Open Money for ${allocation.jobTitle}`}
                onClick={() => onOpenJobMoney(allocation.jobId)}
              >
                <span className="bm-row-main">
                  <span className="bm-row-name">{allocation.jobTitle}</span>
                  {allocation.jobStatus === 'finished' && <span className="bm-row-meta">finished job</span>}
                </span>
                <span className="bm-row-amount sap-allocation-amount">{allocation.amountLabel}</span>
                <span className="book-chev" aria-hidden="true">›</span>
              </button>
              {/* The costs this job's share was made of — the answer to "which
                  recorded costs did this payment cover". */}
              <ul className="sap-source-lines">
                {allocation.sourceLines.map(line => {
                  const title = [line.itemLabel, line.quantityLabel].filter(Boolean).join(', ')
                  const when = sourceDateLabel(line)
                  return (
                  <li key={line.sourceMemoryItemId}>
                    <button
                      type="button"
                      className="sap-source-row"
                      // The date trails the name so the accessible label keeps
                      // the same "Open <item> on <job>" opening as every other
                      // source row in the app, while still carrying the one
                      // thing that distinguishes two identical-looking costs.
                      aria-label={`Open ${title} on ${allocation.jobTitle}, ${when}`}
                      onClick={() => onOpenSource({ jobId: allocation.jobId, sourceMemoryItemId: line.sourceMemoryItemId })}
                    >
                      <span className="sap-source-name">
                        {/* When the purchase happened, leading the line — it is
                            what tells two near-identical timber buys apart.
                            Never prefixed "Paid": these costs were not paid on
                            these dates, they were paid together, once, on the
                            date at the top of this receipt. */}
                        <span className="sap-source-date">{when}</span>
                        <span className="sap-source-sep" aria-hidden="true"> · </span>
                        {title}
                      </span>
                      <span className="sap-source-amount">{line.amountLabel}</span>
                      <span className="book-chev" aria-hidden="true">›</span>
                    </button>
                  </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>

        {error && <p className="queue-item-error" role="alert">{error}</p>}

        <div className="sap-receipt-actions">
          {receipt.canUndo && settlementAvailable && (
            <button type="button" className="sap-receipt-action sap-receipt-action--undo" onClick={() => { setError(null); setSub('confirm-undo') }}>
              <span className="sap-receipt-action-main">
                <span className="sap-receipt-action-label">Undo this payment</span>
                <span className="sap-receipt-action-sub">
                  {`Puts all ${receipt.costCount} ${receipt.costCount === 1 ? 'cost' : 'costs'} back on the account`}
                </span>
              </span>
              <span className="book-chev" aria-hidden="true">›</span>
            </button>
          )}
          {receipt.canChangeDate && settlementAvailable && (
            <button type="button" className="sap-receipt-action" onClick={() => { setError(null); setDateDraft(receipt.paidAt.slice(0, 10)); setSub('change-date') }}>
              <span className="sap-receipt-action-main">
                <span className="sap-receipt-action-label">Change payment date</span>
              </span>
              <span className="book-chev" aria-hidden="true">›</span>
            </button>
          )}
        </div>

        <button type="button" className="sap-receipt-done" onClick={onClose}>Done</button>
      </div>
    </BottomSheet>
  )
}
