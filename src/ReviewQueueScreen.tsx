import { useCallback, useEffect, useState } from 'react'
import { getReviewQueue, submitQueueDecision } from './api'
import type {
  AlreadyRememberedItem,
  Job,
  MemoryType,
  ProposedMemory,
  QueueDecisionAction,
  QueueItem,
  QueueSection,
  ReviewQueue,
} from './types'

const MEMORY_TYPE_OPTIONS: { value: MemoryType; label: string }[] = [
  { value: 'used_material', label: 'Used material' },
  { value: 'ordered_material', label: 'Ordered material' },
  { value: 'leftover_material', label: 'Leftover material' },
  { value: 'supplier_delivery_note', label: 'Supplier / delivery note' },
  { value: 'customer_change', label: 'Customer change' },
  { value: 'watch_out', label: 'Watch out' },
]

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
  const setStr = (k: Exclude<keyof ProposedMemory, 'memoryType'>, v: string) =>
    setForm(f => ({ ...f, [k]: v || null }))
  const setType = (v: string) =>
    setForm(f => ({ ...f, memoryType: v as MemoryType }))

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

  return (
    <div
      className={`queue-item-card queue-item-card--${item.status}`}
      data-testid={`queue-item-${item.id}`}
    >
      <div className="queue-item-top">
        <ItemKindBadge item={item} />
        {item.timeLabel && <span className="queue-time-label">{item.timeLabel}</span>}
      </div>

      <p className="queue-item-summary">{item.summary}</p>

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

function AlreadyRememberedSection({ items }: { items: AlreadyRememberedItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="queue-already-remembered" role="region" aria-label="Already remembered">
      <p className="queue-remembered-heading">Already remembered</p>
      <ul className="queue-remembered-list">
        {items.map(m => (
          <li key={m.memoryItemId} className="queue-remembered-item">
            {m.timeLabel && <span className="queue-remembered-time">{m.timeLabel} · </span>}
            {m.summary}
          </li>
        ))}
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
            items: s.items.map(it => it.id === itemId ? { ...it, status: result.status } : it),
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
