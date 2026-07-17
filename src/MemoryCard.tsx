import { useState } from 'react'
import MemoryEditForm from './MemoryEditForm'
import ReturnMaterialSheet from './ReturnMaterialSheet'
import BottomSheet from './BottomSheet'
import { memoryItemToEdit } from './memoryEdit'
import { formatSavedStamp } from './SourceHistory'
import { costDetailRows, deriveEachTotal, effectiveItemDate, formatTotalLabel, itemDateLabel, labourExclusionCopy, safeRefund, spendExclusionCopy } from './memoryScan'
import type { BudgetCategory, MemoryItemEdit, MemoryType, MemoryViewItem, ReturnMaterialRequest } from './types'

// Types shown with a structured type label + detail rows (not a prose summary).
export const STRUCTURED_TYPES = new Set<string>(['ordered_material', 'used_material', 'leftover_material', 'returned_material', 'labour'])
// Types that can carry a budget category (a picker is offered for these).
export const CATEGORY_TYPES = new Set<string>(['ordered_material', 'labour'])
// Types that count towards known spend — these carry the date cue and the
// "no longer count in known spend" warning when removed.
const SPEND_TYPES = new Set<string>(['ordered_material', 'labour'])
// Types whose date is worth showing on the card. A return is a dated event in
// its own right ("Returned 8 Jul"), even though it is not spend.
const DATED_TYPES = new Set<string>([...SPEND_TYPES, 'returned_material'])
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
  else if (item.memoryType === 'returned_material') {
    // Removing a return is for a return that never happened. Say what comes
    // back, so it can't be mistaken for undoing the purchase.
    lines.push('It will no longer show as returned.')
    if (safeRefund(item)) lines.push('Its refund will stop coming off your known spend.')
  }
  else if (item.memoryType === 'general_note') lines.push('It will be removed from the job log.')
  else lines.push('It will be removed from this job.')
  if (item.source) lines.push('The original voice note will be kept.')
  return lines
}

// Returned-item rows in builder language: what went back, where to, and what
// came back. A refund is labelled as a refund — never folded in with the cost
// rows, where it would read as more money out.
function returnedRows(item: MemoryViewItem, named: boolean): [string, string][] {
  const rows: [string, string][] = []
  if (item.materialName && !named) rows.push(['Item', item.materialName])
  const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
  if (qty) rows.push(['Returned', qty])
  if (item.supplierName) rows.push(['Returned to', item.supplierName])
  const refund = formatTotalLabel(item.refundAmount ?? null, item.refundCurrency ?? null)
  if (refund) rows.push(['Refund', `${refund} refund`])
  // No refund figure yet: say so, rather than leave a silent gap that looks
  // like the money simply vanished from the job.
  else rows.push(['Refund', 'None recorded — spend is unchanged'])
  return rows
}

// The row's headline identity and its money, which the ledger puts on one
// baseline: what it is, left; what it cost, right.
function itemName(item: MemoryViewItem): string | null {
  if (item.memoryType === 'labour') return item.labourTask?.trim() || item.labourPerson?.trim() || null
  return item.materialName?.trim() || null
}

// Line total for the head. Deliberately not the refund on a returned item: a
// refund is money back and stays labelled as such in the meta line, where it
// cannot be mistaken for a price paid.
function itemPrice(item: MemoryViewItem): string | null {
  if (item.memoryType === 'returned_material') return null
  const total = item.totalCostAmount ?? deriveEachTotal(item)
  return formatTotalLabel(total, item.costCurrency)
}

function StructuredFields({ item, dateLabel }: { item: MemoryViewItem; dateLabel?: string | null }) {
  const rows: [string, string][] = []
  const named = !!itemName(item)
  if (item.memoryType === 'labour') {
    if (item.labourHours) rows.push(['Hours', item.labourHours])
    if (item.labourPerson) rows.push(['Person', item.labourPerson])
    if (item.labourTask && !named) rows.push(['Task', item.labourTask])
  } else if (item.memoryType === 'returned_material') {
    rows.push(...returnedRows(item, named))
  } else {
    // Name and price are in the head now; the rest composes the meta line.
    if (item.materialName && !named) rows.push(['Item', item.materialName])
    const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
    if (qty) rows.push(['Quantity', qty])
    if (item.supplierName) rows.push(['Supplier', item.supplierName])
    if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
    if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  }
  if (item.memoryType !== 'returned_material') {
    // Drop the Total row when the head already shows that exact figure — the
    // ledger states each number once.
    const price = itemPrice(item)
    rows.push(...costDetailRows(item).filter(([label, value]) => !(label === 'Total' && value === price)))
  }
  // Row variant: the date joins the end of the one meta line rather than
  // sitting on a line of its own ("… — Jewson · yesterday").
  if (dateLabel) rows.push(['Date', dateLabel])
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
  // Left over items only. Rejects on failure so the sheet keeps Mike's values.
  onReturn: (req: ReturnMaterialRequest) => Promise<unknown>
  // 'row' is the compact item scale used where rows must not be confusable with
  // the category bands above them (Spend → not in a category yet): a smaller
  // name, one primary action, everything else behind the row's "…".
  // 'row'   — compact item scale with one primary action (Spend, uncategorised).
  // 'sheet'  — a plain tappable ledger row: every action lives in one bottom
  //            sheet opened by tapping the row, instead of five links competing
  //            for attention on the item itself (Materials).
  variant?: 'card' | 'row' | 'sheet'
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
  onReturn,
  variant = 'card',
}: MemoryCardProps) {
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  const excludedCopy = excludedReason
    ? (item.memoryType === 'labour' ? labourExclusionCopy(excludedReason) : spendExclusionCopy(excludedReason))
    : null
  const [ackUnsure, setAckUnsure] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [picking, setPicking] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [returning, setReturning] = useState(false)
  const dateLabel = DATED_TYPES.has(item.memoryType) ? itemDateLabel(effectiveItemDate(item)) : null
  const name = itemName(item)
  const price = itemPrice(item)
  const move = MOVE_TARGET[item.memoryType]
  // Returning is a real job event, so it is only offered where one can happen:
  // a Left over item Mike still has. Delete stays for mistakes.
  const canReturn = item.memoryType === 'leftover_material'

  if (isEditing) {
    return (
      <div className="mem-card mem-card--editing">
        <MemoryEditForm initial={memoryItemToEdit(item)} submitting={submitting} categories={categories} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  const isRow = variant === 'row'

  // ── Tappable ledger row + one actions sheet ──
  if (variant === 'sheet' && !confirmingRemove) {
    // "3 packs · from Jewson" — quantity and where it came from. Spend-dated
    // types keep their date here (it is the only place it now shows, and a
    // bought line without a date is a worse record). A returned item's money is
    // its refund, which is never a price, so it rides in the meta too.
    const refund = item.memoryType === 'returned_material'
      ? formatTotalLabel(item.refundAmount ?? null, item.refundCurrency ?? null)
      : null
    const meta = [
      [item.quantity, item.unit].filter(Boolean).join(' ') || null,
      item.supplierName ? `from ${item.supplierName}` : null,
      // Where a leftover actually is ("in the van") is the point of recording it.
      item.locationOrUse,
      refund ? `${refund} refund` : null,
      dateLabel,
    ].filter(Boolean).join(' · ')
    const label = name ?? item.summary

    return (
      <div className={`mem-card mem-card--sheet${uncertain ? ' mem-card--unresolved' : ''}`}>
        <button type="button" className="mem-row-tap" onClick={() => setActionsOpen(true)}>
          <span className="mem-row-tap-text">
            <span className="mem-row-tap-name">{label}</span>
            {meta && <span className="mem-row-tap-meta">{meta}</span>}
          </span>
          {price && <span className="mem-row-tap-price">{price}</span>}
          <span className="mem-row-tap-chev" aria-hidden="true">›</span>
        </button>

        {/* A bought/labour item that isn't in Known spend — still said on the
            row, not hidden in the sheet: it explains a figure Mike can see. */}
        {excludedCopy && (
          <p className="mem-card-notcounted">Not in Known spend yet · {excludedCopy}</p>
        )}

        {/* Worth checking is a question, not an action, so it stays in front of
            him rather than moving behind the row's sheet. */}
        {uncertain && <p className="mem-row-check">Worth checking</p>}
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

        {showSource && item.source && (
          <div className="mem-source-body mem-row-source">
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

        {/* Every action for this item, in one place, at row scale. */}
        {actionsOpen && (
          <BottomSheet title={label} onClose={() => setActionsOpen(false)}>
            {meta && <p className="row-sheet-sub">{meta}</p>}
            <div className="row-sheet-actions">
              {canReturn && (
                <button type="button" className="row-sheet-opt" onClick={() => { setActionsOpen(false); setReturning(true) }}>
                  Mark as returned <span aria-hidden="true">›</span>
                </button>
              )}
              {move && (
                <button type="button" className="row-sheet-opt" disabled={mutating} onClick={() => { setActionsOpen(false); onMove(move.type) }}>
                  {move.label} <span aria-hidden="true">›</span>
                </button>
              )}
              {item.source && (
                <button type="button" className="row-sheet-opt" onClick={() => { setActionsOpen(false); setShowSource(v => !v) }}>
                  {showSource ? 'Hide source' : 'Show source'} <span aria-hidden="true">›</span>
                </button>
              )}
              <button type="button" className="row-sheet-opt" onClick={() => { setActionsOpen(false); onStartEdit() }}>
                Fix memory <span aria-hidden="true">›</span>
              </button>
              <button type="button" className="row-sheet-opt row-sheet-opt--danger" onClick={() => { setActionsOpen(false); setConfirmingRemove(true) }}>
                Remove item
              </button>
            </div>
            <button type="button" className="row-sheet-cancel" onClick={() => setActionsOpen(false)}>Cancel</button>
          </BottomSheet>
        )}

        {/* Controlled: the return form opens from the sheet's row, not from a
            second button sitting on the item. */}
        {canReturn && (
          <ReturnMaterialSheet item={item} onReturn={onReturn} controlledOpen={returning} onOpenChange={setReturning} />
        )}
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  return (
    <div className={`mem-card${uncertain ? ' mem-card--unresolved' : ''}${isRow ? ' mem-card--row' : ''}`}>
      {/* Name left, price right, one baseline — the ledger's defining line.
          A row with no name (a plain note) leads with its summary instead, and
          the type is stated by the section it sits in, not a label on the row. */}
      <div className="mem-card-head">
        {name
          ? <p className="mem-card-item-name">{name}</p>
          : <p className="mem-card-summary">{item.summary}</p>
        }
        {price && <b className="mem-card-price">{price}</b>}
      </div>
      <StructuredFields item={item} dateLabel={isRow ? dateLabel : undefined} />
      {!isRow && dateLabel && <p className="mem-card-date">{dateLabel}</p>}

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

      {isRow && CATEGORY_TYPES.has(item.memoryType) && categories.length > 0 && !item.budgetCategoryId && (
        <button
          type="button"
          className="mem-card-pick"
          disabled={assigningCategory}
          aria-label={`Pick a category for ${item.materialName ?? item.summary}`}
          onClick={() => setPicking(true)}
        >
          {assigningCategory ? 'Saving…' : 'Pick category ›'}
        </button>
      )}

      {/* One action per row: the picker opens directly rather than putting a
          dropdown in the middle of the ledger. */}
      {picking && (
        <BottomSheet title="Pick a category" onClose={() => setPicking(false)}>
          <div className="pick-cat-list">
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                className="pick-cat-opt"
                onClick={() => { onAssignCategory(c.id); setPicking(false) }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {!isRow && CATEGORY_TYPES.has(item.memoryType) && categories.length > 0 && (
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
      ) : isRow ? (
        // On a row, source/fix/remove sit behind "…" so the row carries exactly
        // one visible action and stays at item scale.
        <div className="mem-row-overflow-wrap">
          <button
            type="button"
            className="btn-row-overflow"
            aria-label={`More actions for ${item.materialName ?? item.summary}`}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen(o => !o)}
          >⋯</button>
          {overflowOpen && (
            <div className="mem-row-menu" role="menu">
              {item.source && (
                <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); setShowSource(s => !s) }}>
                  {showSource ? 'Hide source' : 'Show source'}
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); onStartEdit() }}>Fix memory</button>
              <button type="button" role="menuitem" className="mem-row-menu-danger" disabled={mutating} onClick={() => { setOverflowOpen(false); setConfirmingRemove(true) }}>
                Remove item
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mem-card-footer">
          <SourceContext item={item} />
          <div className="mem-card-actions">
            {canReturn && <ReturnMaterialSheet item={item} onReturn={onReturn} />}
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
      {isRow && showSource && item.source && (
        <div className="mem-source-body mem-row-source">
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
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}
