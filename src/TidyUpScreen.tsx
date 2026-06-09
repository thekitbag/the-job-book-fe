import { useCallback, useEffect, useState } from 'react'
import { createOrGetTidyUp, getTodayLocalDate, submitTidyUpDecision } from './api'
import type {
  AlreadyRememberedItem,
  Job,
  MemoryType,
  ProposedMemory,
  TidyUpDecisionAction,
  TidyUpItem,
  TidyUpRun,
  TidyUpSection,
} from './types'

// 'unclear' is intentionally absent — trusted memory must be a concrete type.
const MEMORY_TYPE_OPTIONS: { value: MemoryType; label: string }[] = [
  { value: 'used_material', label: 'Used material' },
  { value: 'ordered_material', label: 'Ordered material' },
  { value: 'leftover_material', label: 'Leftover material' },
  { value: 'supplier_delivery_note', label: 'Supplier / delivery note' },
  { value: 'customer_change', label: 'Customer change' },
  { value: 'watch_out', label: 'Watch out' },
]

function SourceContextList({ contexts }: { contexts: TidyUpItem['sourceContext'] }) {
  if (contexts.length === 0) {
    return <p className="tidy-source-unavailable">Source unavailable</p>
  }
  return (
    <ul className="tidy-source-list">
      {contexts.map(ctx => (
        <li key={ctx.candidateFactId} className="tidy-source-item">
          {ctx.transcriptText
            ? <p className="tidy-source-text">"{ctx.transcriptText}"</p>
            : <p className="tidy-source-unavailable">Source unavailable</p>}
        </li>
      ))}
    </ul>
  )
}

function ItemKindBadge({ item }: { item: TidyUpItem }) {
  if (item.kind === 'single') return null
  const cls =
    item.kind === 'contradiction'
      ? 'tidy-kind-badge tidy-kind-badge--contradiction'
      : item.kind === 'duplicate_group'
        ? 'tidy-kind-badge tidy-kind-badge--duplicate'
        : 'tidy-kind-badge tidy-kind-badge--unclear'
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
      className="tidy-edit-form"
      aria-label="Edit correction"
      onSubmit={e => { e.preventDefault(); onSubmit(form) }}
    >
      <label className="tidy-field">
        <span className="tidy-field-label">Type</span>
        <select
          className="tidy-field-input"
          value={form.memoryType}
          onChange={e => setType(e.target.value)}
        >
          {MEMORY_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="tidy-field">
        <span className="tidy-field-label">Summary</span>
        <input
          className="tidy-field-input"
          value={form.summary}
          onChange={e => setStr('summary', e.target.value)}
          required
        />
      </label>
      <label className="tidy-field">
        <span className="tidy-field-label">Material</span>
        <input
          className="tidy-field-input"
          value={form.materialName ?? ''}
          onChange={e => setStr('materialName', e.target.value)}
        />
      </label>
      <label className="tidy-field">
        <span className="tidy-field-label">Quantity</span>
        <input
          className="tidy-field-input"
          value={form.quantity ?? ''}
          onChange={e => setStr('quantity', e.target.value)}
        />
      </label>
      <label className="tidy-field">
        <span className="tidy-field-label">Unit</span>
        <input
          className="tidy-field-input"
          value={form.unit ?? ''}
          onChange={e => setStr('unit', e.target.value)}
        />
      </label>
      <label className="tidy-field">
        <span className="tidy-field-label">Supplier</span>
        <input
          className="tidy-field-input"
          value={form.supplierName ?? ''}
          onChange={e => setStr('supplierName', e.target.value)}
        />
      </label>
      <label className="tidy-field">
        <span className="tidy-field-label">Delivery timing</span>
        <input
          className="tidy-field-input"
          value={form.deliveryTiming ?? ''}
          onChange={e => setStr('deliveryTiming', e.target.value)}
        />
      </label>
      <label className="tidy-field">
        <span className="tidy-field-label">Location / use</span>
        <input
          className="tidy-field-input"
          value={form.locationOrUse ?? ''}
          onChange={e => setStr('locationOrUse', e.target.value)}
        />
      </label>
      <div className="tidy-edit-actions">
        <button type="submit" className="btn-tidy-save" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" className="btn-tidy-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function TidyItemCard({
  item,
  isEditing,
  submitting,
  errorMsg,
  onConfirm,
  onStartEdit,
  onSubmitCorrection,
  onCancelEdit,
  onReject,
  onLeave,
}: {
  item: TidyUpItem
  isEditing: boolean
  submitting: boolean
  errorMsg: string | null
  onConfirm: () => void
  onStartEdit: () => void
  onSubmitCorrection: (corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onReject: () => void
  onLeave: () => void
}) {
  const resolved = item.status !== 'draft'

  return (
    <div
      className={`tidy-item-card tidy-item-card--${item.status}`}
      data-testid={`tidy-item-${item.id}`}
    >
      <ItemKindBadge item={item} />
      <p className="tidy-item-summary">{item.summary}</p>

      {!resolved && <SourceContextList contexts={item.sourceContext} />}

      {resolved && item.status === 'confirmed' && (
        <p className="tidy-item-resolved tidy-item-resolved--saved">Saved to trusted memory</p>
      )}
      {resolved && item.status === 'corrected' && (
        <p className="tidy-item-resolved tidy-item-resolved--saved">Saved to trusted memory</p>
      )}
      {resolved && item.status === 'rejected' && (
        <p className="tidy-item-resolved tidy-item-resolved--rejected">Not saved</p>
      )}
      {resolved && item.status === 'left_unconfirmed' && (
        <p className="tidy-item-resolved tidy-item-resolved--later">Left for later</p>
      )}

      {!resolved && !isEditing && (
        <div className="tidy-item-actions">
          <button
            className="btn-tidy-remember"
            onClick={onConfirm}
            disabled={submitting}
            aria-label="Remember this"
          >
            {submitting ? 'Saving…' : 'Remember this'}
          </button>
          <button
            className="btn-tidy-correct"
            onClick={onStartEdit}
            disabled={submitting}
          >
            Correct
          </button>
          <button
            className="btn-tidy-reject"
            onClick={onReject}
            disabled={submitting}
          >
            Not this job
          </button>
          <button
            className="btn-tidy-leave"
            onClick={onLeave}
            disabled={submitting}
          >
            Leave for later
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

      {errorMsg && (
        <p className="tidy-item-error" role="alert">{errorMsg}</p>
      )}
    </div>
  )
}

function AlreadyRememberedSection({ items }: { items: AlreadyRememberedItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="tidy-already-remembered" role="region" aria-label="Already remembered">
      <p className="tidy-already-remembered-heading">Already remembered</p>
      <ul className="tidy-remembered-list">
        {items.map(m => (
          <li key={m.memoryItemId} className="tidy-remembered-item">
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
  onReject,
  onLeave,
}: {
  section: TidyUpSection
  editingItemId: string | null
  submittingId: string | null
  itemErrors: Record<string, string>
  onConfirm: (id: string) => void
  onStartEdit: (id: string) => void
  onSubmitCorrection: (id: string, corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onReject: (id: string) => void
  onLeave: (id: string) => void
}) {
  if (section.items.length === 0) return null
  return (
    <section className="tidy-section">
      <h2 className="tidy-section-heading">{section.label}</h2>
      {section.items.map(item => (
        <TidyItemCard
          key={item.id}
          item={item}
          isEditing={editingItemId === item.id}
          submitting={submittingId === item.id}
          errorMsg={itemErrors[item.id] ?? null}
          onConfirm={() => onConfirm(item.id)}
          onStartEdit={() => onStartEdit(item.id)}
          onSubmitCorrection={corrected => onSubmitCorrection(item.id, corrected)}
          onCancelEdit={onCancelEdit}
          onReject={() => onReject(item.id)}
          onLeave={() => onLeave(item.id)}
        />
      ))}
    </section>
  )
}

export default function TidyUpScreen({ job, onClose }: { job: Job; onClose: () => void }) {
  const [run, setRun] = useState<TidyUpRun | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})

  const localDate = getTodayLocalDate()

  const loadTidyUp = useCallback(() => {
    setLoadState('loading')
    createOrGetTidyUp(job.id, localDate)
      .then(r => { setRun(r); setLoadState('ready') })
      .catch(() => setLoadState('error'))
  }, [job.id, localDate])

  useEffect(() => { loadTidyUp() }, [loadTidyUp])

  const handleDecision = useCallback(async (
    itemId: string,
    action: TidyUpDecisionAction,
    corrected?: ProposedMemory,
    reason?: string,
  ) => {
    if (!run) return
    setSubmittingId(itemId)
    setItemErrors(e => { const n = { ...e }; delete n[itemId]; return n })
    try {
      const result = await submitTidyUpDecision(job.id, {
        tidyUpItemId: itemId,
        action,
        corrected,
        reason,
      })
      setRun(r => {
        if (!r) return r
        return {
          ...r,
          sections: r.sections.map(s => ({
            ...s,
            items: s.items.map(it => it.id === itemId ? { ...it, status: result.status } : it),
          })),
        }
      })
      if (editingItemId === itemId) {
        setEditingItemId(null)
      }
    } catch {
      setItemErrors(e => ({ ...e, [itemId]: 'Could not save — tap to retry' }))
    } finally {
      setSubmittingId(null)
    }
  }, [run, job.id, editingItemId])

  const handleStartEdit = useCallback((itemId: string) => {
    setEditingItemId(itemId)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingItemId(null)
  }, [])

  const hasDraftItems = run
    ? run.sections.some(s => s.items.some(it => it.status === 'draft'))
    : false

  const allSectionsEmpty = run
    ? run.sections.every(s => s.items.length === 0)
    : false

  return (
    <div className="tidy-page">
      <header className="tidy-header">
        <button className="btn-tidy-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <h1 className="tidy-title">Today's tidy-up</h1>
      </header>

      <div className="tidy-job-label">{job.title}</div>

      {loadState === 'loading' && (
        <p className="tidy-loading">Loading today's tidy-up…</p>
      )}

      {loadState === 'error' && (
        <div className="tidy-load-error">
          <p>Could not load today's tidy-up.</p>
          <button className="btn-tidy-retry" onClick={loadTidyUp}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && run && (
        <>
          <AlreadyRememberedSection items={run.alreadyRemembered} />

          {(allSectionsEmpty || !hasDraftItems) && run.alreadyRemembered.length === 0 && (
            <p className="tidy-empty">Nothing to tidy up for today.</p>
          )}

          {allSectionsEmpty && !hasDraftItems && run.alreadyRemembered.length > 0 && (
            <p className="tidy-empty">All done for today.</p>
          )}

          {run.sections.map(section => (
            <SectionBlock
              key={section.key}
              section={section}
              editingItemId={editingItemId}
              submittingId={submittingId}
              itemErrors={itemErrors}
              onConfirm={id => handleDecision(id, 'confirm')}
              onStartEdit={handleStartEdit}
              onSubmitCorrection={(id, corrected) => handleDecision(id, 'correct', corrected)}
              onCancelEdit={handleCancelEdit}
              onReject={id => handleDecision(id, 'reject', undefined, 'Not about this job')}
              onLeave={id => handleDecision(id, 'leave_unconfirmed')}
            />
          ))}
        </>
      )}
    </div>
  )
}
