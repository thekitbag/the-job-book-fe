import { useEffect, useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import MemoryEditForm from './MemoryEditForm'
import { memoryItemToEdit } from './memoryEdit'
import { formatSavedStamp } from './SourceHistory'
import { canMoveToWorkshop, canPutBackInWorkshop, type WorkshopSourceControls } from './workshopSource'
import type { MemoryItemEdit, MemoryType, MemoryViewItem } from './types'

export function removalConsequences(item: MemoryViewItem): string[] {
  return [
    item.memoryType === 'returned_material'
      ? 'It will no longer show as returned.'
      : 'It will be removed from this job.',
    ...(item.source ? ['The original voice note will be kept.'] : []),
  ]
}

type Sub = 'actions' | 'source' | 'edit' | 'remove'

export default function ItemActionDrawer({
  open,
  onClose,
  item,
  title,
  meta,
  onReturnStart,
  workshop,
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
  // Materials leftover only: close this drawer and open the return flow.
  onReturnStart?: () => void
  workshop?: WorkshopSourceControls
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
  useEffect(() => {
    if (open) setSub('actions')
  }, [open])

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
    sub === 'source' ? 'Source' : sub === 'edit' ? 'Fix memory' : sub === 'remove' ? 'Remove item' : title

  const BackRow = (
    <button type="button" className="row-sheet-back" onClick={back}>
      ‹ Back
    </button>
  )

  return (
    <BottomSheet title={sheetTitle} onClose={onClose}>
      {sub === 'actions' && (
        <>
          {meta && <p className="row-sheet-sub">{meta}</p>}
          <div className="row-sheet-actions">
            {workshop && canMoveToWorkshop(item) && (
              <button
                type="button"
                className="row-sheet-opt row-sheet-opt--primary row-sheet-opt--stacked"
                disabled={workshop.pendingItemId === item.id}
                onClick={() => {
                  workshop.onMoveToWorkshop(item)
                  onClose()
                }}
              >
                <span className="row-sheet-opt-main">
                  <span className="row-sheet-opt-label">
                    {workshop.pendingItemId === item.id ? 'Moving…' : 'Move to the Workshop'}
                  </span>
                  <span className="row-sheet-opt-sub">Keep track of this material in the Workshop.</span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            )}
            {/* A used-up or never-there outcome stays correctable from the job
                it came from. It reactivates the same Workshop item — there is
                no path here that creates a second one. */}
            {workshop && canPutBackInWorkshop(item) && (
              <button
                type="button"
                className="row-sheet-opt"
                disabled={workshop.pendingItemId === item.id}
                onClick={() => {
                  workshop.onPutBackInWorkshop(item)
                  onClose()
                }}
              >
                {workshop.pendingItemId === item.id ? 'Putting back…' : 'Put back in the Workshop'}{' '}
                <span aria-hidden="true">›</span>
              </button>
            )}
            {onReturnStart && (
              <button type="button" className="row-sheet-opt" onClick={onReturnStart}>
                Mark as returned <span aria-hidden="true">›</span>
              </button>
            )}
            {move && (
              <button
                type="button"
                className="row-sheet-opt"
                disabled={mutating}
                onClick={() => {
                  onMove(move.type)
                  onClose()
                }}
              >
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
              <button
                type="button"
                className="row-sheet-opt row-sheet-opt--danger"
                onClick={() => setSub('remove')}
              >
                Remove item <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
          <button type="button" className="row-sheet-cancel" onClick={onClose}>
            Cancel
          </button>
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
                <blockquote className="mem-source-quote" data-builder-note>
                  {item.source.transcriptText}
                </blockquote>
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
            onSubmit={(edit) => {
              savingRef.current = true
              onSave(edit)
            }}
            onCancel={back}
          />
          {errorMsg && (
            <p className="queue-item-error" role="alert">
              {errorMsg}
            </p>
          )}
        </div>
      )}

      {sub === 'remove' && (
        <div className="row-sheet-substate">
          {BackRow}
          <div className="mem-remove-confirm">
            <p className="mem-remove-question">Remove this item?</p>
            {removalConsequences(item).map((line) => (
              <p key={line} className="mem-remove-consequence">
                {line}
              </p>
            ))}
            <div className="mem-remove-actions">
              <button type="button" className="btn-mem-remove-confirm" disabled={mutating} onClick={onRemove}>
                {mutating ? 'Removing…' : 'Remove'}
              </button>
              <button type="button" className="btn-mem-cancel" disabled={mutating} onClick={back}>
                Cancel
              </button>
            </div>
            {errorMsg && (
              <p className="queue-item-error" role="alert">
                {errorMsg}
              </p>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
