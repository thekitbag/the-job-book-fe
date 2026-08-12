import { useState } from 'react'
import { moneyFigure } from './memoryScan'
import type { BookMoneyResponse, OwedToMeJob, SupplierAccountGroup, SupplierAccountLine, SupplierMissingPriceItem } from './types'

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
 * It is READ ONLY, deliberately. It answers two questions ("what is still to
 * pay on accounts" and "who still owes me") and then hands Mike back to the job
 * that owns the fact so he can correct it there. There is no select, no
 * Select all, no Mark paid, no settlement footer and no rename/merge: those
 * belong to a settlement slice that has not been specified yet, and a disabled
 * version of a control that does not exist would be a promise, not a feature.
 *
 * Every figure, count and label on this page comes from GET /api/book/money.
 * Nothing here adds anything up.
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
  const group = data?.toPayOnAccounts?.supplierGroups.find(g => g.groupId === openGroupId) ?? null

  if (group) {
    return <SupplierDetail group={group} onBack={() => setOpenGroupId(null)} onOpenSource={onOpenSource} />
  }

  const toPay = data?.toPayOnAccounts ?? null
  const owed = data?.owedToMe ?? null

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
          <section className="bm-section" aria-label="Owed to me">
            <div className="bm-section-head">
              <div className="bm-section-headline">
                <h2 className="book-section-label">Owed to me</h2>
                <p className="bm-total">{figure(owed.totalAmount, owed.currency, owed.totalLabel)}</p>
              </div>
              <p className="bm-section-meta">{owed.jobCount === 1 ? '1 job' : `${owed.jobCount} jobs`}</p>
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

        {/* Directly routed here with nothing outstanding: say that plainly and
            stop. No "all settled", no congratulation — neither is a fact this
            page has established. */}
        {loadState === 'ready' && !toPay && !owed && (
          <p className="bm-empty">Nothing to pay on accounts and nothing recorded as owed to you.</p>
        )}
      </div>
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

function SupplierDetail({ group, onBack, onOpenSource }: {
  group: SupplierAccountGroup
  onBack: () => void
  onOpenSource: (target: SourceTarget) => void
}) {
  return (
    <div className="book-page">
      <header className="book-header book-header--sub">
        <button type="button" className="book-back" onClick={onBack} aria-label="Back to Money">
          <span aria-hidden="true">‹ </span>Money
        </button>
        <h1 className="book-title book-title--sub">
          {group.displayName} <span className="book-total">{figure(group.totalAmount, group.currency, group.totalLabel)}</span>
        </h1>
        {/* Design screen 07's header line, without its settlement controls. */}
        <p className="bm-detail-sub">
          {`To pay · ${group.purchaseCount} ${group.purchaseCount === 1 ? 'purchase' : 'purchases'} · ${group.jobContextLabel}`}
        </p>
      </header>

      <div className="book-body">
        <div className="book-section-head book-section-head--ruled">
          <h2 className="book-section-label">Recorded costs</h2>
        </div>
        <ul className="bm-rows">
          {group.lines.map(line => (
            <li key={line.id}>
              <SupplierLineRow line={line} onOpen={() => onOpenSource(line)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SupplierLineRow({ line, onOpen }: { line: SupplierAccountLine; onOpen: () => void }) {
  const title = [line.itemLabel, line.quantityLabel].filter(Boolean).join(', ')
  // Date, job, and — when the job is done but the account is not — that the job
  // is finished. Mike pays a merchant long after he leaves site.
  const meta = [
    line.sourceDateLabel,
    line.jobTitle,
    line.jobStatus === 'finished' ? 'finished job' : null,
  ].filter(Boolean).join(' · ')
  return (
    <button type="button" className="bm-row" aria-label={`Open ${title} on ${line.jobTitle}`} onClick={onOpen}>
      <span className="bm-row-main">
        <span className="bm-row-name">{title}</span>
        <span className="bm-row-meta">{meta}</span>
      </span>
      <span className="bm-row-amount">{figure(line.amount, line.currency, line.amountLabel)}</span>
      <span className="book-chev" aria-hidden="true">›</span>
    </button>
  )
}
