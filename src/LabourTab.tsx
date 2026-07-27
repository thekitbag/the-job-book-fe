import { useState } from 'react'
import EmptyState from './EmptyState'
import ItemActionDrawer from './ItemActionDrawer'
import AddHoursDrawer from './LabourAdd'
import { PeopleSummary, ManagePeopleDrawer, useLabourPeople } from './LabourPeople'
import { friendlyDayLabel } from './memoryScan'
import type { JobMemory } from './useJobMemory'
import type { LabourDayItem } from './types'

// Labour is an hours-only workspace (labour-hours-budget-costs-paid-undo spec):
// who worked, when, for how many hours, on what. No rate, cost, paid state, or
// Budget treatment lives here — Budget owns cost, Money owns movement.

// A labour entry as a tappable ledger row: tapping opens the shared item action
// drawer (source / fix / remove). The row states the person, task, and hours.
function LabourEntry({ entry, mem }: { entry: LabourDayItem; mem: JobMemory }) {
  const { sectionItems, cardProps } = mem
  const item = sectionItems('labour').find(i => i.id === entry.memoryItemId)
  const p = item ? cardProps(item, false) : null
  const [drawerOpen, setDrawerOpen] = useState(false)

  const person = entry.labourPerson?.trim()
  const task = entry.labourTask?.trim()
  const title = task || person || 'Labour'
  const meta = [person, task, entry.hoursLabel].filter(Boolean).join(' · ')

  const Row = (
    <div className="labour-entry-row">
      <div className="labour-entry-main">
        <p className="labour-entry-headline">
          <strong className="labour-entry-person">{entry.labourPerson ?? 'Labour'}</strong>
        </p>
        {entry.worthChecking
          ? <p className="labour-entry-check">Worth checking — not counted in totals</p>
          : task && <p className="labour-entry-effect labour-entry-effect--hours">{task}</p>}
      </div>
      <div className="labour-entry-side">
        {entry.hoursLabel && <span className="labour-entry-hours-big">{entry.hoursLabel}</span>}
        {p && <span className="mem-row-tap-chev" aria-hidden="true">›</span>}
      </div>
    </div>
  )

  if (!item || !p) return <div className="labour-entry">{Row}</div>

  return (
    <div className={`labour-entry${entry.worthChecking ? ' labour-entry--unresolved' : ''}`}>
      <button type="button" className="labour-entry-tap" aria-label={`Open actions for ${title}`} onClick={() => setDrawerOpen(true)}>
        {Row}
      </button>
      {p.errorMsg && !drawerOpen && <p className="queue-item-error" role="alert">{p.errorMsg}</p>}
      <ItemActionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        item={item}
        title={title}
        meta={meta || null}
        categories={[]}
        onAssignCategory={() => {}}
        assigningCategory={false}
        onMove={() => {}}
        mutating={p.mutating}
        submitting={p.submitting}
        errorMsg={p.errorMsg}
        onSave={p.onSave}
        onRemove={p.onRemove}
      />
    </div>
  )
}

export default function LabourTab({ mem, jobId }: { mem: JobMemory; jobId: string }) {
  const { labourHours, addMemoryItem, refreshError, refetch } = mem
  const days = labourHours?.days ?? []
  const people = useLabourPeople(jobId)

  const [managing, setManaging] = useState(false)
  const [adding, setAdding] = useState(false)

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Labour">
      {/* Hours hero — the same ink band as Budget/Money. Hours are the whole
          story on this page; cost lives in Budget. */}
      <section className="mem-hero" aria-label="Labour hours">
        <p className="mem-hero-amount">
          {labourHours?.totalHours ? `${labourHours.totalHours}h` : 'None yet'}
          {labourHours?.totalHours && <span className="mem-hero-of"> on this job</span>}
        </p>
      </section>

      {/* People summary + Manage — names and hours only. */}
      {people.loadState === 'ready' && people.data && (
        <PeopleSummary people={people.data.people} onManage={() => setManaging(true)} />
      )}

      {days.length > 0 && (
        <div className="lens-add-head">
          <span className="lens-add-label">Labour</span>
          <button type="button" className="btn-lens-add-text" onClick={() => setAdding(true)}>+ Add hours</button>
        </div>
      )}

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {days.length === 0 ? (
        <EmptyState
          title="No hours logged yet"
          hint="Keep track of who worked, how many hours, and which day — or say it with Record."
          action={<button type="button" className="btn-add-labour-save" onClick={() => setAdding(true)}>Add hours</button>}
        />
      ) : (
        days.map(day => (
          <section key={day.date || 'day-not-known'} className="labour-day" aria-label={`Labour ${friendlyDayLabel(day.date)}`}>
            <div className="labour-day-head">
              <h3 className="labour-day-label">{friendlyDayLabel(day.date)}</h3>
              {day.totalLabel && <span className="labour-day-total">{day.totalLabel}</span>}
            </div>
            {day.items.map(entry => <LabourEntry key={entry.memoryItemId} entry={entry} mem={mem} />)}
          </section>
        ))
      )}

      <ManagePeopleDrawer
        jobId={jobId}
        people={people.data?.people ?? []}
        open={managing}
        onClose={() => setManaging(false)}
        onChanged={() => void people.reload()}
      />

      <AddHoursDrawer
        jobId={jobId}
        people={people.data?.people ?? []}
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={async req => { const created = await addMemoryItem(req); void people.reload(); return created }}
        onPeopleChanged={() => void people.reload()}
      />
    </div>
  )
}
