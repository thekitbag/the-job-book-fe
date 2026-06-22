import { useCallback, useEffect, useMemo, useState } from 'react'
import { getMemoryView, updateMemoryItem, verifyMemoryItem } from './api'
import MemoryEditForm from './MemoryEditForm'
import { memoryItemToEdit } from './memoryEdit'
import {
  costDetailRows,
  deriveCostSummary,
  deriveScanGroups,
  formatMoney,
  MEMORY_TYPE_TO_SECTION_KEY,
  SECTION_FULL_LABELS,
  SECTION_ORDER,
} from './memoryScan'
import type { Job, MemoryItemEdit, MemoryViewItem, MemoryViewResponse, MemoryViewSection, OrderedCostSummary, ScanViewItem, ScanViewSection } from './types'

const SECTION_SHORT_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered',
  used_materials: 'Used',
  leftovers: 'Leftover',
  supplier_delivery_notes: 'Supplier',
  customer_changes: 'Customer',
  watch_outs: 'Watch out',
}

const MATERIAL_TYPES = new Set<string>(['ordered_material', 'used_material', 'leftover_material'])

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StructuredFields({ item }: { item: MemoryViewItem }) {
  const rows: [string, string][] = []
  if (item.materialName) rows.push(['Item', item.materialName])
  const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
  if (qty) rows.push(['Quantity', qty])
  if (item.supplierName) rows.push(['Supplier', item.supplierName])
  if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
  if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  rows.push(...costDetailRows(item))
  const uncertain = (item.uncertaintyFlags ?? []).length > 0

  if (rows.length === 0 && !uncertain) return null
  return (
    <dl className="card-detail-fields">
      {rows.map(([label, value]) => (
        <div key={label} className="card-detail-row">
          <dt className="card-detail-label">{label}</dt>
          <dd className="card-detail-value">{value}</dd>
        </div>
      ))}
      {uncertain && (
        <div className="card-detail-row card-uncertainty">
          <dt className="card-detail-label">Worth checking</dt>
          <dd className="card-detail-value">cost or quantity may need confirming</dd>
        </div>
      )}
    </dl>
  )
}

function SourceContext({ item }: { item: MemoryViewItem }) {
  const [open, setOpen] = useState(false)

  if (!item.source) return null

  return (
    <div className="mem-source">
      <button
        className="mem-source-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? 'Hide source' : 'Show source'}
      </button>
      {open && (
        <div className="mem-source-body">
          <p className="mem-source-label">This came from your note</p>
          <p className="mem-source-time">{formatTime(item.source.capturedAt)}</p>
          {item.source.transcriptText && (
            <>
              <p className="mem-source-label">What the system heard</p>
              <blockquote className="mem-source-quote">{item.source.transcriptText}</blockquote>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryCard({
  item,
  isEditing,
  submitting,
  verifying,
  errorMsg,
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
}: {
  item: MemoryViewItem
  isEditing: boolean
  submitting: boolean
  verifying: boolean
  errorMsg: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
  onVerify: () => void
}) {
  const isMaterial = MATERIAL_TYPES.has(item.memoryType)
  const hasFields = !!(
    item.materialName || item.quantity || item.unit ||
    item.supplierName || item.deliveryTiming || item.locationOrUse ||
    item.costAmount || item.totalCostAmount ||
    (item.uncertaintyFlags ?? []).length > 0
  )
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  // Local acknowledgement of "Still unsure": hides the prompt but keeps the
  // Worth-checking warning (the item genuinely stays unresolved).
  const [ackUnsure, setAckUnsure] = useState(false)

  if (isEditing) {
    return (
      <div className="mem-card mem-card--editing">
        <MemoryEditForm initial={memoryItemToEdit(item)} submitting={submitting} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  return (
    <div className={`mem-card${uncertain ? ' mem-card--unresolved' : ''}`}>
      {isMaterial
        ? <p className="mem-card-type-label">{MATERIAL_TYPE_LABEL[item.memoryType]}</p>
        : <p className="mem-card-summary">{item.summary}</p>
      }
      <StructuredFields item={item} />
      {isMaterial && !hasFields && <p className="mem-card-summary">{item.summary}</p>}

      {uncertain && !ackUnsure && (
        <div className="mem-resolve">
          <button type="button" className="btn-mem-verify" onClick={onVerify} disabled={verifying}>
            {verifying ? 'Saving…' : 'This is right'}
          </button>
          <button type="button" className="btn-mem-unsure" onClick={() => setAckUnsure(true)} disabled={verifying}>
            Still unsure
          </button>
        </div>
      )}

      <div className="mem-card-footer">
        <SourceContext item={item} />
        <button type="button" className="btn-mem-fix" onClick={onStartEdit}>Fix memory</button>
      </div>
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}

function MemSection({
  section,
  editingId,
  submittingId,
  verifyingId,
  itemErrors,
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
}: {
  section: MemoryViewSection
  editingId: string | null
  submittingId: string | null
  verifyingId: string | null
  itemErrors: Record<string, string>
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (id: string, edit: MemoryItemEdit) => void
  onVerify: (id: string) => void
}) {
  if (section.items.length === 0) return null
  const shortLabel = SECTION_SHORT_LABELS[section.key] ?? section.label
  return (
    <section className="mem-section">
      <h2 className="mem-section-heading">{shortLabel}</h2>
      {section.items.map(item => (
        <MemoryCard
          key={item.id}
          item={item}
          isEditing={editingId === item.id}
          submitting={submittingId === item.id}
          verifying={verifyingId === item.id}
          errorMsg={itemErrors[item.id] ?? null}
          onStartEdit={() => onStartEdit(item.id)}
          onCancelEdit={onCancelEdit}
          onSave={edit => onSave(item.id, edit)}
          onVerify={() => onVerify(item.id)}
        />
      ))}
    </section>
  )
}

function ScanItem({ item }: { item: ScanViewItem }) {
  // Material rows lead with quantity/material; prose groups lead with summary.
  const desc = item.primaryText
    ?? [[item.quantity, item.unit].filter(Boolean).join(' '), item.materialName].filter(Boolean).join(' · ')
  // Secondary context chips (only what's present)
  const meta = [
    item.supplierName,
    item.deliveryTiming,
    item.locationOrUse,
  ].filter(Boolean) as string[]
  const uncertain = item.uncertaintyFlags.length > 0
  return (
    <div className="mem-scan-item">
      <span className="mem-scan-item-main">
        {desc && <span className="mem-scan-item-desc">{desc}</span>}
        {item.consolidated && <span className="mem-scan-item-tag">total</span>}
      </span>
      {meta.length > 0 && <span className="mem-scan-item-meta">{meta.join(' · ')}</span>}
      {item.costLabel && <span className="mem-scan-item-cost">{item.costLabel}</span>}
      {item.totalCostLabel && <span className="mem-scan-item-total">{item.totalCostLabel} total</span>}
      {uncertain && <span className="mem-scan-item-uncertain">Worth checking</span>}
    </div>
  )
}

// Known spend for bought/ordered materials. Deliberately not "Total spend" —
// it's only the trusted line totals; missing/uncertain costs are called out.
function KnownSpend({ summary, orderedCount }: { summary: OrderedCostSummary; orderedCount: number }) {
  if (orderedCount === 0) return null
  const notes: string[] = []
  if (summary.missingCostCount === 1) notes.push('1 bought item has no cost remembered')
  else if (summary.missingCostCount > 1) notes.push(`${summary.missingCostCount} bought items have no cost remembered`)
  if (summary.uncertainCostCount === 1) notes.push('1 bought item has cost worth checking')
  else if (summary.uncertainCostCount > 1) notes.push(`${summary.uncertainCostCount} bought items have cost worth checking`)

  return (
    <section className="mem-known-spend" aria-label="Known spend">
      <p className="mem-known-spend-label">Known spend</p>
      <p className="mem-known-spend-amount">
        {summary.knownSpendAmount
          ? formatMoney(parseFloat(summary.knownSpendAmount), summary.knownSpendCurrency)
          : 'None known yet'}
      </p>
      {summary.rows.length > 0 && (
        <ul className="mem-known-spend-rows">
          {summary.rows.map(row => (
            <li key={row.key} className="mem-known-spend-row">
              <span className="mem-known-spend-row-item">
                {[row.materialName, [row.quantity, row.unit].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
              </span>
              <span className="mem-known-spend-row-total">{row.lineTotalLabel}</span>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && <p className="mem-known-spend-note">{notes.join(' · ')}</p>}
    </section>
  )
}

function ScanView({ sections }: { sections: ScanViewSection[] }) {
  if (sections.length === 0) return null
  return (
    <section className="mem-scan" aria-label="Memory scan">
      {sections.map(section => (
        <div key={section.key} className={`mem-scan-section mem-scan-section--${section.key}`}>
          <h3 className="mem-scan-heading">{section.label}</h3>
          {section.items.map((item, i) => <ScanItem key={i} item={item} />)}
        </div>
      ))}
    </section>
  )
}

export default function JobMemoryScreen({
  job,
  onClose,
  onOpenReviewQueue,
}: {
  job: Job
  onClose: () => void
  onOpenReviewQueue: () => void
}) {
  const [data, setData] = useState<MemoryViewResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [showDetail, setShowDetail] = useState(false)

  function load() {
    setLoadState('loading')
    setErrorMsg('')
    getMemoryView(job.id)
      .then(d => { setData(d); setLoadState('ready') })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job memory')
        setLoadState('error')
      })
  }

  useEffect(() => { load() }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Edit trusted memory in place. Updates the visible item from the API
  // response and re-homes it if its type changed — never re-queues it.
  const handleSaveEdit = useCallback(async (memoryItemId: string, edit: MemoryItemEdit) => {
    setSubmittingId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      // A normal Fix memory save also clears the Worth-checking warning.
      const updated = await updateMemoryItem(job.id, memoryItemId, { ...edit, uncertaintyResolution: 'resolved' })
      setData(prev => {
        if (!prev) return prev
        // Preserve source linkage if the response omits it (mock returns null)
        let prevItem: MemoryViewItem | undefined
        prev.sections.forEach(s => { const f = s.items.find(it => it.id === memoryItemId); if (f) prevItem = f })
        const merged: MemoryViewItem = { ...updated, source: updated.source ?? prevItem?.source ?? null }

        const targetKey = MEMORY_TYPE_TO_SECTION_KEY[merged.memoryType] ?? merged.memoryType
        let sections = prev.sections.map(s => ({ ...s, items: s.items.filter(it => it.id !== memoryItemId) }))
        if (!sections.some(s => s.key === targetKey)) {
          sections = [...sections, { key: targetKey, label: SECTION_FULL_LABELS[targetKey] ?? targetKey, items: [] }]
        }
        sections = sections.map(s => s.key === targetKey ? { ...s, items: [merged, ...s.items] } : s)
        sections.sort((a, b) =>
          ((SECTION_ORDER.indexOf(a.key) + 1) || 99) - ((SECTION_ORDER.indexOf(b.key) + 1) || 99))
        // Drop the now-stale backend summary; Known spend recomputes locally.
        return { ...prev, sections, costSummary: undefined }
      })
      setEditingId(null)
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setSubmittingId(null)
    }
  }, [job.id])

  // Verify a Worth-checking item as right: clears the unresolved flags only,
  // leaving structured fields (incl. approximate wording) untouched.
  const handleVerify = useCallback(async (memoryItemId: string) => {
    setVerifyingId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      await verifyMemoryItem(job.id, memoryItemId)
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.map(it => it.id === memoryItemId ? { ...it, uncertaintyFlags: [] } : it),
          })),
          // Resolving an item may bring it into Known spend; recompute locally.
          costSummary: undefined,
        }
      })
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setVerifyingId(null)
    }
  }, [job.id])

  const hasMemory = data
    ? data.sections.some(s => s.items.length > 0)
    : false

  // Scan summary is always derived from the trusted sections (never from
  // stillToCheck, and never from backend summarySections which can drift after
  // an edit). Both summary and detail therefore read the same source of truth.
  const scanSections = useMemo(
    () => (data ? deriveScanGroups(data.sections) : []),
    [data],
  )
  // Prefer the backend-authoritative cost summary on load; once a local edit
  // drops it, recompute with the same safe rules so Known spend stays live.
  const costSummary = useMemo<OrderedCostSummary | null>(
    () => (data ? (data.costSummary?.orderedMaterials ?? deriveCostSummary(data.sections)) : null),
    [data],
  )
  const orderedCount = data
    ? (data.sections.find(s => s.key === 'ordered_materials')?.items.length ?? 0)
    : 0
  const detailCount = data
    ? data.sections.reduce((n, s) => n + s.items.length, 0)
    : 0

  return (
    <div className="mem-page">
      <header className="mem-header">
        <button className="mem-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <div className="mem-header-titles">
          <h1 className="mem-title">Job memory</h1>
          <p className="mem-job-label">{job.title}</p>
        </div>
      </header>

      {loadState === 'loading' && (
        <p className="mem-loading">Loading…</p>
      )}

      {loadState === 'error' && (
        <div className="mem-error" role="alert">
          <p>{errorMsg}</p>
          <button className="mem-retry" onClick={load}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && data && (
        <>
          {/* Layer 1 — Pending review alert. Clearly NOT trusted memory. */}
          {data.stillToCheck.count > 0 && (
            <div className="mem-still-to-check" role="region" aria-label="Still to check">
              <div className="mem-stc-row">
                <span className="mem-stc-count">{data.stillToCheck.count} still to check</span>
                <button
                  className="mem-stc-link"
                  onClick={onOpenReviewQueue}
                >
                  Review Things to check
                </button>
              </div>
              <p className="mem-stc-tag">Not remembered yet</p>
              {data.stillToCheck.items.map(item => (
                <p key={item.id} className="mem-stc-item">
                  {item.timeLabel && <span className="mem-stc-time">{item.timeLabel}</span>}
                  {item.summary}
                </p>
              ))}
            </div>
          )}

          {hasMemory ? (
            <>
              {/* Known bought/ordered spend — trusted line totals only */}
              {costSummary && <KnownSpend summary={costSummary} orderedCount={orderedCount} />}

              {/* Layer 2 — Memory at a glance (primary scan surface) */}
              <ScanView sections={scanSections} />

              {/* Layer 3 — Remembered detail, de-emphasised behind a disclosure */}
              <section className="mem-detail" aria-label="Remembered detail">
                <button
                  type="button"
                  className="mem-detail-toggle"
                  aria-expanded={showDetail}
                  onClick={() => setShowDetail(o => !o)}
                >
                  {showDetail ? 'Hide details' : `Show details (${detailCount})`}
                </button>
                {showDetail && data.sections.map(s => (
                  <MemSection
                    key={s.key}
                    section={s}
                    editingId={editingId}
                    submittingId={submittingId}
                    verifyingId={verifyingId}
                    itemErrors={itemErrors}
                    onStartEdit={setEditingId}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={handleSaveEdit}
                    onVerify={handleVerify}
                  />
                ))}
              </section>
            </>
          ) : (
            <div className="mem-empty">
              <p>No trusted memory yet. Review Things to check to save useful job details here.</p>
              <button className="mem-stc-link" onClick={onOpenReviewQueue}>
                Go to Things to check
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
