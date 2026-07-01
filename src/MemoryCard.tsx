import { useState } from 'react'
import MemoryEditForm from './MemoryEditForm'
import { memoryItemToEdit } from './memoryEdit'
import { costDetailRows, labourExclusionCopy, spendExclusionCopy } from './memoryScan'
import type { BudgetCategory, MemoryItemEdit, MemoryViewItem } from './types'

// Types shown with a structured type label + detail rows (not a prose summary).
export const STRUCTURED_TYPES = new Set<string>(['ordered_material', 'used_material', 'leftover_material', 'labour'])
// Types that can carry a budget category (a picker is offered for these).
export const CATEGORY_TYPES = new Set<string>(['ordered_material', 'labour'])

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
  labour: 'Labour',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

export interface MemoryCardProps {
  item: MemoryViewItem
  isEditing: boolean
  submitting: boolean
  verifying: boolean
  errorMsg: string | null
  categories: BudgetCategory[]
  assigningCategory: boolean
  excludedReason?: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
  onVerify: () => void
  onAssignCategory: (categoryId: string | null) => void
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
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
  onAssignCategory,
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
      {isStructured
        ? <p className="mem-card-type-label">{MATERIAL_TYPE_LABEL[item.memoryType]}</p>
        : <p className="mem-card-summary">{item.summary}</p>
      }
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

      <div className="mem-card-footer">
        <SourceContext item={item} />
        <button type="button" className="btn-mem-fix" onClick={onStartEdit}>Fix memory</button>
      </div>
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}
