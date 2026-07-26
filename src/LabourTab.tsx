import { useState } from 'react'
import EmptyState from './EmptyState'
import ItemActionDrawer from './ItemActionDrawer'
import AddLabourDrawer from './LabourAdd'
import { PeopleSummary, ManagePeopleDrawer, useLabourPeople } from './LabourPeople'
import { friendlyDayLabel, formatMoney, moneyFigure, safeLabourCost } from './memoryScan'
import type { JobMemory } from './useJobMemory'
import type { MarkPaidControls } from './markPaid'
import type { LabourDayItem, LabourPersonWithJobStats, MemoryViewItem } from './types'

// What a labour entry does to Budget, in one legible phrase — Hours / Budget
// cost / Money paid kept strictly separate. Budget cost is cobalt; hours-only
// and no-rate are quiet greys so an unpaid budget cost never reads as money out
// and hours-only never looks lost.
function entryEffect(item: MemoryViewItem | undefined): { text: string; kind: 'budget' | 'hours' | 'no-rate' } {
  if (!item) return { text: 'hours only', kind: 'hours' }
  const cost = safeLabourCost(item)
  if (cost) return { text: `${formatMoney(cost.amount, 'GBP')} budget cost`, kind: 'budget' }
  // Budget-enabled but no trusted rate yet → calm "no rate" state, never lost.
  if (item.labourBudgetEnabled === true) return { text: 'no rate yet', kind: 'no-rate' }
  return { text: 'hours only', kind: 'hours' }
}

// A labour entry as a tappable ledger row: tapping opens the shared item action
// drawer. The row states the person, hours, and the Budget effect in one line.
function LabourEntry({ entry, mem, markPaid }: { entry: LabourDayItem; mem: JobMemory; markPaid?: MarkPaidControls }) {
  const { sectionItems, cardProps } = mem
  const item = sectionItems('labour').find(i => i.id === entry.memoryItemId)
  const p = item ? cardProps(item, false) : null
  const [drawerOpen, setDrawerOpen] = useState(false)

  const person = entry.labourPerson?.trim()
  const task = entry.labourTask?.trim()
  const title = task || person || 'Labour'
  const effect = entryEffect(item)
  const rate = item && item.costQualifier === 'per_hour' && item.costAmount ? `£${item.costAmount}/hour` : null
  const meta = [task ? person : null, entry.hoursLabel, rate].filter(Boolean).join(' · ')
  const effectLine = [task, effect.text].filter(Boolean).join(' · ')

  const Row = (
    <div className="labour-entry-row">
      <div className="labour-entry-main">
        <p className="labour-entry-headline">
          <strong className="labour-entry-person">{entry.labourPerson ?? 'Labour'}</strong>
        </p>
        {entry.worthChecking
          ? <p className="labour-entry-check">Worth checking — not counted in totals</p>
          : <p className={`labour-entry-effect labour-entry-effect--${effect.kind}`}>{effectLine || effect.text}</p>}
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
        costLine={effect.kind === 'budget' ? `${effect.text}` : effect.kind === 'no-rate' ? 'No rate yet — hours saved, no Budget cost' : 'Hours only — not counted in Budget'}
        categories={[]}
        onAssignCategory={() => {}}
        assigningCategory={false}
        markPaid={markPaid}
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

export default function LabourTab({ mem, jobId, markPaid }: { mem: JobMemory; jobId: string; markPaid?: MarkPaidControls }) {
  const { labourHours, labourSpendGroup, addMemoryItem, refreshError, refetch } = mem
  const days = labourHours?.days ?? []
  const people = useLabourPeople(jobId)

  // Managing people: the summary "Manage ›" opens the list; a person row opens
  // straight to that person's settings.
  const [managing, setManaging] = useState(false)
  const [initialPerson, setInitialPerson] = useState<LabourPersonWithJobStats | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  const openManage = () => { setInitialPerson(null); setManaging(true) }
  const openPerson = (person: LabourPersonWithJobStats) => { setInitialPerson(person); setManaging(true) }

  const budgetCost = labourSpendGroup?.knownSpendAmount ?? null

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Labour">
      {/* Hours hero — the same ink band as Budget/Money. Hours are the headline;
          Budget cost is secondary and lives in its own card below. */}
      <section className="mem-hero" aria-label="Labour hours">
        <p className="mem-hero-amount">
          {labourHours?.totalHours ? `${labourHours.totalHours}h` : 'None yet'}
          {labourHours?.totalHours && <span className="mem-hero-of"> on this job</span>}
        </p>
      </section>

      {/* Budgeted labour cost — budget-enabled trusted labour only. Cobalt wash,
          secondary to hours. The ? carries the explanation so no subcopy is
          needed on the card itself. */}
      {budgetCost !== null && (
        <section className="labour-budget-card" aria-label="Budgeted labour cost">
          <div className="labour-budget-card-head">
            <span className="labour-budget-card-cap">
              BUDGETED LABOUR COST
              <button type="button" className="labour-help" aria-label="What is budgeted labour cost?" aria-expanded={helpOpen} onClick={() => setHelpOpen(o => !o)}>?</button>
            </span>
            <span className="labour-budget-card-amount">{moneyFigure(budgetCost)}</span>
          </div>
          {helpOpen && (
            <p className="labour-budget-card-help">
              Only rated hours set to count toward budget. Hours-only work still shows above but isn't in this figure. Marking it paid records Money out — it doesn't change this.
            </p>
          )}
        </section>
      )}

      {/* People summary + Manage. */}
      {people.loadState === 'ready' && people.data && (
        <PeopleSummary people={people.data.people} onManage={openManage} onOpenPerson={openPerson} />
      )}

      {days.length > 0 && (
        <div className="lens-add-head">
          <span className="lens-add-label">Labour</span>
          <button type="button" className="btn-lens-add-text" onClick={() => setAdding(true)}>+ Add labour</button>
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
          title="No labour logged yet"
          hint="Keep track of who worked, how many hours, and which day — or say it with Record."
          action={<button type="button" className="btn-add-labour-save" onClick={() => setAdding(true)}>Add labour</button>}
        />
      ) : (
        days.map(day => (
          <section key={day.date || 'day-not-known'} className="labour-day" aria-label={`Labour ${friendlyDayLabel(day.date)}`}>
            <div className="labour-day-head">
              <h3 className="labour-day-label">{friendlyDayLabel(day.date)}</h3>
              {day.totalLabel && <span className="labour-day-total">{day.totalLabel}</span>}
            </div>
            {day.items.map(entry => <LabourEntry key={entry.memoryItemId} entry={entry} mem={mem} markPaid={markPaid} />)}
          </section>
        ))
      )}

      <ManagePeopleDrawer
        jobId={jobId}
        people={people.data?.people ?? []}
        open={managing}
        onClose={() => setManaging(false)}
        onChanged={() => void people.reload()}
        initialPerson={initialPerson}
      />

      <AddLabourDrawer
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
