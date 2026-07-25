import { useEffect, useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import MemoryEditForm from './MemoryEditForm'
import { memoryItemToEdit } from './memoryEdit'
import { formatSavedStamp } from './SourceHistory'
import { safeRefund } from './memoryScan'
import type { MarkPaidControls } from './markPaid'
import type { BudgetCategory, MemoryItemEdit, MemoryType, MemoryViewItem } from './types'

const SPEND_TYPES = new Set<string>(['ordered_material', 'labour'])

// What removing this item actually costs Mike, in his terms. The source line
// matters most: removing a fact must never read as deleting the voice note.
export function removalConsequences(item: MemoryViewItem): string[] {
  const lines: string[] = []
  if (SPEND_TYPES.has(item.memoryType)) lines.push('It will no longer count towards Budget.')
  else if (item.memoryType === 'returned_material') {
    lines.push('It will no longer show as returned.')
    if (safeRefund(item)) lines.push('Its refund will stop coming off your Budget.')
  } else if (item.memoryType === 'general_note') lines.push('It will be removed from the job log.')
  else lines.push('It will be removed from this job.')
  if (item.source) lines.push('The original voice note will be kept.')
  return lines
}

// The single item-action drawer. One BottomSheet whose content pushes/replaces
// between the action list and focused sub-states — Show source, Fix memory, and
// Remove item — with Back returning to the actions. No stacked drawers, no inline
// page expansion, no navigation away for a normal edit. Used by every remembered
// item row (Budget / Labour / Materials / Job log) so the interaction is one shape.
type Sub = 'actions' | 'source' | 'edit' | 'remove' | 'category'

export default function ItemActionDrawer({
  open,
  onClose,
  item,
  title,
  meta,
  costLine,
  categories,
  canPickCategory = false,
  onAssignCategory,
  assigningCategory,
  onReturnStart,
  markPaid,
  move,
  onMove,
  canEdit = true,
  canRemove = true,
  mutating,
  submitting,
  errorMsg,
  onSave,
  onRemove,
}: {
  open: boolean
  onClose: () => void
  item: MemoryViewItem
  title: string
  meta?: string | null
  costLine?: string | null
  categories: BudgetCategory[]
  canPickCategory?: boolean
  onAssignCategory: (categoryId: string | null) => void
  assigningCategory: boolean
  // Materials leftover only: close this drawer and open the return flow.
  onReturnStart?: () => void
  // Budget cost items only: mark the item paid (records Money out, not Budget).
  markPaid?: MarkPaidControls
  move?: { type: MemoryType; label: string }
  onMove: (type: MemoryType) => void
  canEdit?: boolean
  canRemove?: boolean
  mutating: boolean
  submitting: boolean
  errorMsg: string | null
  onSave: (edit: MemoryItemEdit) => void
  onRemove: () => void
}) {
  const [sub, setSub] = useState<Sub>('actions')
  // Each time the drawer opens, start on the action list.
  useEffect(() => { if (open) setSub('actions') }, [open])

  // Close on a successful edit save: the edit sub-state initiates a save, and
  // when submitting settles with no error we dismiss; a failure keeps the form
  // mounted (values preserved) with its error.
  const savingRef = useRef(false)
  useEffect(() => {
    if (savingRef.current && !submitting) {
      savingRef.current = false
      if (!errorMsg) onClose()
    }
  }, [submitting, errorMsg, onClose])

  if (!open) return null

  const back = () => setSub('actions')

  const sheetTitle =
    sub === 'source' ? 'Source' :
    sub === 'edit' ? 'Fix memory' :
    sub === 'remove' ? 'Remove item' :
    sub === 'category' ? 'Choose a category' :
    title

  const BackRow = (
    <button type="button" className="row-sheet-back" onClick={back}>‹ Back</button>
  )

  return (
    <BottomSheet title={sheetTitle} onClose={onClose}>
      {sub === 'actions' && (
        <>
          {meta && <p className="row-sheet-sub">{meta}</p>}
          {costLine && <p className="row-sheet-cost">{costLine}</p>}
          {/* Paid state is stated plainly, above the actions, so the drawer says
              where the money is without turning Budget into a payments ledger. */}
          {markPaid?.isPaid(item) && (
            <p className="row-sheet-paid" role="status"><span aria-hidden="true">✓ </span>Paid — recorded in Money out</p>
          )}
          <div className="row-sheet-actions">
            {/* Mark as paid records actual Money out; it never changes Budget
                cost. Only shown for an eligible, unpaid, trusted GBP cost item. */}
            {markPaid && !markPaid.isPaid(item) && markPaid.canMarkPaid(item) && (
              <button
                type="button"
                className="row-sheet-opt row-sheet-opt--pay"
                disabled={markPaid.pendingItemId === item.id}
                onClick={() => { markPaid.onMarkPaid(item); onClose() }}
              >
                {markPaid.pendingItemId === item.id ? 'Marking paid…' : 'Mark as paid'} <span aria-hidden="true">›</span>
              </button>
            )}
            {canPickCategory && (
              <button type="button" className="row-sheet-opt" disabled={assigningCategory} onClick={() => setSub('category')}>
                Choose category <span aria-hidden="true">›</span>
              </button>
            )}
            {onReturnStart && (
              <button type="button" className="row-sheet-opt" onClick={onReturnStart}>
                Mark as returned <span aria-hidden="true">›</span>
              </button>
            )}
            {move && (
              <button type="button" className="row-sheet-opt" disabled={mutating} onClick={() => { onMove(move.type); onClose() }}>
                {move.label} <span aria-hidden="true">›</span>
              </button>
            )}
            {item.source && (
              <button type="button" className="row-sheet-opt" onClick={() => setSub('source')}>
                Show source <span aria-hidden="true">›</span>
              </button>
            )}
            {canEdit && (
              <button type="button" className="row-sheet-opt" onClick={() => setSub('edit')}>
                Fix memory <span aria-hidden="true">›</span>
              </button>
            )}
            {canRemove && (
              <button type="button" className="row-sheet-opt row-sheet-opt--danger" onClick={() => setSub('remove')}>
                Remove item <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
          <button type="button" className="row-sheet-cancel" onClick={onClose}>Cancel</button>
        </>
      )}

      {sub === 'source' && item.source && (
        <div className="row-sheet-substate">
          {BackRow}
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
        </div>
      )}

      {sub === 'edit' && (
        <div className="row-sheet-substate">
          {BackRow}
          <MemoryEditForm
            initial={memoryItemToEdit(item)}
            submitting={submitting}
            categories={categories}
            onSubmit={edit => { savingRef.current = true; onSave(edit) }}
            onCancel={back}
          />
          {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
        </div>
      )}

      {sub === 'remove' && (
        <div className="row-sheet-substate">
          {BackRow}
          <div className="mem-remove-confirm">
            <p className="mem-remove-question">Remove this item?</p>
            {removalConsequences(item).map(line => (
              <p key={line} className="mem-remove-consequence">{line}</p>
            ))}
            <div className="mem-remove-actions">
              <button type="button" className="btn-mem-remove-confirm" disabled={mutating} onClick={onRemove}>
                {mutating ? 'Removing…' : 'Remove'}
              </button>
              <button type="button" className="btn-mem-cancel" disabled={mutating} onClick={back}>Cancel</button>
            </div>
            {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
          </div>
        </div>
      )}

      {sub === 'category' && (
        <div className="row-sheet-substate">
          {BackRow}
          <div className="pick-cat-list">
            {categories.map(c => (
              <button key={c.id} type="button" className="pick-cat-opt" disabled={assigningCategory} onClick={() => { onAssignCategory(c.id); onClose() }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
