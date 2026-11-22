import DirectAddForm from './DirectAddForm'
import MemoryCard from './MemoryCard'
import { friendlyDayLabel } from './memoryScan'
import type { JobMemory } from './useJobMemory'
export default function HoursTab({ mem }: { mem: JobMemory }) {
  const hours = mem.data?.hours
  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Hours">
      <section className="mem-hero" aria-label="Hours total">
        <p className="mem-hero-cap">Hours on this job</p>
        <p className="mem-hero-amount">
          {hours?.totalHours ?? '—'}
          <span className="mem-hero-unit">h</span>
        </p>
        <div className="hours-people">
          {hours?.people.map((p) => (
            <p key={p.name}>
              <span>{p.name}</span>
              <strong>{p.hours}h</strong>
            </p>
          ))}
        </div>
      </section>
      <DirectAddForm
        kind="labour"
        label="Add hours"
        sectionLabel="By day"
        people={hours?.people.map((p) => p.name)}
        onAdd={mem.addMemoryItem}
      />
      {mem.refreshError && (
        <p role="alert">
          Saved, but couldn’t refresh.{' '}
          <button type="button" onClick={() => void mem.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!hours && (
        <p role="alert">
          Could not load hours.{' '}
          <button type="button" onClick={mem.reload}>
            Try again
          </button>
        </p>
      )}
      {hours?.days.length === 0 && (
        <p className="mem-tab-empty">No hours yet. Add who worked and for how long.</p>
      )}
      {hours?.days.map((day) => (
        <section key={day.date} className="mem-section">
          <h2 className="mem-section-heading">
            {friendlyDayLabel(day.date)} · {day.totalHours}h
          </h2>
          {day.entries.map((entry) => {
            const original = mem.sectionItems('labour').find((i) => i.id === entry.memoryItemId)
            return original ? (
              <MemoryCard
                key={entry.memoryItemId}
                item={{
                  ...original,
                  labourPerson: entry.person,
                  labourHours: entry.hours,
                  labourTask: entry.task,
                  happenedAt: day.date,
                }}
                {...mem.cardProps(original)}
                variant="sheet"
              />
            ) : (
              <div key={entry.memoryItemId} className="mem-card">
                <p>
                  {entry.person} · {entry.hours}h
                </p>
                {entry.task && <p>{entry.task}</p>}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
