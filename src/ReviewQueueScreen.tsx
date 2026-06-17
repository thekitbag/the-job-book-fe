import { useCallback, useEffect, useState } from 'react'
import { getReviewQueue, submitQueueDecision } from './api'
import type {
  AlreadyRememberedItem,
  CostQualifier,
  Job,
  MemoryType,
  ProposedMemory,
  QueueDecisionAction,
  QueueItem,
  QueueSection,
  ReviewQueue,
} from './types'

const MEMORY_TYPE_OPTIONS: { value: MemoryType; label: string; shortLabel: string }[] = [
  { value: 'used_material', label: 'Used material', shortLabel: 'Used' },
  { value: 'ordered_material', label: 'Ordered material', shortLabel: 'Ordered' },
  { value: 'leftover_material', label: 'Leftover material', shortLabel: 'Leftover' },
  { value: 'supplier_delivery_note', label: 'Supplier / delivery note', shortLabel: 'Supplier' },
  { value: 'customer_change', label: 'Customer change', shortLabel: 'Customer' },
  { value: 'watch_out', label: 'Watch out', shortLabel: 'Watch out' },
]

const COST_QUALIFIER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— not stated —' },
  { value: 'each', label: 'Each (per item)' },
  { value: 'total', label: 'Total' },
  { value: 'approx', label: 'Approximate' },
  { value: 'unknown', label: 'Not clear' },
]

const MATERIAL_TYPES = new Set<MemoryType>(['ordered_material', 'used_material', 'leftover_material'])

const MATERIAL_TYPE_CARD_LABEL: Partial<Record<MemoryType, string>> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
}

function formatCostLabel(amount: string | null, currency: string | null, qualifier: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  const q: Record<string, string> = { each: ' each', total: ' total', approx: ' approx.' }
  return `${sym}${amount}${qualifier ? (q[qualifier] ?? '') : ''}`
}

function formatTotalLabel(amount: string | null, currency: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  return `${sym}${amount}`
}

function SourceContext({ contexts }: { contexts: QueueItem['sourceContext'] }) {
  const [open, setOpen] = useState(false)

  if (contexts.length === 0) {
    return <p className="queue-source-unavailable">Source unavailable</p>
  }

  return (
    <div className="queue-source-context">
      <button
        type="button"
        className="queue-source-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        This came from your note {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="queue-source-list">
          {contexts.map(ctx => (
            <li key={ctx.candidateFactId} className="queue-source-item">
              {ctx.transcriptText
                ? <p className="queue-source-text">"{ctx.transcriptText}"</p>
                : <p className="queue-source-unavailable">Source unavailable</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ItemKindBadge({ item }: { item: QueueItem }) {
  if (item.kind === 'single') return null
  const cls =
    item.kind === 'contradiction'
      ? 'queue-kind-badge queue-kind-badge--contradiction'
      : item.kind === 'duplicate_group'
        ? 'queue-kind-badge queue-kind-badge--duplicate'
        : 'queue-kind-badge queue-kind-badge--unclear'
  return <span className={cls}>{item.reviewLabel}</span>
}

function QueueItemDetails({ pm, uncertaintyFlags }: { pm: ProposedMemory; uncertaintyFlags: string[] }) {
  const rows: [string, string][] = []
  if (pm.materialName) rows.push(['Item', pm.materialName])
  const qty = [pm.quantity, pm.unit].filter(Boolean).join(' ')
  if (qty) rows.push(['Quantity', qty])
  if (pm.supplierName) rows.push(['Supplier', pm.supplierName])
  if (pm.deliveryTiming) rows.push(['Delivery', pm.deliveryTiming])
  if (pm.locationOrUse) rows.push(['Location', pm.locationOrUse])
  const costLabel = formatCostLabel(pm.costAmount, pm.costCurrency, pm.costQualifier)
  if (costLabel) rows.push(['Cost', costLabel])
  const totalLabel = formatTotalLabel(pm.totalCostAmount, pm.costCurrency)
  if (totalLabel) rows.push(['Total', totalLabel])
  const uncertain = uncertaintyFlags.length > 0

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

function EditForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: ProposedMemory
  onSubmit: (corrected: ProposedMemory) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<ProposedMemory>(initial)
  const setStr = (k: Exclude<keyof ProposedMemory, 'memoryType' | 'costQualifier'>, v: string) =>
    setForm(f => ({ ...f, [k]: v || null }))
  const setType = (v: string) =>
    setForm(f => ({ ...f, memoryType: v as MemoryType }))
  const setCostQualifier = (v: string) =>
    setForm(f => ({ ...f, costQualifier: (v as CostQualifier) || null }))

  return (
    <form
      className="queue-edit-form"
      aria-label="Edit correction"
      onSubmit={e => { e.preventDefault(); onSubmit(form) }}
    >
      <label className="queue-field">
        <span className="queue-field-label">Type</span>
        <select className="queue-field-input" value={form.memoryType} onChange={e => setType(e.target.value)}>
          {MEMORY_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Summary</span>
        <input className="queue-field-input" value={form.summary} onChange={e => setStr('summary', e.target.value)} required />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Material</span>
        <input className="queue-field-input" value={form.materialName ?? ''} onChange={e => setStr('materialName', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Quantity</span>
        <input className="queue-field-input" value={form.quantity ?? ''} onChange={e => setStr('quantity', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Unit</span>
        <input className="queue-field-input" value={form.unit ?? ''} onChange={e => setStr('unit', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Supplier</span>
        <input className="queue-field-input" value={form.supplierName ?? ''} onChange={e => setStr('supplierName', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Delivery timing</span>
        <input className="queue-field-input" value={form.deliveryTiming ?? ''} onChange={e => setStr('deliveryTiming', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Location / use</span>
        <input className="queue-field-input" value={form.locationOrUse ?? ''} onChange={e => setStr('locationOrUse', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Cost amount</span>
        <input className="queue-field-input" value={form.costAmount ?? ''} onChange={e => setStr('costAmount', e.target.value)} placeholder="e.g. 5.00" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Cost qualifier</span>
        <select className="queue-field-input" value={form.costQualifier ?? ''} onChange={e => setCostQualifier(e.target.value)}>
          {COST_QUALIFIER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Total cost</span>
        <input className="queue-field-input" value={form.totalCostAmount ?? ''} onChange={e => setStr('totalCostAmount', e.target.value)} placeholder="e.g. 40" />
      </label>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function QueueItemCard({
  item,
  isEditing,
  submitting,
  errorMsg,
  onConfirm,
  onStartEdit,
  onSubmitCorrection,
  onCancelEdit,
  onDismiss,
}: {
  item: QueueItem
  isEditing: boolean
  submitting: boolean
  errorMsg: string | null
  onConfirm: () => void
  onStartEdit: () => void
  onSubmitCorrection: (corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onDismiss: () => void
}) {
  const resolved = item.status !== 'draft'
  const memType = item.proposedMemory.memoryType
  const isMaterial = MATERIAL_TYPES.has(memType)
  const hasDetailFields = !!(
    item.proposedMemory.materialName ||
    item.proposedMemory.quantity ||
    item.proposedMemory.unit ||
    item.proposedMemory.supplierName ||
    item.proposedMemory.deliveryTiming ||
    item.proposedMemory.locationOrUse ||
    item.proposedMemory.costAmount ||
    item.proposedMemory.totalCostAmount ||
    item.uncertaintyFlags.length > 0
  )

  return (
    <div
      className={`queue-item-card queue-item-card--${item.status}`}
      data-testid={`queue-item-${item.id}`}
    >
      <div className="queue-item-top">
        <ItemKindBadge item={item} />
        {item.timeLabel && <span className="queue-time-label">{item.timeLabel}</span>}
      </div>

      {isMaterial
        ? <p className="queue-item-type-label">{MATERIAL_TYPE_CARD_LABEL[memType] ?? memType}</p>
        : <p className="queue-item-summary">{item.summary}</p>
      }

      {!isEditing && (
        <QueueItemDetails pm={item.proposedMemory} uncertaintyFlags={item.uncertaintyFlags} />
      )}

      {isMaterial && !hasDetailFields && !isEditing && (
        <p className="queue-item-summary">{item.summary}</p>
      )}

      {!resolved && <SourceContext contexts={item.sourceContext} />}

      {resolved && item.status === 'confirmed' && (
        <p className="queue-item-resolved queue-item-resolved--saved">Saved to trusted memory</p>
      )}
      {resolved && item.status === 'corrected' && (
        <p className="queue-item-resolved queue-item-resolved--saved">Saved to trusted memory</p>
      )}
      {resolved && item.status === 'dismissed' && (
        <p className="queue-item-resolved queue-item-resolved--dismissed">Dismissed</p>
      )}

      {!resolved && !isEditing && (
        <div className="queue-item-actions">
          <button className="btn-queue-remember" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Saving…' : 'Remember this'}
          </button>
          <button className="btn-queue-correct" onClick={onStartEdit} disabled={submitting}>
            Fix details
          </button>
          <button className="btn-queue-dismiss" onClick={onDismiss} disabled={submitting}>
            Dismiss
          </button>
        </div>
      )}

      {!resolved && isEditing && (
        <EditForm
          initial={item.proposedMemory}
          onSubmit={onSubmitCorrection}
          onCancel={onCancelEdit}
          submitting={submitting}
        />
      )}

      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}

function RememberedCard({ item }: { item: AlreadyRememberedItem }) {
  const typeLabel = MEMORY_TYPE_OPTIONS.find(o => o.value === item.memoryType)?.shortLabel ?? item.memoryType

  const rows: [string, string][] = []
  const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
  if (item.materialName) rows.push(['Item', item.materialName])
  if (qty) rows.push(['Quantity', qty])
  if (item.supplierName) rows.push(['Supplier', item.supplierName])
  if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
  if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  const costLabel = formatCostLabel(item.costAmount ?? null, item.costCurrency ?? null, item.costQualifier ?? null)
  if (costLabel) rows.push(['Cost', costLabel])
  const totalLabel = formatTotalLabel(item.totalCostAmount ?? null, item.costCurrency ?? null)
  if (totalLabel) rows.push(['Total', totalLabel])
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  const isMaterial = MATERIAL_TYPES.has(item.memoryType)
  const hasDetailRows = rows.length > 0 || uncertain

  return (
    <li className={`queue-remembered-card queue-remembered-card--${item.memoryType}`}>
      <div className="queue-remembered-card-top">
        <span className={`queue-remembered-type-chip queue-remembered-type-chip--${item.memoryType}`}>{typeLabel}</span>
        {item.timeLabel && <span className="queue-remembered-card-time">{item.timeLabel}</span>}
      </div>
      {(!isMaterial || !hasDetailRows) && (
        <p className="queue-remembered-card-summary">{item.summary}</p>
      )}
      {(rows.length > 0 || uncertain) && (
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
      )}
    </li>
  )
}

function AlreadyRememberedSection({ items }: { items: AlreadyRememberedItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="queue-already-remembered" role="region" aria-label="Already remembered">
      <p className="queue-remembered-heading">Already remembered</p>
      <ul className="queue-remembered-list">
        {items.map(m => <RememberedCard key={m.memoryItemId} item={m} />)}
      </ul>
    </div>
  )
}

function SectionBlock({
  section,
  editingItemId,
  submittingId,
  itemErrors,
  onConfirm,
  onStartEdit,
  onSubmitCorrection,
  onCancelEdit,
  onDismiss,
}: {
  section: QueueSection
  editingItemId: string | null
  submittingId: string | null
  itemErrors: Record<string, string>
  onConfirm: (id: string) => void
  onStartEdit: (id: string) => void
  onSubmitCorrection: (id: string, corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onDismiss: (id: string) => void
}) {
  if (section.items.length === 0) return null
  return (
    <section className="queue-section">
      <h2 className="queue-section-heading">{section.label}</h2>
      {section.items.map(item => (
        <QueueItemCard
          key={item.id}
          item={item}
          isEditing={editingItemId === item.id}
          submitting={submittingId === item.id}
          errorMsg={itemErrors[item.id] ?? null}
          onConfirm={() => onConfirm(item.id)}
          onStartEdit={() => onStartEdit(item.id)}
          onSubmitCorrection={corrected => onSubmitCorrection(item.id, corrected)}
          onCancelEdit={onCancelEdit}
          onDismiss={() => onDismiss(item.id)}
        />
      ))}
    </section>
  )
}

export default function ReviewQueueScreen({ job, onClose }: { job: Job; onClose: () => void }) {
  const [queue, setQueue] = useState<ReviewQueue | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})

  const loadQueue = useCallback(() => {
    setLoadState('loading')
    getReviewQueue(job.id)
      .then(q => { setQueue(q); setLoadState('ready') })
      .catch(() => setLoadState('error'))
  }, [job.id])

  useEffect(() => { loadQueue() }, [loadQueue])

  const handleDecision = useCallback(async (
    itemId: string,
    action: QueueDecisionAction,
    corrected?: ProposedMemory,
  ) => {
    if (!queue) return
    setSubmittingId(itemId)
    setItemErrors(e => { const n = { ...e }; delete n[itemId]; return n })
    try {
      const result = await submitQueueDecision(job.id, {
        queueItemId: itemId,
        action,
        corrected,
        reason: action === 'dismiss' ? 'Not about this job' : undefined,
      })
      setQueue(q => {
        if (!q) return q
        return {
          ...q,
          sections: q.sections.map(s => ({
            ...s,
            items: s.items.map(it => it.id !== itemId ? it : {
              ...it,
              status: result.status,
              ...(corrected ? { summary: corrected.summary, proposedMemory: corrected } : {}),
            }),
          })),
        }
      })
      if (editingItemId === itemId) setEditingItemId(null)
    } catch {
      setItemErrors(e => ({ ...e, [itemId]: 'Could not save — tap to retry' }))
    } finally {
      setSubmittingId(null)
    }
  }, [queue, job.id, editingItemId])

  const hasDraftItems = queue
    ? queue.sections.some(s => s.items.some(it => it.status === 'draft'))
    : false

  const isEmpty = queue
    ? queue.sections.every(s => s.items.length === 0) && queue.alreadyRemembered.length === 0
    : false

  return (
    <div className="queue-page">
      <header className="queue-header">
        <button className="btn-queue-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <h1 className="queue-title">Things to check</h1>
      </header>

      <div className="queue-job-label">{job.title}</div>

      {loadState === 'loading' && (
        <p className="queue-loading">Loading…</p>
      )}

      {loadState === 'error' && (
        <div className="queue-load-error">
          <p>Could not load your queue.</p>
          <button className="btn-queue-retry" onClick={loadQueue}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && queue && (
        <>
          {isEmpty && (
            <p className="queue-empty">Nothing to check right now.</p>
          )}

          {!isEmpty && !hasDraftItems && queue.alreadyRemembered.length > 0 && (
            <p className="queue-empty">All items reviewed.</p>
          )}

          <AlreadyRememberedSection items={queue.alreadyRemembered} />

          {queue.sections.map(section => (
            <SectionBlock
              key={section.key}
              section={section}
              editingItemId={editingItemId}
              submittingId={submittingId}
              itemErrors={itemErrors}
              onConfirm={id => handleDecision(id, 'confirm')}
              onStartEdit={id => setEditingItemId(id)}
              onSubmitCorrection={(id, corrected) => handleDecision(id, 'correct', corrected)}
              onCancelEdit={() => setEditingItemId(null)}
              onDismiss={id => handleDecision(id, 'dismiss')}
            />
          ))}
        </>
      )}
    </div>
  )
}
