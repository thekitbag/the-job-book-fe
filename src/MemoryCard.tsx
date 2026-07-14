import { useState } from 'react'
import MemoryEditForm from './MemoryEditForm'
import { memoryItemToEdit } from './memoryEdit'
import { formatSavedStamp } from './SourceHistory'
import { costDetailRows, effectiveItemDate, itemDateLabel, labourExclusionCopy, spendExclusionCopy } from './memoryScan'
import type { BudgetCategory, MemoryItemEdit, MemoryType, MemoryViewItem } from './types'

// Types shown with a structured type label + detail rows (not a prose summary).
export const STRUCTURED_TYPES = new Set<string>(['ordered_material', 'used_material', 'leftover_material', 'labour'])
// Types that can carry a budget category (a picker is offered for these).
export const CATEGORY_TYPES = new Set<string>(['ordered_material', 'labour'])
// Types that count towards known spend — these carry the date cue and the
// "no longer count in known spend" warning when removed.
const SPEND_TYPES = new Set<string>(['ordered_material', 'labour'])
// A Used item is really a Left over misheard, and vice versa — the one
// correction worth a dedicated one-tap move rather than a trip through Fix.
const MOVE_TARGET: Record<string, { type: MemoryType; label: string }> = {
  used_material: { type: 'leftover_material', label: 'Move to Left over' },
  leftover_material: { type: 'used_material', label: 'Move to Used' },
}

// What removing this item actually costs Mike, in his terms. The source line
// matters most: removing a fact must never read as deleting the voice note.
function removalConsequences(item: MemoryViewItem): string[] {
  const lines: string[] = []
  if (SPEND_TYPES.has(item.memoryType)) lines.push('It will no longer count in known spend.')
  else if (item.memoryType === 'general_note') lines.push('It will be removed from the job log.')
  else lines.push('It will be removed from this job.')
  if (item.source) lines.push('The original voice note will be kept.')
  return lines
}

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
  labour: 'Labour',
}

function StructuredFields({ item }: { item: MemoryViewItem }) {
  const rows: [string, string][] = []
  if (item.memoryType === 'labour') {
    if (item.labourHours) rows.push(['Hours', item.labourHours])
    if (item.labourPerson) rows.push(['Person', item.labourPerson])
    if (item.labourTask) rows.push(['Task', item.labourTask])
  } else {
    if (item.materialName) rows.push(['Item', item.materialName])
    const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
    if (qty) rows.push(['Quantity', qty])
    if (item.supplierName) rows.push(['Supplier', item.supplierName])
    if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
    if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  }
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
      <button className="mem-source-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? 'Hide source' : 'Show source'}
      </button>
      {open && (
        <div className="mem-source-body">
          <p className="mem-source-label">This came from your note</p>
          <p className="mem-source-time">Saved {formatSavedStamp(item.source.capturedAt)}</p>
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

export interface MemoryCardProps {
  item: MemoryViewItem
  isEditing: boolean
  submitting: boolean
  verifying: boolean
  errorMsg: string | null
  categories: BudgetCategory[]
  assigningCategory: boolean
  excludedReason?: string | null
  mutating: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
  onVerify: () => void
  onAssignCategory: (categoryId: string | null) => void
  onRemove: () => void
  onMove: (memoryType: MemoryType) => void
}

export default function MemoryCard({
  item,
  isEditing,
  submitting,
  verifying,
  errorMsg,
  categories,
  assigningCategory,
  excludedReason,
  mutating,
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
  onAssignCategory,
  onRemove,
  onMove,
}: MemoryCardProps) {
  const isStructured = STRUCTURED_TYPES.has(item.memoryType)
  const hasFields = !!(
    item.materialName || item.quantity || item.unit ||
    item.supplierName || item.deliveryTiming || item.locationOrUse ||
    item.labourHours || item.labourPerson || item.labourTask ||
    item.costAmount || item.totalCostAmount ||
    (item.uncertaintyFlags ?? []).length > 0
  )
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  const excludedCopy = excludedReason
    ? (item.memoryType === 'labour' ? labourExclusionCopy(excludedReason) : spendExclusionCopy(excludedReason))
    : null
  const [ackUnsure, setAckUnsure] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const dateLabel = SPEND_TYPES.has(item.memoryType) ? itemDateLabel(effectiveItemDate(item)) : null
  const move = MOVE_TARGET[item.memoryType]

  if (isEditing) {
    return (
      <div className="mem-card mem-card--editing">
        <MemoryEditForm initial={memoryItemToEdit(item)} submitting={submitting} categories={categories} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  return (
    <div className={`mem-card${uncertain ? ' mem-card--unresolved' : ''}`}>
      <div className="mem-card-head">
        {isStructured
          ? <p className="mem-card-type-label">{MATERIAL_TYPE_LABEL[item.memoryType]}</p>
          : <p className="mem-card-summary">{item.summary}</p>
        }
        {dateLabel && <span className="mem-card-date">{dateLabel}</span>}
      </div>
      <StructuredFields item={item} />
      {isStructured && !hasFields && <p className="mem-card-summary">{item.summary}</p>}

      {/* Bought/labour item that isn't in Known spend — say so explicitly. */}
      {excludedCopy && (
        <p className="mem-card-notcounted">Not in Known spend yet · {excludedCopy}</p>
      )}

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

      {CATEGORY_TYPES.has(item.memoryType) && categories.length > 0 && (
        <label className="mem-card-category">
          <span className="mem-card-category-label">Budget category</span>
          <select
            className="mem-card-category-select"
            aria-label={`Budget category for ${item.labourTask ?? item.materialName ?? item.summary}`}
            value={item.budgetCategoryId ?? ''}
            disabled={assigningCategory}
            onChange={e => onAssignCategory(e.target.value || null)}
          >
            <option value="">Choose category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      {confirmingRemove ? (
        // Explicit but lightweight: name the consequence, then two plain buttons.
        // No modal — the card Mike is about to remove stays in front of him.
        <div className="mem-remove-confirm">
          <p className="mem-remove-question">Remove this item?</p>
          {removalConsequences(item).map(line => (
            <p key={line} className="mem-remove-consequence">{line}</p>
          ))}
          <div className="mem-remove-actions">
            <button type="button" className="btn-mem-remove-confirm" disabled={mutating} onClick={onRemove}>
              {mutating ? 'Removing…' : 'Remove'}
            </button>
            <button type="button" className="btn-mem-cancel" disabled={mutating} onClick={() => setConfirmingRemove(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mem-card-footer">
          <SourceContext item={item} />
          <div className="mem-card-actions">
            {move && (
              <button type="button" className="btn-mem-move" disabled={mutating} onClick={() => onMove(move.type)}>
                {mutating ? 'Moving…' : move.label}
              </button>
            )}
            <button type="button" className="btn-mem-fix" onClick={onStartEdit}>Fix memory</button>
            <button type="button" className="btn-mem-remove" disabled={mutating} onClick={() => setConfirmingRemove(true)}>
              Remove item
            </button>
          </div>
        </div>
      )}
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}
