import { useCallback, useEffect, useRef, useState } from 'react'
import { getReviewQueue, submitQueueDecision, updateMemoryItem, verifyMemoryItem } from './api'
import { track } from './analytics'
import MemoryEditForm from './MemoryEditForm'
import { applyEditToRemembered, rememberedItemToEdit } from './memoryEdit'
import { friendlyDayLabel, localDateKey, MEMORY_TYPE_TO_SECTION_KEY } from './memoryScan'
import type {
  AlreadyRememberedItem,
  Job,
  MemoryItemEdit,
  MemoryType,
  ProposedMemory,
  QueueDecisionAction,
  QueueItem,
  QueueSection,
  ReviewQueue,
  UncertaintyResolution,
} from './types'

const MEMORY_TYPE_OPTIONS: { value: MemoryType; label: string; shortLabel: string }[] = [
  { value: 'used_material', label: 'Used material', shortLabel: 'Used' },
  { value: 'ordered_material', label: 'Bought material', shortLabel: 'Bought' },
  { value: 'leftover_material', label: 'Leftover material', shortLabel: 'Leftover' },
  { value: 'labour', label: 'Hours', shortLabel: 'Hours' },
  { value: 'general_note', label: 'Note', shortLabel: 'Note' },
]

const MATERIAL_TYPES = new Set<MemoryType>(['ordered_material', 'used_material', 'leftover_material'])
// Types that lead with a structured type label + detail rows (not a prose summary).
const STRUCTURED_TYPES = new Set<MemoryType>([
  'ordered_material',
  'used_material',
  'leftover_material',
  'labour',
])

const MATERIAL_TYPE_CARD_LABEL: Partial<Record<MemoryType, string>> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
  labour: 'Hours',
}

// Scannable card text: a bold headline and a muted meta line, instead of a
// dense label/value grid.
function reviewHeadline(pm: ProposedMemory): string {
  if (pm.memoryType === 'labour') {
    const hours = pm.labourHours ? `${pm.labourHours} hours` : null
    return [hours, pm.labourTask].filter(Boolean).join(' · ') || pm.summary
  }
  if (MATERIAL_TYPES.has(pm.memoryType)) {
    const qty = [pm.quantity, pm.unit].filter(Boolean).join(' ')
    return [qty, pm.materialName].filter(Boolean).join(' · ') || pm.summary
  }
  return pm.summary
}
function reviewMeta(pm: ProposedMemory): string {
  if (pm.memoryType === 'labour') {
    const day = pm.happenedAt ? friendlyDayLabel(localDateKey(pm.happenedAt)) : null
    return [pm.labourPerson, day, pm.locationOrUse].filter(Boolean).join(' · ')
  }
  return [pm.supplierName, pm.deliveryTiming, pm.locationOrUse].filter(Boolean).join(' · ')
}
// Plain builder labels for the category focus chips, keyed by section key.
const SECTION_CHIP_LABELS: Record<string, string> = {
  ordered_materials: 'Bought',
  budget_costs: 'Costs',
  labour: 'Hours',
  used_materials: 'Used',
  leftovers: 'Left over',
  supplier_delivery_notes: 'Supplier notes',
  customer_changes: 'Changes',
  watch_outs: 'Watch-outs',
  unclear_items: 'Unclear',
}

const chipLabel = (s: QueueSection) => SECTION_CHIP_LABELS[s.key] ?? s.label
const draftCount = (s: QueueSection) => s.items.filter((it) => it.status === 'draft').length

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
    <div className="queue-cat-chips" role="group" aria-label="Focus a section">
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
      {/* Only categories that actually have pending items get a chip — no row of
          "0"s. The currently-focused chip stays even if it just emptied. */}
      {sections
        .filter((s) => draftCount(s) > 0 || focusedKey === s.key)
        .map((s) => {
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
        onClick={() => setOpen((o) => !o)}
      >
        This came from your note {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="queue-source-list">
          {contexts.map((ctx) => (
            <li key={ctx.candidateFactId} className="queue-source-item">
              {ctx.transcriptText ? (
                <p className="queue-source-text" data-builder-note>
                  "{ctx.transcriptText}"
                </p>
              ) : (
                <p className="queue-source-unavailable">Source unavailable</p>
              )}
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
  onSubmit: (pm: ProposedMemory) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [type, setType] = useState<MemoryType>(initial.memoryType)
  return (
    <div>
      <label className="queue-field">
        <span className="queue-field-label">Remember as</span>
        <select
          className="queue-field-input"
          aria-label="Remember as"
          value={type}
          onChange={(e) => setType(e.target.value as MemoryType)}
        >
          {MEMORY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <MemoryEditForm
        key={type}
        initial={{ ...initial, memoryType: type }}
        submitting={submitting}
        onCancel={onCancel}
        onSubmit={(edit) => {
          const material = MATERIAL_TYPES.has(type)
          const hours = type === 'labour'
          const amountUnchanged = edit.quantity === [initial.quantity, initial.unit].filter(Boolean).join(' ')
          // A correction is a new fact shape, not a PATCH. Preserve a legacy
          // quantity/unit pair when its combined display amount was untouched.
          // Build an explicit field list so old response metadata cannot be sent.
          const corrected: ProposedMemory = {
            memoryType: type,
            summary: edit.summary ?? '',
            materialName: material ? (edit.materialName ?? initial.materialName) : null,
            quantity: material ? (amountUnchanged ? initial.quantity : (edit.quantity ?? null)) : null,
            unit: material && amountUnchanged ? initial.unit : null,
            supplierName: material ? (edit.supplierName ?? null) : null,
            deliveryTiming: material ? initial.deliveryTiming : null,
            locationOrUse: material ? (edit.locationOrUse ?? null) : null,
            ...(hours
              ? {
                  labourHours: edit.labourHours ?? initial.labourHours,
                  labourPerson: edit.labourPerson ?? initial.labourPerson,
                  labourTask: initial.labourTask,
                  happenedAt: edit.happenedAt ?? initial.happenedAt,
                }
              : {}),
          }
          if (material || hours) corrected.summary = reviewHeadline(corrected)
          onSubmit(corrected)
        }}
      />
    </div>
  )
}

function QueueItemCard({
  item,
  isEditing,
  submitting,
  errorMsg,
  onConfirm,
  onConfirmStillUnsure,
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
  onConfirmStillUnsure: () => void
  onStartEdit: () => void
  onSubmitCorrection: (corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onDismiss: () => void
}) {
  const resolved = item.status !== 'draft'
  const uncertain = item.uncertaintyFlags.length > 0
  const memType = item.proposedMemory.memoryType
  const isStructured = STRUCTURED_TYPES.has(memType)
  const headline = reviewHeadline(item.proposedMemory)
  const meta = reviewMeta(item.proposedMemory)

  return (
    <div className={`queue-item-card queue-item-card--${item.status}`} data-testid={`queue-item-${item.id}`}>
      {item.kind !== 'single' && (
        <div className="queue-item-top">
          <ItemKindBadge item={item} />
        </div>
      )}

      {isStructured && (
        <p className="queue-item-type-label">{MATERIAL_TYPE_CARD_LABEL[memType] ?? memType}</p>
      )}

      {!isEditing && (
        <>
          <p className="queue-item-headline">{headline}</p>
          {meta && <p className="queue-item-meta">{meta}</p>}
          {uncertain && (
            <p className="queue-item-uncertain-line">Worth checking — details may need confirming</p>
          )}
        </>
      )}

      {!resolved && <SourceContext contexts={item.sourceContext} />}

      {resolved && (item.status === 'confirmed' || item.status === 'corrected') && (
        <p className="queue-item-resolved queue-item-resolved--saved">Saved to trusted memory</p>
      )}
      {resolved && item.status === 'dismissed' && (
        <p className="queue-item-resolved queue-item-resolved--dismissed">Dismissed</p>
      )}

      {!resolved && !isEditing && (
        <div className="queue-item-actions">
          <button className="btn-queue-remember" onClick={() => onConfirm()} disabled={submitting}>
            {submitting ? 'Saving…' : 'Remember this'}
          </button>
          <button
            className="btn-queue-correct"
            onClick={onStartEdit}
            disabled={submitting}
            aria-label="Fix details"
          >
            Fix
          </button>
          <button className="btn-queue-dismiss" onClick={onDismiss} disabled={submitting}>
            Dismiss
          </button>
          {/* On a Worth-checking draft, "Remember, but still unsure" keeps the flag. */}
          {uncertain && (
            <button className="btn-queue-unsure" onClick={() => onConfirmStillUnsure()} disabled={submitting}>
              Remember, but still unsure
            </button>
          )}
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
        <p className="queue-item-error" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  )
}

function RememberedCard({
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
  item: AlreadyRememberedItem
  isEditing: boolean
  submitting: boolean
  verifying: boolean
  errorMsg: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
  onVerify: () => void
}) {
  const typeLabel = MEMORY_TYPE_OPTIONS.find((o) => o.value === item.memoryType)?.shortLabel ?? 'Note'
  const [ackUnsure, setAckUnsure] = useState(false)

  if (isEditing) {
    return (
      <li className="queue-remembered-card queue-remembered-card--editing">
        <MemoryEditForm
          initial={rememberedItemToEdit(item)}
          submitting={submitting}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
        {errorMsg && (
          <p className="queue-item-error" role="alert">
            {errorMsg}
          </p>
        )}
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
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  const isMaterial = MATERIAL_TYPES.has(item.memoryType)
  const hasDetailRows = rows.length > 0 || uncertain

  return (
    <li className={`queue-remembered-card queue-remembered-card--${item.memoryType}`}>
      <div className="queue-remembered-card-top">
        <span className={`queue-remembered-type-chip queue-remembered-type-chip--${item.memoryType}`}>
          {typeLabel}
        </span>
        {item.timeLabel && <span className="queue-remembered-card-time">{item.timeLabel}</span>}
      </div>
      {(!isMaterial || !hasDetailRows) && (
        <p className="queue-remembered-card-summary">
          {reviewHeadline(rememberedItemToEdit(item) as ProposedMemory)}
        </p>
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
              <dd className="card-detail-value">details may need confirming</dd>
            </div>
          )}
        </dl>
      )}
      {uncertain && !ackUnsure && (
        <div className="mem-resolve">
          <button type="button" className="btn-mem-verify" onClick={onVerify} disabled={verifying}>
            {verifying ? 'Saving…' : 'This is right'}
          </button>
          <button
            type="button"
            className="btn-mem-unsure"
            onClick={() => setAckUnsure(true)}
            disabled={verifying}
          >
            Still unsure
          </button>
        </div>
      )}
      <div className="queue-remembered-card-footer">
        <button type="button" className="btn-mem-fix" onClick={onStartEdit}>
          Fix memory
        </button>
      </div>
      {errorMsg && (
        <p className="queue-item-error" role="alert">
          {errorMsg}
        </p>
      )}
    </li>
  )
}

function AlreadyRememberedSection({
  items,
  focusedKey,
  editingId,
  submittingId,
  verifyingId,
  itemErrors,
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
}: {
  items: AlreadyRememberedItem[]
  focusedKey: string | null
  editingId: string | null
  submittingId: string | null
  verifyingId: string | null
  itemErrors: Record<string, string>
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (id: string, edit: MemoryItemEdit) => void
  onVerify: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  // Already-remembered context follows the active category focus
  const shown =
    focusedKey === null ? items : items.filter((m) => MEMORY_TYPE_TO_SECTION_KEY[m.memoryType] === focusedKey)
  if (shown.length === 0) return null
  return (
    <div className="queue-already-remembered" role="region" aria-label="Already remembered">
      <p className="queue-remembered-heading">Already remembered</p>
      <button
        type="button"
        className="queue-remembered-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide remembered items' : `Show remembered items (${shown.length})`}
      </button>
      {open && (
        <ul className="queue-remembered-list">
          {shown.map((m) => (
            <RememberedCard
              key={m.memoryItemId}
              item={m}
              isEditing={editingId === m.memoryItemId}
              submitting={submittingId === m.memoryItemId}
              verifying={verifyingId === m.memoryItemId}
              errorMsg={itemErrors[m.memoryItemId] ?? null}
              onStartEdit={() => onStartEdit(m.memoryItemId)}
              onCancelEdit={onCancelEdit}
              onSave={(edit) => onSave(m.memoryItemId, edit)}
              onVerify={() => onVerify(m.memoryItemId)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SectionBlock({
  section,
  showHeading = true,
  editingItemId,
  submittingId,
  itemErrors,
  onConfirm,
  onConfirmStillUnsure,
  onStartEdit,
  onSubmitCorrection,
  onCancelEdit,
  onDismiss,
}: {
  section: QueueSection
  showHeading?: boolean
  editingItemId: string | null
  submittingId: string | null
  itemErrors: Record<string, string>
  onConfirm: (id: string) => void
  onConfirmStillUnsure: (id: string) => void
  onStartEdit: (id: string) => void
  onSubmitCorrection: (id: string, corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onDismiss: (id: string) => void
}) {
  if (section.items.length === 0) return null
  return (
    <section className="queue-section">
      {showHeading && <h2 className="queue-section-heading">{section.label}</h2>}
      {section.items.map((item) => (
        <QueueItemCard
          key={item.id}
          item={item}
          isEditing={editingItemId === item.id}
          submitting={submittingId === item.id}
          errorMsg={itemErrors[item.id] ?? null}
          onConfirm={() => onConfirm(item.id)}
          onConfirmStillUnsure={() => onConfirmStillUnsure(item.id)}
          onStartEdit={() => onStartEdit(item.id)}
          onSubmitCorrection={(corrected) => onSubmitCorrection(item.id, corrected)}
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
  const [memVerifyingId, setMemVerifyingId] = useState<string | null>(null)
  const [memErrors, setMemErrors] = useState<Record<string, string>>({})

  // Latest selected job id; ignore a queue load that resolves after a job switch.
  const currentJobIdRef = useRef(job.id)
  currentJobIdRef.current = job.id

  const loadQueue = useCallback(() => {
    setLoadState('loading')
    const requestedJobId = job.id
    getReviewQueue(requestedJobId)
      .then((q) => {
        if (currentJobIdRef.current !== requestedJobId) return
        setQueue(q)
        setLoadState('ready')
      })
      .catch(() => {
        if (currentJobIdRef.current !== requestedJobId) return
        setLoadState('error')
      })
  }, [job.id])

  useEffect(() => {
    setQueue(null)
    setEditingItemId(null)
    setEditingMemId(null)
    setFocusedKey(null)
    setSubmittingId(null)
    setMemSubmittingId(null)
    setMemVerifyingId(null)
    loadQueue()
  }, [loadQueue])

  useEffect(() => {
    track('review_queue_opened', { job_id: job.id })
  }, [job.id])

  const handleDecision = useCallback(
    async (
      itemId: string,
      action: QueueDecisionAction,
      corrected?: ProposedMemory,
      uncertaintyResolution?: UncertaintyResolution,
    ) => {
      if (!queue) return
      setSubmittingId(itemId)
      setItemErrors((e) => {
        const n = { ...e }
        delete n[itemId]
        return n
      })
      try {
        const finalType =
          corrected?.memoryType ??
          queue.sections.flatMap((s) => s.items).find((it) => it.id === itemId)?.proposedMemory.memoryType
        const result = await submitQueueDecision(job.id, {
          queueItemId: itemId,
          action,
          corrected,
          reason: action === 'dismiss' ? 'Not about this job' : undefined,
          uncertaintyResolution: action === 'dismiss' ? undefined : uncertaintyResolution,
        })
        if (currentJobIdRef.current !== job.id) return
        track('review_decision_submitted', {
          job_id: job.id,
          section_key: queue.sections.find((s) => s.items.some((it) => it.id === itemId))?.key ?? null,
          action,
          memory_type: finalType ?? null,
          has_correction: !!corrected,
        })
        setQueue((q) => {
          if (!q) return q
          return {
            ...q,
            sections: q.sections.map((s) => ({
              ...s,
              items: s.items.map((it) =>
                it.id !== itemId
                  ? it
                  : {
                      ...it,
                      status: result.status,
                      ...(corrected ? { summary: corrected.summary, proposedMemory: corrected } : {}),
                    },
              ),
            })),
          }
        })
        if (editingItemId === itemId) setEditingItemId(null)
      } catch {
        if (currentJobIdRef.current === job.id)
          setItemErrors((e) => ({ ...e, [itemId]: 'Could not save — tap to retry' }))
      } finally {
        if (currentJobIdRef.current === job.id) setSubmittingId(null)
      }
    },
    [queue, job.id, editingItemId],
  )

  // Correct an already-remembered (trusted) item in place via the same
  // updateMemoryItem path used in Job memory. Never re-queues the item.
  const handleSaveRemembered = useCallback(
    async (memoryItemId: string, edit: MemoryItemEdit) => {
      setMemSubmittingId(memoryItemId)
      setMemErrors((e) => {
        const n = { ...e }
        delete n[memoryItemId]
        return n
      })
      try {
        // A normal Fix memory save also clears the Worth-checking warning.
        const updated = await updateMemoryItem(job.id, memoryItemId, edit)
        if (updated.uncertaintyFlags?.length) await verifyMemoryItem(job.id, memoryItemId)
        track('memory_edit_saved', { job_id: job.id, memory_type: updated.memoryType })
        if (currentJobIdRef.current !== job.id) return
        setQueue((q) => {
          if (!q) return q
          return {
            ...q,
            alreadyRemembered: q.alreadyRemembered.map((m) =>
              m.memoryItemId === memoryItemId
                ? applyEditToRemembered(m, { ...updated, uncertaintyFlags: [] })
                : m,
            ),
          }
        })
        setEditingMemId(null)
      } catch {
        if (currentJobIdRef.current === job.id)
          setMemErrors((e) => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
      } finally {
        if (currentJobIdRef.current === job.id) setMemSubmittingId(null)
      }
    },
    [job.id],
  )

  // Verify an already-remembered Worth-checking card as right (clears flag only).
  const handleVerifyRemembered = useCallback(
    async (memoryItemId: string) => {
      setMemVerifyingId(memoryItemId)
      setMemErrors((e) => {
        const n = { ...e }
        delete n[memoryItemId]
        return n
      })
      try {
        await verifyMemoryItem(job.id, memoryItemId)
        track('memory_verified', { job_id: job.id })
        if (currentJobIdRef.current !== job.id) return
        setQueue((q) => {
          if (!q) return q
          return {
            ...q,
            alreadyRemembered: q.alreadyRemembered.map((m) =>
              m.memoryItemId === memoryItemId ? { ...m, uncertaintyFlags: [] } : m,
            ),
          }
        })
      } catch {
        if (currentJobIdRef.current === job.id)
          setMemErrors((e) => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
      } finally {
        if (currentJobIdRef.current === job.id) setMemVerifyingId(null)
      }
    },
    [job.id],
  )

  const totalPending = queue ? queue.sections.reduce((n, s) => n + draftCount(s), 0) : 0

  const isEmpty = queue
    ? queue.sections.every((s) => s.items.length === 0) && queue.alreadyRemembered.length === 0
    : false

  // Keep focus stable across actions; only reset if the focused category
  // disappears entirely from the queue (it never does mid-session here).
  const focusedSection = focusedKey ? (queue?.sections.find((s) => s.key === focusedKey) ?? null) : null
  const focusedEmpty = focusedKey !== null && (!focusedSection || focusedSection.items.length === 0)
  const visibleSections =
    focusedKey === null ? (queue?.sections ?? []) : focusedSection ? [focusedSection] : []

  const pendingLabel = totalPending === 0 ? 'Nothing waiting' : `${totalPending} waiting`

  // With a single category, chips and per-section headings only repeat the type.
  const sectionsWithDrafts = (queue?.sections ?? []).filter((s) => draftCount(s) > 0)
  const showChips = sectionsWithDrafts.length > 1
  const showSectionHeadings = visibleSections.filter((s) => s.items.length > 0).length > 1

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

      {loadState === 'loading' && <p className="queue-loading">Loading…</p>}

      {loadState === 'error' && (
        <div className="queue-load-error">
          <p>Could not load your queue.</p>
          <button className="btn-queue-retry" onClick={loadQueue}>
            Try again
          </button>
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
              <button className="btn-queue-retry" onClick={onClose}>
                Back to job
              </button>
            </div>
          ) : (
            <>
              {showChips && (
                <CategoryChips
                  sections={queue.sections}
                  totalPending={totalPending}
                  focusedKey={focusedKey}
                  onFocus={setFocusedKey}
                />
              )}

              {/* Pending draft facts come first. There is deliberately no bulk
                  "Remember all" — each item is checked and kept on its own
                  (ledger-grammar-redesign: no bulk confirmation). */}
              {focusedEmpty ? (
                <p className="queue-empty-category">Nothing waiting here</p>
              ) : (
                visibleSections.map((section) => (
                  <SectionBlock
                    key={section.key}
                    section={section}
                    showHeading={showSectionHeadings}
                    editingItemId={editingItemId}
                    submittingId={submittingId}
                    itemErrors={itemErrors}
                    onConfirm={(id) => handleDecision(id, 'confirm', undefined, 'resolved')}
                    onConfirmStillUnsure={(id) => handleDecision(id, 'confirm', undefined, 'still_unsure')}
                    onStartEdit={(id) => setEditingItemId(id)}
                    onSubmitCorrection={(id, corrected) =>
                      handleDecision(id, 'correct', corrected, 'resolved')
                    }
                    onCancelEdit={() => setEditingItemId(null)}
                    onDismiss={(id) => handleDecision(id, 'dismiss')}
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
                verifyingId={memVerifyingId}
                itemErrors={memErrors}
                onStartEdit={setEditingMemId}
                onCancelEdit={() => setEditingMemId(null)}
                onSave={handleSaveRemembered}
                onVerify={handleVerifyRemembered}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
