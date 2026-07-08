import DirectAddForm from './DirectAddForm'
import EmptyState from './EmptyState'
import MemoryEditForm from './MemoryEditForm'
import { memoryItemToEdit } from './memoryEdit'
import { friendlyDayLabel } from './memoryScan'
import type { JobMemory } from './useJobMemory'
import type { LabourDayItem } from './types'

// The Labour lens as a daily view: job total hours up top, then day groups
// (newest first) with a safe day total each. Entries lead with person / hours /
// task; money is secondary copy (the trusted line total, or "No cost added").
// Worth-checking labour stays visible but is excluded from the hour totals.
// Driven by the backend labourHoursSummary (local fallback for older APIs).

function LabourEntry({ entry, mem }: { entry: LabourDayItem; mem: JobMemory }) {
  const { sectionItems, cardProps } = mem
  // Join back to the full memory-view item so Fix memory edits in place.
  const item = sectionItems('labour').find(i => i.id === entry.memoryItemId)
  const p = item ? cardProps(item, false) : null

  if (item && p?.isEditing) {
    return (
      <div className="labour-entry labour-entry--editing">
        <MemoryEditForm initial={memoryItemToEdit(item)} submitting={p.submitting} onSubmit={p.onSave} onCancel={p.onCancelEdit} />
        {p.errorMsg && <p className="queue-item-error" role="alert">{p.errorMsg}</p>}
      </div>
    )
  }

  return (
    <div className={`labour-entry${entry.worthChecking ? ' labour-entry--unresolved' : ''}`}>
      <div className="labour-entry-row">
        <div className="labour-entry-main">
          <p className="labour-entry-headline">
            <strong className="labour-entry-person">{entry.labourPerson ?? 'Labour'}</strong>
            {entry.hoursLabel && <span className="labour-entry-hours">{entry.hoursLabel}</span>}
          </p>
          {entry.labourTask && <p className="labour-entry-task">{entry.labourTask}</p>}
          {entry.worthChecking && <p className="labour-entry-check">Worth checking — not counted in totals</p>}
        </div>
        <div className="labour-entry-side">
          <span className="labour-entry-cost">{entry.lineTotalLabel ?? 'No cost added'}</span>
          {p && <button type="button" className="btn-mem-fix" onClick={p.onStartEdit}>Fix memory</button>}
        </div>
      </div>
      {p?.errorMsg && <p className="queue-item-error" role="alert">{p.errorMsg}</p>}
    </div>
  )
}

export default function LabourTab({ mem }: { mem: JobMemory }) {
  const { labourHours, addMemoryItem, refreshError, refetch } = mem
  const days = labourHours?.days ?? []

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Labour">
      <DirectAddForm kind="labour" label="Add labour" sectionLabel="Labour" onAdd={addMemoryItem} />

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {days.length === 0 ? (
        <EmptyState
          title="No labour logged yet"
          hint="Keep track of who worked, how many hours, and which day — or say it with Record."
          action={<DirectAddForm kind="labour" variant="button" buttonLabel="+ Add manually" label="Add labour" onAdd={addMemoryItem} />}
        />
      ) : (
        <>
          <section className="labour-job-total" aria-label="Labour hours">
            <p className="labour-job-total-cap">Labour hours</p>
            <p className="labour-job-total-value">{labourHours?.totalLabel ?? 'No hours yet'}</p>
          </section>

          {days.map(day => (
            <section key={day.date || 'day-not-known'} className="labour-day" aria-label={`Labour ${friendlyDayLabel(day.date)}`}>
              <div className="labour-day-head">
                <h3 className="labour-day-label">{friendlyDayLabel(day.date)}</h3>
                {day.totalLabel && <span className="labour-day-total">{day.totalLabel}</span>}
              </div>
              {day.items.map(entry => <LabourEntry key={entry.memoryItemId} entry={entry} mem={mem} />)}
            </section>
          ))}
        </>
      )}
    </div>
  )
}
