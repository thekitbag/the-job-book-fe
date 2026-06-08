import { FormEvent, useCallback, useEffect, useState } from 'react'
import { getReviewDraft, submitReviewDecision } from './api'
import type { CorrectionFields, Job, ReviewDraftItem, ReviewDraftSection } from './types'

type ItemOutcome = 'confirmed' | 'rejected'

// ── Edit form ────────────────────────────────────────────────────────────────

function EditForm({
  item,
  onSave,
  onCancel,
  submitting,
}: {
  item: ReviewDraftItem
  onSave: (c: CorrectionFields) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [summary, setSummary] = useState(item.summary)
  const [materialName, setMaterialName] = useState(item.materialName ?? '')
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [unit, setUnit] = useState(item.unit ?? '')
  const [supplierName, setSupplierName] = useState(item.supplierName ?? '')
  const [deliveryTiming, setDeliveryTiming] = useState(item.deliveryTiming ?? '')
  const [locationOrUse, setLocationOrUse] = useState(item.locationOrUse ?? '')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave({
      summary: summary.trim() || item.summary,
      materialName: materialName.trim() || null,
      quantity: quantity.trim() || null,
      unit: unit.trim() || null,
      supplierName: supplierName.trim() || null,
      deliveryTiming: deliveryTiming.trim() || null,
      locationOrUse: locationOrUse.trim() || null,
    })
  }

  return (
    <form className="edit-form" onSubmit={handleSubmit}>
      <label className="edit-field">
        <span className="edit-field-label">Summary</span>
        <textarea
          className="edit-summary"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          required
          rows={2}
        />
      </label>
      <div className="edit-fields-grid">
        <label className="edit-field">
          <span className="edit-field-label">Material</span>
          <input value={materialName} onChange={e => setMaterialName(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Quantity</span>
          <input value={quantity} onChange={e => setQuantity(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Unit</span>
          <input value={unit} onChange={e => setUnit(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Supplier</span>
          <input value={supplierName} onChange={e => setSupplierName(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Delivery timing</span>
          <input value={deliveryTiming} onChange={e => setDeliveryTiming(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Location / use</span>
          <input value={locationOrUse} onChange={e => setLocationOrUse(e.target.value)} />
        </label>
      </div>
      <div className="edit-actions">
        <button type="submit" className="btn-save" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Add missing form ─────────────────────────────────────────────────────────

function AddMissingForm({
  onSave,
  onCancel,
  submitting,
  error,
}: {
  onSave: (c: CorrectionFields) => void
  onCancel: () => void
  submitting: boolean
  error: string | null
}) {
  const [summary, setSummary] = useState('')
  const [materialName, setMaterialName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [deliveryTiming, setDeliveryTiming] = useState('')
  const [locationOrUse, setLocationOrUse] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave({
      summary: summary.trim(),
      materialName: materialName.trim() || null,
      quantity: quantity.trim() || null,
      unit: unit.trim() || null,
      supplierName: supplierName.trim() || null,
      deliveryTiming: deliveryTiming.trim() || null,
      locationOrUse: locationOrUse.trim() || null,
    })
  }

  return (
    <form className="add-missing-form" onSubmit={handleSubmit} aria-label="Add missing item">
      <h3 className="add-missing-title">Add missing item</h3>
      <label className="edit-field">
        <span className="edit-field-label">Summary</span>
        <textarea
          className="edit-summary"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Describe what to remember"
          required
          rows={2}
        />
      </label>
      <div className="edit-fields-grid">
        <label className="edit-field">
          <span className="edit-field-label">Material</span>
          <input value={materialName} onChange={e => setMaterialName(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Quantity</span>
          <input value={quantity} onChange={e => setQuantity(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Unit</span>
          <input value={unit} onChange={e => setUnit(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Supplier</span>
          <input value={supplierName} onChange={e => setSupplierName(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Delivery timing</span>
          <input value={deliveryTiming} onChange={e => setDeliveryTiming(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-field-label">Location / use</span>
          <input value={locationOrUse} onChange={e => setLocationOrUse(e.target.value)} />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="edit-actions">
        <button type="submit" className="btn-save" disabled={submitting || !summary.trim()}>
          {submitting ? 'Saving…' : 'Save to memory'}
        </button>
        <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Review item ──────────────────────────────────────────────────────────────

function ReviewItem({
  item,
  outcome,
  editing,
  itemSubmitting,
  error,
  onConfirm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onReject,
}: {
  item: ReviewDraftItem
  outcome: ItemOutcome | undefined
  editing: boolean
  itemSubmitting: boolean
  error: string | undefined
  onConfirm: () => void
  onStartEdit: () => void
  onSaveEdit: (c: CorrectionFields) => void
  onCancelEdit: () => void
  onReject: () => void
}) {
  if (outcome === 'rejected') return null

  if (outcome === 'confirmed') {
    return (
      <div className="review-item review-item--confirmed">
        <p className="review-item-summary">{item.summary}</p>
        <p className="memory-badge">Saved to trusted memory</p>
      </div>
    )
  }

  const showBadge =
    item.status === 'unclear' ||
    item.factType === 'unclear' ||
    item.confidenceLabel === 'low' ||
    item.confidenceLabel === 'medium' ||
    item.uncertaintyFlags.length > 0

  const badgeText =
    item.status === 'unclear' || item.factType === 'unclear'
      ? 'Unclear'
      : item.confidenceLabel === 'low'
      ? 'Low confidence'
      : 'Needs checking'

  return (
    <div className="review-item">
      {showBadge && <span className="review-item-badge">{badgeText}</span>}
      <p className="review-item-summary">{item.summary}</p>
      <div className="review-item-source">
        <span className="review-item-source-label">From what the system heard</span>
        {item.sourceTranscript
          ? <p className="review-item-source-text">{item.sourceTranscript}</p>
          : <p className="review-item-source-unavailable">Source not available</p>
        }
      </div>
      {editing ? (
        <EditForm
          item={item}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
          submitting={itemSubmitting}
        />
      ) : (
        <div className="review-item-actions">
          <button className="btn-confirm" onClick={onConfirm} disabled={itemSubmitting}>
            Confirm
          </button>
          <button className="btn-edit" onClick={onStartEdit} disabled={itemSubmitting}>
            Edit
          </button>
          <button className="btn-reject" onClick={onReject} disabled={itemSubmitting}>
            Reject
          </button>
        </div>
      )}
      {error && <p className="review-item-error">{error}</p>}
    </div>
  )
}

// ── Review section ───────────────────────────────────────────────────────────

function ReviewSectionView({
  section,
  outcomes,
  editingId,
  itemSubmitting,
  itemErrors,
  sectionSubmitting,
  sectionError,
  onConfirmItem,
  onStartEditItem,
  onSaveEditItem,
  onCancelEditItem,
  onRejectItem,
  onConfirmSection,
}: {
  section: ReviewDraftSection
  outcomes: Record<string, ItemOutcome>
  editingId: string | null
  itemSubmitting: Record<string, boolean>
  itemErrors: Record<string, string>
  sectionSubmitting: boolean
  sectionError: string | undefined
  onConfirmItem: (id: string) => void
  onStartEditItem: (id: string) => void
  onSaveEditItem: (id: string, c: CorrectionFields) => void
  onCancelEditItem: () => void
  onRejectItem: (id: string) => void
  onConfirmSection: (key: string, ids: string[]) => void
}) {
  const isUnclearSection = section.key === 'unclear'
  const undecidedItems = section.items.filter(i => !outcomes[i.id])

  return (
    <div className="review-section" data-section-key={section.key}>
      <h2 className="review-section-title">{section.label}</h2>
      <ul className="review-item-list" aria-label={section.label}>
        {section.items.map(item => (
          <li key={item.id}>
            <ReviewItem
              item={item}
              outcome={outcomes[item.id]}
              editing={editingId === item.id}
              itemSubmitting={itemSubmitting[item.id] ?? false}
              error={itemErrors[item.id]}
              onConfirm={() => onConfirmItem(item.id)}
              onStartEdit={() => onStartEditItem(item.id)}
              onSaveEdit={c => onSaveEditItem(item.id, c)}
              onCancelEdit={onCancelEditItem}
              onReject={() => onRejectItem(item.id)}
            />
          </li>
        ))}
      </ul>
      {!isUnclearSection && undecidedItems.length > 0 && (
        <div className="section-confirm-row">
          {sectionError && <p className="section-error">{sectionError}</p>}
          <button
            className="btn-confirm-section"
            onClick={() => onConfirmSection(section.key, undecidedItems.map(i => i.id))}
            disabled={sectionSubmitting}
          >
            {sectionSubmitting ? 'Confirming…' : 'Confirm section'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── ReviewScreen ─────────────────────────────────────────────────────────────

export default function ReviewScreen({
  job,
  onClose,
}: {
  job: Job
  onClose: () => void
}) {
  const [sections, setSections] = useState<ReviewDraftSection[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [outcomes, setOutcomes] = useState<Record<string, ItemOutcome>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [itemSubmitting, setItemSubmitting] = useState<Record<string, boolean>>({})
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [sectionSubmitting, setSectionSubmitting] = useState<Record<string, boolean>>({})
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  const [showAddMissing, setShowAddMissing] = useState(false)
  const [addMissingSubmitting, setAddMissingSubmitting] = useState(false)
  const [addMissingError, setAddMissingError] = useState<string | null>(null)

  const fetchDraft = useCallback(() => {
    setLoadState('loading')
    getReviewDraft(job.id)
      .then(data => { setSections(data); setLoadState('ready') })
      .catch(() => setLoadState('error'))
  }, [job.id])

  useEffect(() => { fetchDraft() }, [fetchDraft])

  const markItemSubmitting = (id: string, val: boolean) =>
    setItemSubmitting(s => ({ ...s, [id]: val }))

  const setItemError = (id: string, msg: string) =>
    setItemErrors(e => ({ ...e, [id]: msg }))

  const clearItemError = (id: string) =>
    setItemErrors(e => { const n = { ...e }; delete n[id]; return n })

  const handleConfirmItem = useCallback(async (factId: string) => {
    clearItemError(factId)
    markItemSubmitting(factId, true)
    try {
      await submitReviewDecision(job.id, { action: 'confirm', factId })
      setOutcomes(o => ({ ...o, [factId]: 'confirmed' }))
    } catch {
      setItemError(factId, 'Could not confirm — tap to retry')
    } finally {
      markItemSubmitting(factId, false)
    }
  }, [job.id])

  const handleSaveEdit = useCallback(async (factId: string, correction: CorrectionFields) => {
    clearItemError(factId)
    markItemSubmitting(factId, true)
    try {
      await submitReviewDecision(job.id, { action: 'correct', factId, correction })
      setOutcomes(o => ({ ...o, [factId]: 'confirmed' }))
      setEditingId(null)
    } catch {
      setItemError(factId, 'Could not save — tap to retry')
    } finally {
      markItemSubmitting(factId, false)
    }
  }, [job.id])

  const handleRejectItem = useCallback(async (factId: string) => {
    clearItemError(factId)
    markItemSubmitting(factId, true)
    try {
      await submitReviewDecision(job.id, { action: 'reject', factId })
      setOutcomes(o => ({ ...o, [factId]: 'rejected' }))
    } catch {
      setItemError(factId, 'Could not reject — tap to retry')
    } finally {
      markItemSubmitting(factId, false)
    }
  }, [job.id])

  const handleConfirmSection = useCallback(async (sectionKey: string, sectionItemIds: string[]) => {
    setSectionErrors(e => { const n = { ...e }; delete n[sectionKey]; return n })
    setSectionSubmitting(s => ({ ...s, [sectionKey]: true }))
    try {
      await submitReviewDecision(job.id, { action: 'confirm_section', sectionKey, sectionItemIds })
      setOutcomes(o => {
        const next = { ...o }
        sectionItemIds.forEach(id => { next[id] = 'confirmed' })
        return next
      })
    } catch {
      setSectionErrors(e => ({ ...e, [sectionKey]: 'Could not confirm section — tap to retry' }))
    } finally {
      setSectionSubmitting(s => ({ ...s, [sectionKey]: false }))
    }
  }, [job.id])

  const handleAddMissing = useCallback(async (correction: CorrectionFields) => {
    setAddMissingError(null)
    setAddMissingSubmitting(true)
    try {
      await submitReviewDecision(job.id, { action: 'add_missing', correction })
      setShowAddMissing(false)
    } catch {
      setAddMissingError('Could not save — tap to retry')
    } finally {
      setAddMissingSubmitting(false)
    }
  }, [job.id])

  if (loadState === 'loading') {
    return (
      <div className="review-page">
        <header className="review-header">
          <button className="review-back-btn" onClick={onClose}>← Back</button>
          <h1 className="review-title">Review draft facts</h1>
        </header>
        <p className="review-loading">Loading…</p>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="review-page">
        <header className="review-header">
          <button className="review-back-btn" onClick={onClose}>← Back</button>
          <h1 className="review-title">Review draft facts</h1>
        </header>
        <div className="review-fetch-error">
          <p>Could not load draft facts.</p>
          <button className="btn-retry-fetch" onClick={fetchDraft}>Try again</button>
        </div>
      </div>
    )
  }

  const hasAnyItems = sections.some(s => s.items.length > 0)

  return (
    <div className="review-page">
      <header className="review-header">
        <button className="review-back-btn" onClick={onClose}>← Back</button>
        <h1 className="review-title">Review draft facts</h1>
      </header>

      <div className="review-body">
        <p className="review-trust-note">
          Draft — confirm or edit to save to trusted memory
        </p>

        {!hasAnyItems && (
          <p className="review-empty">No draft facts to review.</p>
        )}

        {sections.map(section =>
          section.items.length === 0 ? null : (
            <ReviewSectionView
              key={section.key}
              section={section}
              outcomes={outcomes}
              editingId={editingId}
              itemSubmitting={itemSubmitting}
              itemErrors={itemErrors}
              sectionSubmitting={sectionSubmitting[section.key] ?? false}
              sectionError={sectionErrors[section.key]}
              onConfirmItem={handleConfirmItem}
              onStartEditItem={id => { clearItemError(id); setEditingId(id) }}
              onSaveEditItem={handleSaveEdit}
              onCancelEditItem={() => setEditingId(null)}
              onRejectItem={handleRejectItem}
              onConfirmSection={handleConfirmSection}
            />
          )
        )}

        <div className="add-missing-section">
          {showAddMissing ? (
            <AddMissingForm
              onSave={handleAddMissing}
              onCancel={() => { setShowAddMissing(false); setAddMissingError(null) }}
              submitting={addMissingSubmitting}
              error={addMissingError}
            />
          ) : (
            <button className="btn-add-missing" onClick={() => setShowAddMissing(true)}>
              Add missing item
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
