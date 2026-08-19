import { useState } from 'react'
import { undoWorkshopMove } from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import type { WorkshopItem } from './types'

/**
 * What just happened, and the two ways out of it.
 *
 * Deliberately short. It names the material, the rough amount in Mike's own
 * words and the job it came from — and then stops. No Budget total, no Money
 * total, no checklist of internal effects, no second explanation of the data
 * model: the consequence line on the action he tapped already answered the money
 * question, and repeating it here would suggest something had in fact moved.
 */
export default function MoveToWorkshopResult({
  workshopItem,
  onSeeInWorkshop,
  onUndone,
  onClose,
}: {
  workshopItem: WorkshopItem
  onSeeInWorkshop: () => void
  onUndone: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const undo = async () => {
    setBusy(true)
    setError(null)
    try {
      await undoWorkshopMove(workshopItem.id)
      track('workshop_move_undone', { source_kind: workshopItem.sourceKind })
      onUndone()
    } catch {
      // The move stands. Saying so matters more than the failure itself: the
      // material must not be left in a state Mike can't predict.
      setError('Could not undo the move — it is still in the Workshop. Try again.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet title="Moved to the Workshop" onClose={onClose}>
      <p className="ws-result-line">
        {[workshopItem.materialName, workshopItem.roughAmount].filter(Boolean).join(' · ')}
      </p>
      {workshopItem.sourceJobTitle && (
        <p className="row-sheet-sub">From {workshopItem.sourceJobTitle}</p>
      )}
      {error && <p className="queue-item-error" role="alert">{error}</p>}
      <div className="row-sheet-actions">
        <button type="button" className="row-sheet-opt row-sheet-opt--primary" disabled={busy} onClick={onSeeInWorkshop}>
          See in the Workshop <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="row-sheet-opt" disabled={busy} onClick={() => void undo()}>
          {busy ? 'Undoing…' : 'Undo move to the Workshop'} <span aria-hidden="true">›</span>
        </button>
      </div>
      <button type="button" className="row-sheet-cancel" onClick={onClose}>Done</button>
    </BottomSheet>
  )
}
