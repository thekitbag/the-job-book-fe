import { useCallback, useEffect, useState } from 'react'
import { getReviewQueue, submitQueueDecision, updateMemoryItem } from './api'
import MemoryEditForm from './MemoryEditForm'
import { applyEditToRemembered, rememberedItemToEdit } from './memoryEdit'
import { formatCostLabel, formatTotalLabel, MEMORY_TYPE_TO_SECTION_KEY } from './memoryScan'
import type {
  AlreadyRememberedItem,
  CostQualifier,
  Job,
  MemoryItemEdit,
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

// Plain builder labels for the category focus chips, keyed by section key.
const SECTION_CHIP_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered',
  used_materials: 'Used',
  leftovers: 'Left over',
  supplier_delivery_notes: 'Supplier notes',
  customer_changes: 'Changes',
  watch_outs: 'Watch-outs',
  unclear_items: 'Unclear',
}

const chipLabel = (s: QueueSection) => SECTION_CHIP_LABELS[s.key] ?? s.label
const draftCount = (s: QueueSection) => s.items.filter(it => it.status === 'draft').length

// MEMORY_TYPE_TO_SECTION_KEY (shared) maps memoryType → section key so
// already-remembered context can follow the active category focus.

function CategoryChips({
  sections,
  totalPending,
  focusedKey,
  onFocus,
}: {
  sections: QueueSection[]
  totalPending: number
  focusedKey: string | null
  onFocus: (key: string | null) => void
}) {
  return (
    <div className="queue-cat-chips" role="group" aria-label="Focus a category">
      {/* Label + count render as a single text node so the count chips never
          collide with the remembered type chips (e.g. exact text "Ordered"). */}
      <button
        type="button"
        className={`queue-cat-chip${focusedKey === null ? ' queue-cat-chip--active' : ''}`}
        aria-pressed={focusedKey === null}
        onClick={() => onFocus(null)}
      >
        All <span className="queue-cat-chip-count">{totalPending}</span>
      </button>
      {sections.map(s => {
        const count = draftCount(s)
        return (
          <button
            key={s.key}
            type="button"
            className={`queue-cat-chip${focusedKey === s.key ? ' queue-cat-chip--active' : ''}${count === 0 ? ' queue-cat-chip--empty' : ''}`}
            aria-pressed={focusedKey === s.key}
            onClick={() => onFocus(s.key)}
          >
            {chipLabel(s)} <span className="queue-cat-chip-count">{count}</span>
          </button>
        )
      })}
    </div>
  )
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
        <span className="queue-field-label">Material</span>
        <input className="queue-field-input" name="materialName" value={form.materialName ?? ''} onChange={e => setStr('materialName', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Quantity</span>
        <input className="queue-field-input" name="quantity" value={form.quantity ?? ''} onChange={e => setStr('quantity', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Unit</span>
        <input className="queue-field-input" name="unit" value={form.unit ?? ''} onChange={e => setStr('unit', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Supplier</span>
        <input className="queue-field-input" name="supplierName" value={form.supplierName ?? ''} onChange={e => setStr('supplierName', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Delivery timing</span>
        <input className="queue-field-input" name="deliveryTiming" value={form.deliveryTiming ?? ''} onChange={e => setStr('deliveryTiming', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Location / use</span>
        <input className="queue-field-input" name="locationOrUse" value={form.locationOrUse ?? ''} onChange={e => setStr('locationOrUse', e.target.value)} />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Cost amount</span>
        <input className="queue-field-input" name="costAmount" value={form.costAmount ?? ''} onChange={e => setStr('costAmount', e.target.value)} placeholder="e.g. 5.00" />
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
        <input className="queue-field-input" name="totalCostAmount" value={form.totalCostAmount ?? ''} onChange={e => setStr('totalCostAmount', e.target.value)} placeholder="e.g. 40" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Summary (optional)</span>
        <input className="queue-field-input queue-field-summary" name="summary" value={form.summary} onChange={e => setStr('summary', e.target.value)} />
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

function RememberedCard({
  item,
  isEditing,
  submitting,
  errorMsg,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  item: AlreadyRememberedItem
  isEditing: boolean
  submitting: boolean
  errorMsg: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
}) {
  const typeLabel = MEMORY_TYPE_OPTIONS.find(o => o.value === item.memoryType)?.shortLabel ?? item.memoryType

  if (isEditing) {
    return (
      <li className="queue-remembered-card queue-remembered-card--editing">
        <MemoryEditForm initial={rememberedItemToEdit(item)} submitting={submitting} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </li>
    )
  }

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
      <div className="queue-remembered-card-footer">
        <button type="button" className="btn-mem-fix" onClick={onStartEdit}>Fix memory</button>
      </div>
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </li>
  )
}

function AlreadyRememberedSection({
  items,
  focusedKey,
  editingId,
  submittingId,
  itemErrors,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  items: AlreadyRememberedItem[]
  focusedKey: string | null
  editingId: string | null
  submittingId: string | null
  itemErrors: Record<string, string>
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (id: string, edit: MemoryItemEdit) => void
}) {
  const [open, setOpen] = useState(false)
  // Already-remembered context follows the active category focus
  const shown = focusedKey === null
    ? items
    : items.filter(m => MEMORY_TYPE_TO_SECTION_KEY[m.memoryType] === focusedKey)
  if (shown.length === 0) return null
  return (
    <div className="queue-already-remembered" role="region" aria-label="Already remembered">
      <p className="queue-remembered-heading">Already remembered</p>
      <button
        type="button"
        className="queue-remembered-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? 'Hide remembered items' : `Show remembered items (${shown.length})`}
      </button>
      {open && (
        <ul className="queue-remembered-list">
          {shown.map(m => (
            <RememberedCard
              key={m.memoryItemId}
              item={m}
              isEditing={editingId === m.memoryItemId}
              submitting={submittingId === m.memoryItemId}
              errorMsg={itemErrors[m.memoryItemId] ?? null}
              onStartEdit={() => onStartEdit(m.memoryItemId)}
              onCancelEdit={onCancelEdit}
              onSave={edit => onSave(m.memoryItemId, edit)}
            />
          ))}
        </ul>
      )}
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
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  // Remembered-memory ("Fix memory") edit state — separate from draft review state
  const [editingMemId, setEditingMemId] = useState<string | null>(null)
  const [memSubmittingId, setMemSubmittingId] = useState<string | null>(null)
  const [memErrors, setMemErrors] = useState<Record<string, string>>({})

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

  // Correct an already-remembered (trusted) item in place via the same
  // updateMemoryItem path used in Job memory. Never re-queues the item.
  const handleSaveRemembered = useCallback(async (memoryItemId: string, edit: MemoryItemEdit) => {
    setMemSubmittingId(memoryItemId)
    setMemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      const updated = await updateMemoryItem(job.id, memoryItemId, edit)
      setQueue(q => {
        if (!q) return q
        return {
          ...q,
          alreadyRemembered: q.alreadyRemembered.map(m =>
            m.memoryItemId === memoryItemId ? applyEditToRemembered(m, updated) : m),
        }
      })
      setEditingMemId(null)
    } catch {
      setMemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setMemSubmittingId(null)
    }
  }, [job.id])

  const totalPending = queue
    ? queue.sections.reduce((n, s) => n + draftCount(s), 0)
    : 0

  const isEmpty = queue
    ? queue.sections.every(s => s.items.length === 0) && queue.alreadyRemembered.length === 0
    : false

  // Keep focus stable across actions; only reset if the focused category
  // disappears entirely from the queue (it never does mid-session here).
  const focusedSection = focusedKey
    ? queue?.sections.find(s => s.key === focusedKey) ?? null
    : null
  const focusedEmpty = focusedKey !== null && (!focusedSection || focusedSection.items.length === 0)
  const visibleSections = focusedKey === null
    ? (queue?.sections ?? [])
    : (focusedSection ? [focusedSection] : [])

  const pendingLabel = totalPending === 0 ? 'Nothing waiting' : `${totalPending} waiting`

  return (
    <div className="queue-page">
      <header className="queue-header">
        <button className="btn-queue-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <h1 className="queue-title">Things to check</h1>
      </header>

      <div className="queue-subhead">
        <span className="queue-job-label">{job.title}</span>
        {loadState === 'ready' && !isEmpty && (
          <span
            className={`queue-pending-total${totalPending === 0 ? ' queue-pending-total--none' : ''}`}
            aria-live="polite"
          >
            {pendingLabel}
          </span>
        )}
      </div>

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
          {isEmpty ? (
            <div className="queue-empty">
              <p className="queue-empty-title">Nothing waiting</p>
              <p className="queue-empty-sub">
                Useful facts will appear here to check after you record on this job.
              </p>
              <button className="btn-queue-retry" onClick={onClose}>Back to job</button>
            </div>
          ) : (
            <>
              <CategoryChips
                sections={queue.sections}
                totalPending={totalPending}
                focusedKey={focusedKey}
                onFocus={setFocusedKey}
              />

              {/* Pending draft facts come first */}
              {focusedEmpty ? (
                <p className="queue-empty-category">Nothing waiting here</p>
              ) : (
                visibleSections.map(section => (
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
                ))
              )}

              {/* Already remembered is confirmed-memory context, below pending work,
                  follows the active category focus, and is correctable in place */}
              <AlreadyRememberedSection
                items={queue.alreadyRemembered}
                focusedKey={focusedKey}
                editingId={editingMemId}
                submittingId={memSubmittingId}
                itemErrors={memErrors}
                onStartEdit={setEditingMemId}
                onCancelEdit={() => setEditingMemId(null)}
                onSave={handleSaveRemembered}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
