import { useState, type FormEvent } from 'react'
import {
  createWorkshopItem, markWorkshopItemUsedUp, markWorkshopItemWasntThere,
  patchWorkshopItem, putBackWorkshopItem, undoWorkshopMove,
} from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import type { WorkshopItem, WorkshopResponse } from './types'

/**
 * Workshop — what Mike thinks he may still have, and which job it came from.
 *
 * It is availability memory, not inventory. Nothing on this page is a quantity
 * the app has counted: every amount is the free text he said ("about 3 sheets",
 * "half a box", or nothing at all), shown back unchanged. Nothing on this page
 * is money either — there is no cost, no supplier, no Budget category and no
 * paid state in the Workshop model at all, so no action reachable from here can
 * move a figure anywhere else in the book.
 *
 * The list is only what is currently believed to be available. Used-up and
 * corrected material leaves it, and stays represented by its outcome on the
 * source job, which is where the evidence lives.
 *
 * No Record bar: recording always happens inside a named job, and the
 * voice-led workshop check is a later slice — so it is absent here, not
 * previewed, disabled or explained.
 */

// What a row says under the material: where it came from, how long it has been
// in there, and — only when it would otherwise confuse — that the source job is
// finished. "Added by hand" occupies the provenance slot for a manual item,
// because "no job" is a fact about the material, not a blank.
function provenance(item: WorkshopItem): string {
  const parts = [
    item.sourceLabel ?? item.sourceJobTitle ?? 'Added by hand',
    item.enteredWorkshopLabel,
  ]
  if (item.sourceJobStatus === 'finished') parts.push('finished job')
  return parts.filter(Boolean).join(' · ')
}

type Outcome = { kind: 'used_up' | 'wasnt_there'; item: WorkshopItem }

export default function WorkshopScreen({
  data,
  loadState,
  onBack,
  onReload,
  onOpenSourceItem,
}: {
  data: WorkshopResponse | null
  loadState: 'loading' | 'ready' | 'error'
  onBack: () => void
  onReload: () => void
  // Hands Mike back to the job the material came from, at the leftover itself.
  onOpenSourceItem: (target: { jobId: string; sourceMemoryItemId: string | null }) => void
}) {
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // The immediate result of a terminal outcome, and the only place its Undo
  // lives. It holds the item as it was, so Undo can name what it is putting
  // back even after the list behind has already dropped the row.
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const items = data?.availableItems ?? []
  const openItem = items.find(i => i.id === openItemId) ?? null

  const countLabel = data?.bookHome.availableLabel ?? null

  return (
    <div className="book-page">
      <header className="book-header book-header--sub">
        <button type="button" className="book-back" onClick={onBack} aria-label="Back to The Job Book">
          ‹ The Job Book
        </button>
        <h1 className="book-title book-title--sub">
          <span>Workshop</span>
          {/* No count when the workshop is empty: a bare "0 things" is a
              statement about stock, and this page never makes one. */}
          {countLabel && <span className="book-total ws-count">{countLabel}</span>}
        </h1>
      </header>

      <div className="book-body">
        {loadState === 'loading' && items.length === 0 && (
          <p className="mem-tab-empty">Loading…</p>
        )}

        {loadState === 'error' && (
          <div className="mem-known-spend-refresh" role="alert">
            <span>Couldn’t open the Workshop.</span>
            <button type="button" className="mem-known-spend-retry" onClick={onReload}>Try again</button>
          </div>
        )}

        {loadState === 'ready' && items.length === 0 && (
          // The whole empty state. No explanation of how job leftovers arrive,
          // no future voice copy, and no Record action.
          <div className="ws-empty">
            <p className="ws-empty-title">Nothing in the workshop yet</p>
            <button type="button" className="ws-empty-add" onClick={() => setAdding(true)}>
              Add one by hand<span className="book-chev" aria-hidden="true">›</span>
            </button>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="book-section-head book-section-head--ruled">
              <h2 className="book-section-label" id="whats-in-there">What&apos;s in there</h2>
              <button type="button" className="book-link" onClick={() => setAdding(true)}>Add by hand</button>
            </div>

            <ul className="ws-rows" aria-labelledby="whats-in-there">
              {items.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="ws-row"
                    aria-label={`Open ${item.materialName}`}
                    onClick={() => setOpenItemId(item.id)}
                  >
                    <span className="ws-row-main">
                      <span className="ws-row-name">{item.materialName}</span>
                      <span className="ws-row-meta">{provenance(item)}</span>
                    </span>
                    {/* Missing is missing. An absent amount leaves the column
                        empty rather than inventing a zero or a warning. */}
                    {item.roughAmount && <span className="ws-row-amount">{item.roughAmount}</span>}
                    <span className="book-chev" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {openItem && (
        <WorkshopItemSheet
          item={openItem}
          onClose={() => setOpenItemId(null)}
          onChanged={() => { setOpenItemId(null); onReload() }}
          onResolved={resolved => { setOpenItemId(null); setOutcome(resolved); onReload() }}
          onOpenSourceItem={target => { setOpenItemId(null); onOpenSourceItem(target) }}
        />
      )}

      {adding && (
        <AddByHandSheet
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); onReload() }}
        />
      )}

      {outcome && (
        <OutcomeSheet
          outcome={outcome}
          onClose={() => setOutcome(null)}
          onUndone={() => { setOutcome(null); onReload() }}
        />
      )}
    </div>
  )
}

// ── The item ────────────────────────────────────────────────────────────────

type Sub = 'actions' | 'edit'

function WorkshopItemSheet({
  item,
  onClose,
  onChanged,
  onResolved,
  onOpenSourceItem,
}: {
  item: WorkshopItem
  onClose: () => void
  onChanged: () => void
  onResolved: (outcome: Outcome) => void
  onOpenSourceItem: (target: { jobId: string; sourceMemoryItemId: string | null }) => void
}) {
  // One sub-state replacing the actions rather than stacking over them, the
  // same shape as every other item drawer in the app.
  const [sub, setSub] = useState<Sub>('actions')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceLinked = item.sourceKind === 'leftover' && !!item.sourceJobId

  const run = async (
    action: () => Promise<unknown>,
    fallback: string,
    after: () => void,
  ) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      after()
    } catch {
      // Nothing moved. The drawer stays open on the item it was opened for.
      setError(fallback)
      setBusy(false)
    }
  }

  if (sub === 'edit') {
    return (
      <ChangeWhatsThereSheet
        item={item}
        onBack={() => setSub('actions')}
        onSaved={onChanged}
      />
    )
  }

  const meta = sourceLinked
    ? [
        `Left over from ${item.sourceJobTitle}`,
        item.sourceJobStatus === 'finished' ? 'finished job' : null,
        `in here since ${item.enteredWorkshopLabel}`,
      ].filter(Boolean).join(' · ')
    : `Added by hand · ${item.enteredWorkshopLabel}`

  return (
    <BottomSheet title={item.materialName} onClose={onClose}>
      <p className="ws-sheet-kicker">In the workshop</p>
      {/* "You reckoned" — the amount is a remembered belief, and the words
          around it should never imply the app has been out and counted. */}
      {item.roughAmount && (
        <p className="ws-sheet-amount">
          <span className="ws-sheet-amount-label">You reckoned</span>
          <span className="ws-sheet-amount-value">{item.roughAmount}</span>
        </p>
      )}
      <p className="row-sheet-sub">{meta}</p>

      {error && <p className="queue-item-error" role="alert">{error}</p>}

      <div className="row-sheet-actions">
        <button type="button" className="row-sheet-opt row-sheet-opt--primary" disabled={busy} onClick={() => { setError(null); setSub('edit') }}>
          Change what&apos;s there <span aria-hidden="true">›</span>
        </button>

        {/* All used up and Wasn't there after all are different claims about
            the same material — one says it existed and has gone, the other says
            the memory was wrong — so they never share copy or a code path. */}
        <button
          type="button"
          className="row-sheet-opt row-sheet-opt--stacked"
          disabled={busy}
          onClick={() => void run(
            () => markWorkshopItemUsedUp(item.id),
            'Could not mark it used up — nothing changed. Try again.',
            () => {
              track('workshop_item_used_up', { source_kind: item.sourceKind })
              onResolved({ kind: 'used_up', item })
            },
          )}
        >
          <span className="row-sheet-opt-main">
            <span className="row-sheet-opt-label">All used up</span>
            <span className="row-sheet-opt-sub">It was there and it’s gone. Logged as used.</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>

        {sourceLinked && (
          <>
            <button
              type="button"
              className="row-sheet-opt"
              disabled={busy}
              onClick={() => {
                track('workshop_source_opened', { job_id: item.sourceJobId })
                onOpenSourceItem({ jobId: item.sourceJobId!, sourceMemoryItemId: item.sourceMemoryItemId })
              }}
            >
              Open {item.sourceJobTitle} <span aria-hidden="true">›</span>
            </button>

            {/* Undoing the move is not an outcome: it says the material should
                only ever have been a leftover on its job. */}
            <button
              type="button"
              className="row-sheet-opt"
              disabled={busy}
              onClick={() => void run(
                () => undoWorkshopMove(item.id),
                'Could not undo the move — nothing changed. Try again.',
                () => { track('workshop_move_undone', { source_kind: item.sourceKind }); onChanged() },
              )}
            >
              Undo move to the Workshop <span aria-hidden="true">›</span>
            </button>
          </>
        )}

        <button
          type="button"
          className="row-sheet-opt row-sheet-opt--danger row-sheet-opt--stacked"
          disabled={busy}
          onClick={() => void run(
            () => markWorkshopItemWasntThere(item.id),
            'Could not correct it — nothing changed. Try again.',
            () => {
              track('workshop_item_wasnt_there', { source_kind: item.sourceKind })
              onResolved({ kind: 'wasnt_there', item })
            },
          )}
        >
          <span className="row-sheet-opt-main">
            <span className="row-sheet-opt-label">Wasn&apos;t there after all</span>
            {/* Only a source-linked item gets the cost reassurance, because only
                it has a job whose cost a correction might seem to threaten. */}
            {sourceLinked && (
              <span className="row-sheet-opt-sub">Logged as never there. {item.sourceJobTitle} keeps its cost.</span>
            )}
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <button type="button" className="row-sheet-cancel" onClick={onClose}>Close</button>
    </BottomSheet>
  )
}

// ── Change what's there ─────────────────────────────────────────────────────

function ChangeWhatsThereSheet({
  item,
  onBack,
  onSaved,
}: {
  item: WorkshopItem
  onBack: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(item.materialName)
  const [amount, setAmount] = useState(item.roughAmount ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A source-linked item's material is corrected where the leftover itself
  // lives — on its job — so that one memory keeps one name. Only the rough
  // amount, which is the Workshop's own current belief, is editable here.
  const canRename = item.sourceKind === 'manual'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await patchWorkshopItem(item.id, canRename
        ? { materialName: name.trim(), roughAmount: amount }
        : { roughAmount: amount })
      track('workshop_item_changed', { source_kind: item.sourceKind, has_rough_amount: amount.trim() !== '' })
      onSaved()
    } catch {
      setError('Could not save that — try again')
      setBusy(false)
    }
  }

  return (
    <BottomSheet title="Change what's there" onClose={onBack}>
      <div className="row-sheet-substate">
        <button type="button" className="row-sheet-back" onClick={onBack}>‹ Back</button>
        <form className="pay-form" aria-label="Change what's there" onSubmit={e => void submit(e)}>
          {canRename ? (
            <label className="queue-field">
              <span className="queue-field-label">What it is</span>
              <input
                className="queue-field-input"
                name="materialName"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </label>
          ) : (
            <p className="ws-form-static">{item.materialName}</p>
          )}
          <label className="queue-field">
            <span className="queue-field-label">Rough amount</span>
            {/* Free text, and it stays free text: "about", "part of", "4 or 5"
                and blank are all correct answers. */}
            <input
              className="queue-field-input"
              name="roughAmount"
              value={amount}
              placeholder="About how much?"
              onChange={e => setAmount(e.target.value)}
            />
          </label>
          {error && <p className="queue-item-error" role="alert">{error}</p>}
          <div className="pay-form-actions">
            <button type="submit" className="btn-queue-save" disabled={busy || (canRename && !name.trim())}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-queue-cancel" disabled={busy} onClick={onBack}>Cancel</button>
          </div>
        </form>
      </div>
    </BottomSheet>
  )
}

// ── Add by hand ─────────────────────────────────────────────────────────────

function AddByHandSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createWorkshopItem({ materialName: name.trim(), roughAmount: amount })
      track('workshop_item_added_by_hand', { has_rough_amount: amount.trim() !== '' })
      onAdded()
    } catch {
      setError('Could not add that — try again')
      setBusy(false)
    }
  }

  return (
    <BottomSheet title="Add by hand" onClose={onClose}>
      {/* Two fields, and only two. No supplier, price, Budget category,
          location, unit or source job: none of them is what a workshop shelf
          knows about itself, and asking would turn remembering into admin. */}
      <form className="pay-form" aria-label="Add by hand" onSubmit={e => void submit(e)}>
        <label className="queue-field">
          <span className="queue-field-label">What it is</span>
          <input
            className="queue-field-input"
            name="materialName"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </label>
        <label className="queue-field">
          <span className="queue-field-label">Rough amount (optional)</span>
          <input
            className="queue-field-input"
            name="roughAmount"
            value={amount}
            placeholder="About how much?"
            onChange={e => setAmount(e.target.value)}
          />
        </label>
        {error && <p className="queue-item-error" role="alert">{error}</p>}
        <div className="pay-form-actions">
          <button type="submit" className="btn-queue-save" disabled={busy || !name.trim()}>
            {busy ? 'Adding…' : 'Add to the workshop'}
          </button>
          <button type="button" className="btn-queue-cancel" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </BottomSheet>
  )
}

// ── The immediate result of a terminal outcome ──────────────────────────────

/**
 * Both terminal outcomes are one tap away and both materially change the list,
 * so each one answers with what it did and an immediate way back.
 *
 * The Undo here is deliberately not called "Undo move": it reverses the mistaken
 * outcome and leaves the material in the Workshop, which is a different thing
 * from saying it should never have been moved there.
 */
function OutcomeSheet({
  outcome,
  onClose,
  onUndone,
}: {
  outcome: Outcome
  onClose: () => void
  onUndone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { item, kind } = outcome
  const title = kind === 'used_up' ? 'All used up' : 'Wasn’t there after all'

  const undo = async () => {
    setBusy(true)
    setError(null)
    try {
      await putBackWorkshopItem(item.id)
      track('workshop_outcome_undone', { outcome: kind, source_kind: item.sourceKind })
      onUndone()
    } catch {
      setError('Could not undo that — try again')
      setBusy(false)
    }
  }

  return (
    <BottomSheet title={title} onClose={onClose}>
      <p className="ws-result-line">
        {[item.materialName, item.roughAmount].filter(Boolean).join(' · ')}
      </p>
      {item.sourceJobTitle && <p className="row-sheet-sub">From {item.sourceJobTitle}</p>}
      {error && <p className="queue-item-error" role="alert">{error}</p>}
      <div className="row-sheet-actions">
        <button type="button" className="row-sheet-opt row-sheet-opt--primary" disabled={busy} onClick={() => void undo()}>
          {busy ? 'Undoing…' : 'Undo'} <span aria-hidden="true">›</span>
        </button>
      </div>
      <button type="button" className="row-sheet-cancel" onClick={onClose}>Done</button>
    </BottomSheet>
  )
}
