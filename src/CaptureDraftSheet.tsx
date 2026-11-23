import { useEffect, useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import {
  confirmCaptureDraft,
  getCaptureDraft,
  getReviewQueue,
  submitQueueDecision,
} from './api'
import type { CaptureDraft, CaptureDraftItem } from './captureTypes'
import type { ProposedMemory } from './types'
import { announceCaptureChange } from './captureEvents'
import { getCaptureSessionId } from './localOwner'
import { track } from './analytics'
const materialLabel = {
  bought: 'Bought',
  used: 'Used',
  left_over: 'Left over',
  returned: 'Returned',
}
export function DraftValues({ item }: { item: CaptureDraftItem }) {
  return item.kind === 'hours' ? (
    <>
      <strong>{item.person ?? 'Person unclear'}</strong>
      <span>{item.hours ?? 'Hours unclear'} hours</span>
      <span>{item.day}</span>
    </>
  ) : (
    <>
      <strong>
        {materialLabel[item.state]} · {item.item ?? 'Material unclear'}
      </strong>
      <span>{item.amount}</span>
      {item.supplier && <span>{item.supplier}</span>}
      {item.notes && <span>{item.notes}</span>}
    </>
  )
}
function correction(pm: ProposedMemory): ProposedMemory {
  return {
    memoryType: pm.memoryType,
    summary:
      pm.memoryType === 'labour'
        ? [
            pm.labourPerson,
            pm.labourHours ? `${pm.labourHours} hours` : null,
            pm.labourTask,
          ]
            .filter(Boolean)
            .join(' · ')
        : [
            pm.materialName,
            pm.quantity,
            pm.unit,
            pm.supplierName,
            pm.locationOrUse,
          ]
            .filter(Boolean)
            .join(' · '),
    materialName: pm.materialName,
    quantity: pm.quantity,
    unit: pm.unit,
    supplierName: pm.supplierName,
    locationOrUse: pm.locationOrUse,
    deliveryTiming: pm.deliveryTiming,
    labourHours: pm.labourHours,
    labourPerson: pm.labourPerson,
    labourTask: pm.labourTask,
    happenedAt: pm.happenedAt,
  }
}
export default function CaptureDraftSheet({
  noteId,
  jobId,
  onClose,
  onOpenChecks,
  onVisible,
  jobTitle,
}: {
  noteId: string
  jobId: string
  onClose: () => void
  onOpenChecks: () => void
  onVisible?: (visible: boolean) => void
  jobTitle?: string
}) {
  const [draft, setDraft] = useState<CaptureDraft | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [fix, setFix] = useState(false),
    [editing, setEditing] = useState<{
      item: CaptureDraftItem
      pm: ProposedMemory
    } | null>(null),
    [sure, setSure] = useState(false)
  const locked = useRef(false),
    mounted = useRef(true),
    closed = useRef(false),
    boundary = useRef(getCaptureSessionId()),
    callbacks = useRef({ onClose, onOpenChecks, onVisible })
  callbacks.current = { onClose, onOpenChecks, onVisible }
  const active = () =>
    mounted.current &&
    !closed.current &&
    boundary.current === getCaptureSessionId()
  const reread = async () => {
    const fresh = await getCaptureDraft(noteId)
    if (active()) {
      if (
        fresh.state === 'failed' ||
        (fresh.state === 'ready' &&
          !fresh.items.length &&
          !fresh.moreToCheckCount)
      ) {
        closed.current = true
        callbacks.current.onClose()
      } else setDraft(fresh)
    }
    return fresh
  }
  useEffect(() => {
    mounted.current = true
    closed.current = false
    let polling = false
    const close = () => {
      if (closed.current) return
      closed.current = true
      callbacks.current.onClose()
    }
    const poll = async () => {
      if (
        polling ||
        closed.current ||
        !navigator.onLine ||
        document.visibilityState === 'hidden' ||
        locked.current
      )
        return
      polling = true
      try {
        const fresh = await getCaptureDraft(noteId)
        if (active()) {
          if (
            fresh.state === 'failed' ||
            (fresh.state === 'ready' &&
              !fresh.items.length &&
              !fresh.moreToCheckCount)
          )
            close()
          else {
            callbacks.current.onVisible?.(fresh.state === 'ready')
            setDraft(fresh)
          }
        }
      } catch {
        /* Leave the recording safe and permit quiet timeout. */
      } finally {
        polling = false
      }
    }
    void poll()
    const interval = setInterval(() => {
        void poll()
      }, 1500),
      timeout = setTimeout(close, 20_000)
    const hidden = () => {
      if (document.visibilityState === 'hidden') close()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      mounted.current = false
      clearInterval(interval)
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', hidden)
    }
    // Callbacks and mutable boundary guards intentionally live in refs so parent
    // updates cannot restart the polling window or reopen a dismissed sheet.
  }, [noteId])
  const confirm = async () => {
    if (locked.current || !draft?.items.length || closed.current) return
    locked.current = true
    setBusy(true)
    setError('')
    const ids = draft.items.map((i) => i.queueItemId)
    track('looks_right_tapped', { item_count: ids.length })
    try {
      await confirmCaptureDraft(noteId, ids)
      if (active()) {
        announceCaptureChange()
        onClose()
      }
    } catch (e) {
      if (!active()) return
      if ((e as { code?: string }).code === 'DRAFT_CHANGED') {
        setError(
          'Nothing was confirmed. What was picked out has changed — please check it again.',
        )
        await reread().catch(() => {})
      } else setError('Could not confirm this yet. Try again.')
    } finally {
      locked.current = false
      if (active()) setBusy(false)
    }
  }
  const decide = async (item: CaptureDraftItem, corrected?: ProposedMemory) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      await submitQueueDecision(jobId, {
        queueItemId: item.queueItemId,
        action: corrected ? 'correct' : 'dismiss',
        ...(corrected
          ? {
              corrected: correction(corrected),
              uncertaintyResolution: sure ? 'resolved' : 'still_unsure',
            }
          : {}),
      })
      announceCaptureChange()
      if (active()) {
        setEditing(null)
        await reread()
      }
    } catch {
      if (active())
        setError('Nothing changed. Refresh the draft and try again.')
    } finally {
      locked.current = false
      if (active()) setBusy(false)
    }
  }
  const edit = async (item: CaptureDraftItem) => {
    if (locked.current) return
    locked.current = true
    try {
      const queue = await getReviewQueue(jobId),
        entry = queue.sections
          .flatMap((s) => s.items)
          .find((i) => i.id === item.queueItemId)
      if (active()) {
        if (entry) {
          setEditing({ item, pm: { ...entry.proposedMemory } })
          setSure(false)
        } else {
          setError('That item changed. Please check it again.')
          await reread()
        }
      }
    } catch {
      setError('Could not open this item. Try again.')
    } finally {
      locked.current = false
    }
  }
  if (
    !draft ||
    draft.state !== 'ready' ||
    (!draft.items.length && !draft.moreToCheckCount) ||
    closed.current
  )
    return null
  return (
    <BottomSheet
      title={fix ? 'Fix what I got' : "Here's what I got"}
      onClose={onClose}
    >
      {jobTitle && <p>Saved to {jobTitle}</p>}
      {editing ? (
        <form
          className="capture-fix-form"
          onSubmit={(e) => {
            e.preventDefault()
            void decide(editing.item, editing.pm)
          }}
        >
          {(editing.item.kind === 'hours'
            ? [
                ['labourPerson', 'Person'],
                ['labourHours', 'Hours'],
              ]
            : [
                ['materialName', 'Material'],
                ['quantity', 'Amount'],
                ['unit', 'Unit'],
                ['supplierName', 'Supplier'],
                ['locationOrUse', 'Notes'],
              ]
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={String(editing.pm[key as keyof ProposedMemory] ?? '')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    pm: { ...editing.pm, [key]: e.target.value || null },
                  })
                }
                required={key === 'labourHours' || key === 'materialName'}
              />
            </label>
          ))}
          {editing.item.uncertain && (
            <label>
              <input
                type="checkbox"
                checked={sure}
                onChange={(e) => setSure(e.target.checked)}
              />
              I’ve checked this and I’m sure now
            </label>
          )}
          <button className="capture-primary" type="submit" disabled={busy}>
            Save fix
          </button>
          <button
            className="capture-secondary"
            type="button"
            onClick={() => setEditing(null)}
          >
            Back
          </button>
        </form>
      ) : (
        <>
          <ul className="capture-draft-items">
            {draft.items.map((item) => (
              <li key={item.queueItemId}>
                <div className="capture-draft-values" data-builder-note>
                  <DraftValues item={item} />
                </div>
                {item.uncertain && (
                  <p className="capture-uncertain">
                    Not certain — please check
                  </p>
                )}
                {fix && (
                  <div className="capture-item-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void edit(item)
                      }}
                    >
                      Edit {item.kind === 'hours' ? item.person : item.item}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void decide(item)
                      }}
                      aria-label={`Drop ${item.kind === 'hours' ? item.person : item.item}`}
                    >
                      Drop
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {draft.moreToCheckCount > 0 && (
            <p>
              {draft.moreToCheckCount} more{' '}
              {draft.moreToCheckCount === 1 ? 'thing' : 'things'} to check on
              this job.{' '}
              <button
                className="capture-link"
                type="button"
                onClick={onOpenChecks}
              >
                Things to check
              </button>
            </p>
          )}
          {draft.items.length > 0 && (
            <div className="capture-actions">
              <button
                className="capture-primary"
                type="button"
                disabled={busy}
                onClick={() => {
                  void confirm()
                }}
              >
                Looks right
              </button>
              <button
                className="capture-secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setFix((v) => !v)
                  track('fix_opened')
                }}
              >
                {fix ? 'Back' : 'Fix'}
              </button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="capture-link" type="button" onClick={onClose}>
        Done
      </button>
    </BottomSheet>
  )
}
