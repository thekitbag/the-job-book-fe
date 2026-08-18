import { useMemo, useRef, useState } from 'react'
import { createSupplierPayment, getSupplierPayment } from './api'
import { track } from './analytics'
import { moneyFigure } from './memoryScan'
import SupplierPaymentReceiptSheet from './SupplierPaymentReceipt'
import type {
  BookMoneyResponse, OwedToMeJob, SupplierAccountGroup, SupplierAccountLine,
  SupplierAccountPaymentHistoryRow, SupplierAccountPaymentReceipt, SupplierMissingPriceItem,
} from './types'

// Money figures are formatted from the backend's amount the way the rest of the
// app formats money (thousands separated), falling back to the backend's own
// label if an amount is ever missing. Formatting, not arithmetic: every figure,
// count and phrase still comes from the response.
function figure(amount: string | null, currency: string | null, label: string | null): string | null {
  return moneyFigure(amount, currency ?? 'GBP') ?? label
}

/**
 * Money — the cross-job view, and the only screen in the app that reads across
 * every job at once.
 *
 * It answers two questions ("what is still to pay on accounts" and "who still
 * owes me"), lists the supplier payments already recorded, and hands Mike back
 * to the job that owns a fact so he can correct it there.
 *
 * It has exactly one write: settling a named supplier account. Ticking whole
 * recorded costs and marking them paid records one real payment to one merchant
 * and splits it across the jobs those costs belong to. It does not reconcile a
 * bank, match a statement or clear an account, and it never moves a Budget.
 * There is still no rename/merge and no partial or manual amount — the amount is
 * whatever the ticked costs come to, derived by the backend from the ids sent.
 *
 * Every figure, count and label on this page comes from the backend.
 */

type SourceTarget = { jobId: string; sourceMemoryItemId: string }

export default function BookMoneyScreen({
  data,
  loadState,
  onBack,
  onReload,
  onOpenSource,
  onOpenJobMoney,
}: {
  data: BookMoneyResponse | null
  loadState: 'loading' | 'ready' | 'error'
  onBack: () => void
  onReload: () => void
  // Opens the source job and focuses the source item where the app can.
  onOpenSource: (target: SourceTarget) => void
  // Opens that job's own Money view.
  onOpenJobMoney: (jobId: string) => void
}) {
  // Supplier detail is a place, not a panel: it replaces the overview and comes
  // back with "‹ Money", matching how every other level of the book behaves.
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<SupplierAccountPaymentReceipt | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const group = data?.toPayOnAccounts?.supplierGroups.find(g => g.groupId === openGroupId) ?? null

  const openReceipt = async (paymentId: string) => {
    setHistoryError(null)
    try {
      setReceipt(await getSupplierPayment(paymentId))
    } catch {
      setHistoryError('Couldn’t open that payment. Try again.')
    }
  }

  // The receipt lives at this level, not inside the supplier detail: settling
  // the last cost on an account makes that account disappear from the refreshed
  // response, and the receipt explaining where it went must outlive it.
  const receiptSheet = receipt && (
    <SupplierPaymentReceiptSheet
      receipt={receipt}
      onReceiptChanged={setReceipt}
      onUndone={() => { setReceipt(null); onReload() }}
      onClose={() => setReceipt(null)}
      onOpenJobMoney={jobId => { setReceipt(null); onOpenJobMoney(jobId) }}
      onOpenSource={target => { setReceipt(null); onOpenSource(target) }}
    />
  )

  if (group) {
    return (
      <>
        <SupplierDetail
          group={group}
          onBack={() => setOpenGroupId(null)}
          onOpenSource={onOpenSource}
          onPaid={paid => { setReceipt(paid); onReload() }}
          onStaleSelection={onReload}
        />
        {receiptSheet}
      </>
    )
  }

  const toPay = data?.toPayOnAccounts ?? null
  const owed = data?.owedToMe ?? null
  const history = data?.accountPaymentHistory ?? []

  return (
    <div className="book-page">
      <header className="book-header book-header--sub">
        <button type="button" className="book-back" onClick={onBack} aria-label="Back to The Job Book">
          <span aria-hidden="true">‹ </span>The Job Book
        </button>
        <h1 className="book-title book-title--sub">
          Money <span className="book-money-across">Across all jobs</span>
        </h1>
      </header>

      <div className="book-body">
        {loadState === 'error' && (
          <div className="mem-error" role="alert">
            <p>Couldn’t load Money.</p>
            <button className="mem-retry" onClick={onReload}>Try again</button>
          </div>
        )}
        {loadState === 'loading' && !data && <p className="mem-loading">Loading…</p>}

        {/* No tabs. Up to two ruled sections, and an empty direction is simply
            absent — never a £0 heading or a large empty state. */}
        {toPay && (
          <section className="bm-section" aria-label="To pay on accounts">
            <div className="bm-section-head">
              <div className="bm-section-headline">
                <h2 className="book-section-label">To pay on accounts</h2>
                {/* A missing-price-only direction has no trusted total to show,
                    and must not invent £0 to fill the space. */}
                {toPay.totalLabel && (
                  <p className="bm-total">{figure(toPay.totalAmount, toPay.currency, toPay.totalLabel)}</p>
                )}
              </div>
              {/* The backend's one summary line, broken at its own separators
                  so the counts stack instead of wrapping mid-phrase. */}
              <p className="bm-section-meta">
                {toPay.summaryLabel.split(' · ').map(part => <span key={part}>{part}</span>)}
              </p>
            </div>

            <ul className="bm-rows">
              {toPay.supplierGroups.map(g => (
                <li key={g.groupId}>
                  <button
                    type="button"
                    className="bm-row"
                    aria-label={`Open ${g.displayName}, ${g.totalLabel}`}
                    onClick={() => setOpenGroupId(g.groupId)}
                  >
                    <span className="bm-row-main">
                      <span className="bm-row-name">{g.displayName}</span>
                      <span className="bm-row-meta">
                        {`${g.purchaseCount} ${g.purchaseCount === 1 ? 'purchase' : 'purchases'} · ${g.jobContextLabel}`}
                      </span>
                    </span>
                    <span className="bm-row-amount">{figure(g.totalAmount, g.currency, g.totalLabel)}</span>
                    <span className="book-chev" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>

            {toPay.missingPriceItems.length > 0 && (
              <MissingPriceBlock items={toPay.missingPriceItems} onOpenSource={onOpenSource} />
            )}
          </section>
        )}

        {owed && (
          // "Still to receive", not "Owed to me": what Mike is waiting on, said
          // the way he says it. The count rides on the figure's line here — it
          // is two words, and the direction reads as one statement.
          <section className="bm-section" aria-label="Still to receive">
            <div className="bm-section-head">
              <div className="bm-section-headline">
                <h2 className="book-section-label">Still to receive</h2>
                <p className="bm-total">
                  {figure(owed.totalAmount, owed.currency, owed.totalLabel)}
                  <span className="bm-total-count"> · {owed.jobCount === 1 ? '1 job' : `${owed.jobCount} jobs`}</span>
                </p>
              </div>
            </div>

            <ul className="bm-rows">
              {owed.jobs.map(job => (
                <li key={job.jobId}>
                  <OwedRow job={job} onOpen={() => onOpenJobMoney(job.jobId)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Payments already made. Real aggregate supplier payments only — this
            is not a regrouping of older individually marked-paid costs, and it
            is the only way back to a receipt once the account it emptied has
            dropped off the list above. */}
        {history.length > 0 && (
          <section className="bm-section" aria-label="Account payment history">
            <div className="bm-section-head">
              <div className="bm-section-headline">
                <h2 className="book-section-label">Account payment history</h2>
              </div>
            </div>
            {historyError && <p className="queue-item-error" role="alert">{historyError}</p>}
            <ul className="bm-rows">
              {history.map(row => (
                <li key={row.id}>
                  <HistoryRow row={row} onOpen={() => void openReceipt(row.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Directly routed here with nothing outstanding: say that plainly and
            stop. No "all settled", no congratulation — neither is a fact this
            page has established. */}
        {loadState === 'ready' && !toPay && !owed && history.length === 0 && (
          <p className="bm-empty">Nothing to pay on accounts and nothing recorded as owed to you.</p>
        )}
      </div>
      {receiptSheet}
    </div>
  )
}

function OwedRow({ job, onOpen }: { job: OwedToMeJob; onOpen: () => void }) {
  // The context line is the backend's ("Stage 2 due on completion", "Finished
  // job"); where there is none, the job's own location stands in rather than a
  // due date or invoice stage this app has never been told.
  const context = job.contextLabel ?? job.roughLocationOrLabel
  return (
    <button type="button" className="bm-row" aria-label={`Open Money for ${job.jobTitle}`} onClick={onOpen}>
      <span className="bm-row-main">
        <span className="bm-row-name">{job.jobTitle}</span>
        {context && <span className="bm-row-meta">{context}</span>}
      </span>
      <span className="bm-row-amount">{figure(job.owedAmount, job.currency, job.owedLabel)}</span>
      <span className="book-chev" aria-hidden="true">›</span>
    </button>
  )
}

function HistoryRow({ row, onOpen }: { row: SupplierAccountPaymentHistoryRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="bm-row"
      aria-label={`Open the ${row.totalLabel} payment to ${row.supplierName}`}
      onClick={onOpen}
    >
      <span className="bm-row-main">
        <span className="bm-row-name">{row.supplierName}</span>
        <span className="bm-row-meta">
          {`Paid ${row.paidAtLabel} · ${row.costCount} ${row.costCount === 1 ? 'cost' : 'costs'} · ${row.jobCount === 1 ? '1 job' : `${row.jobCount} jobs`}`}
        </span>
      </span>
      <span className="bm-row-amount">{figure(row.totalAmount, row.currency, row.totalLabel)}</span>
      <span className="book-chev" aria-hidden="true">›</span>
    </button>
  )
}

function MissingPriceBlock({ items, onOpenSource }: {
  items: SupplierMissingPriceItem[]
  onOpenSource: (target: SourceTarget) => void
}) {
  return (
    <div className="bm-missing" role="group" aria-label="Costs with no price yet">
      <p className="bm-missing-head">
        {items.length === 1 ? '1 cost has no price yet' : `${items.length} costs have no price yet`}
      </p>
      <ul className="bm-missing-list">
        {items.map(item => (
          <li key={item.id}>
            <button
              type="button"
              className="bm-missing-row"
              onClick={() => onOpenSource(item)}
              aria-label={`Add price for ${item.itemLabel} on ${item.jobTitle}`}
            >
              <span className="bm-missing-text">
                <span className="bm-missing-item">{item.itemLabel}</span>
                {/* Supplier if known, the job it belongs to, and — in the
                    backend's words — that it is outside the total above. */}
                <span className="bm-missing-meta">
                  {[item.supplierName, item.jobTitle, item.reasonLabel].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="bm-missing-action">Add price<span className="book-chev" aria-hidden="true">›</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// A stable id per submit attempt. Reused across a retry of the same attempt so
// that a payment which actually landed before the network gave up comes back as
// itself rather than being made twice; retired once the payment is recorded.
function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sap-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function SupplierDetail({ group, onBack, onOpenSource, onPaid, onStaleSelection }: {
  group: SupplierAccountGroup
  onBack: () => void
  onOpenSource: (target: SourceTarget) => void
  onPaid: (receipt: SupplierAccountPaymentReceipt) => void
  onStaleSelection: () => void
}) {
  // Settlement is for a named merchant account only. "Supplier needed" is a pile
  // of costs that have not been attributed to anyone yet — there is no account
  // to pay, so the detail stays exactly as read-only as it was.
  const settleable = group.kind === 'named_supplier' && group.supplierName !== null

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)

  // Selection survives a failed submit, so a stale-selection error leaves Mike
  // looking at the same task rather than starting again. It is read through the
  // account's current lines, so an id the refreshed account no longer carries
  // simply stops counting instead of haunting the summary.
  const live = useMemo(
    () => group.lines.filter(l => selected.has(l.sourceMemoryItemId)),
    [group.lines, selected],
  )

  const round2 = (n: number) => Math.round(n * 100) / 100
  const selectedTotal = round2(live.reduce((n, l) => n + parseFloat(l.amount), 0))
  const selectedJobCount = new Set(live.map(l => l.jobId)).size
  const leftUnpaid = round2(parseFloat(group.totalAmount) - selectedTotal)
  const allSelected = live.length > 0 && live.length === group.lines.length

  const toggle = (id: string) => {
    setError(null)
    requestIdRef.current = null
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllOrClear = () => {
    setError(null)
    requestIdRef.current = null
    setSelected(live.length > 0 ? new Set() : new Set(group.lines.map(l => l.sourceMemoryItemId)))
  }

  const markPaid = async () => {
    if (busy || live.length === 0 || !group.supplierName) return
    setBusy(true)
    setError(null)
    // One id for this attempt, kept across retries of it.
    requestIdRef.current ??= newRequestId()
    try {
      const paid = await createSupplierPayment({
        supplierGroupId: group.groupId,
        supplierName: group.supplierName,
        sourceMemoryItemIds: live.map(l => l.sourceMemoryItemId),
        clientRequestId: requestIdRef.current,
      })
      track('supplier_payment_recorded', {
        payment_id: paid.id,
        cost_count: paid.costCount,
        job_count: paid.jobCount,
      })
      requestIdRef.current = null
      setSelected(new Set())
      // Success is the backend's receipt, never an optimistic list change.
      onPaid(paid)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'SUPPLIER_PAYMENT_STALE_SELECTION') {
        setError('This account changed. Review the current costs and try again.')
        requestIdRef.current = null
        onStaleSelection()
      } else {
        setError('Could not record the payment — nothing changed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`book-page${settleable ? ' book-page--settling' : ''}`}>
      <header className="book-header book-header--sub">
        <button type="button" className="book-back" onClick={onBack} aria-label="Back to Money">
          <span aria-hidden="true">‹ </span>Money
        </button>
        <h1 className="book-title book-title--sub">
          {group.displayName} <span className="book-total">{figure(group.totalAmount, group.currency, group.totalLabel)}</span>
        </h1>
        {/* Design screen 07's header line. No "Rename or merge": correcting a
            supplier name is a source-item correction, not an account operation. */}
        <p className="bm-detail-sub">
          {`To pay · ${group.purchaseCount} ${group.purchaseCount === 1 ? 'purchase' : 'purchases'} · ${group.jobContextLabel}`}
        </p>
      </header>

      <div className="book-body">
        <div className="book-section-head book-section-head--ruled">
          <h2 className="book-section-label">{settleable ? 'Tick what a payment covers' : 'Recorded costs'}</h2>
          {settleable && (
            <button type="button" className="sap-select-all" onClick={selectAllOrClear}>
              {live.length > 0 ? 'Clear' : 'Select all'}
            </button>
          )}
        </div>
        <ul className="bm-rows">
          {group.lines.map(line => (
            <li key={line.id}>
              <SupplierLineRow
                line={line}
                selectable={settleable}
                checked={selected.has(line.sourceMemoryItemId)}
                onToggle={() => toggle(line.sourceMemoryItemId)}
                onOpen={() => onOpenSource(line)}
              />
            </li>
          ))}
        </ul>
      </div>

      {settleable && (
        // Sticky, because the thing Mike is building — a payment — has to stay
        // visible while he scrolls a long account to tick what it covers.
        <div className="sap-bar" role="group" aria-label="Record a payment">
          {error && <p className="sap-bar-error queue-item-error" role="alert">{error}</p>}
          <p className="sap-bar-line">
            <span className="sap-bar-selected">
              {live.length === 0
                ? 'Nothing selected'
                : `${live.length} selected · ${selectedJobCount === 1 ? '1 job' : `${selectedJobCount} jobs`}`}
            </span>
            <span className="sap-bar-rest">
              {live.length === 0
                ? `${figure(group.totalAmount, group.currency, group.totalLabel)} on the account`
                : allSelected
                  // Said as what it is — no costs left unpaid on this account —
                  // and never as "cleared", "settled" or "reconciled", none of
                  // which this app has any way of knowing.
                  ? 'No recorded costs left unpaid'
                  : `${moneyFigure(String(leftUnpaid))} left unpaid`}
            </span>
          </p>
          {/* The exact amount, from the ticked costs. There is no amount field:
              the payment is worth what it covers, and the backend derives the
              same figure from the ids sent. */}
          <button
            type="button"
            className="sap-bar-action"
            disabled={live.length === 0 || busy}
            onClick={() => void markPaid()}
          >
            {busy ? 'Recording…' : live.length === 0 ? 'Mark paid' : `Mark ${moneyFigure(String(selectedTotal))} paid`}
          </button>
        </div>
      )}
    </div>
  )
}

function SupplierLineRow({ line, selectable, checked, onToggle, onOpen }: {
  line: SupplierAccountLine
  selectable: boolean
  checked: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const title = [line.itemLabel, line.quantityLabel].filter(Boolean).join(', ')
  // Date, job, and — when the job is done but the account is not — that the job
  // is finished. Mike pays a merchant long after he leaves site.
  const meta = [
    line.sourceDateLabel,
    line.jobTitle,
    line.jobStatus === 'finished' ? 'finished job' : null,
  ].filter(Boolean).join(' · ')
  return (
    <div className={`bm-row sap-line${checked ? ' sap-line--checked' : ''}`}>
      {/* Two separate targets on one row: the box builds the payment, the
          content opens the cost. Tapping to read what something was must never
          quietly add it to a payment. */}
      {selectable && (
        <label className="sap-check">
          <input type="checkbox" checked={checked} onChange={onToggle} />
          <span className="sap-check-box" aria-hidden="true" />
          <span className="sap-check-label">{`Include ${title}, ${line.amountLabel}`}</span>
        </label>
      )}
      <button type="button" className="sap-line-open" aria-label={`Open ${title} on ${line.jobTitle}`} onClick={onOpen}>
        <span className="bm-row-main">
          <span className="bm-row-name">{title}</span>
          <span className="bm-row-meta">{meta}</span>
        </span>
        <span className="bm-row-amount">{figure(line.amount, line.currency, line.amountLabel)}</span>
        <span className="book-chev" aria-hidden="true">›</span>
      </button>
    </div>
  )
}
