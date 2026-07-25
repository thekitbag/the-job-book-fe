import { useState } from 'react'
import DirectAddForm from './DirectAddForm'
import EmptyState from './EmptyState'
import ItemActionDrawer from './ItemActionDrawer'
import LabourBudgetControl from './LabourBudgetControl'
import { friendlyDayLabel, moneyFigure } from './memoryScan'
import type { JobMemory } from './useJobMemory'
import type { MarkPaidControls } from './markPaid'
import type { LabourDayItem } from './types'

// Spent-against-budget bar, matching the category bands on Spend — only drawn
// when there is a budget to measure against.
function LabourBar({ spend, budget, over }: { spend: string | null; budget: string | null; over: boolean }) {
  const spent = spend ? parseFloat(spend) : 0
  const total = budget ? parseFloat(budget) : null
  if (total === null || !(total > 0)) return null
  const pct = Math.min(100, Math.round((spent / total) * 100))
  return (
    <div className={`budget-bar${over ? ' budget-bar--over' : ''}`} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

// The Labour lens as a daily view: job total hours up top, then day groups
// (newest first) with a safe day total each. Entries lead with person / hours /
// task; money is secondary copy (the trusted line total, or "No cost added").
// Worth-checking labour stays visible but is excluded from the hour totals.
// Driven by the backend labourHoursSummary (local fallback for older APIs).

// A labour entry as a tappable ledger row: tapping opens the shared item action
// drawer (Show source / Fix memory / Remove item as sub-states), the same
// pattern Budget, Materials and Job log use. No inline Fix memory or edit form.
function LabourEntry({ entry, mem, markPaid }: { entry: LabourDayItem; mem: JobMemory; markPaid?: MarkPaidControls }) {
  const { sectionItems, cardProps } = mem
  // Join back to the full memory-view item so the drawer's edit/remove act on it.
  const item = sectionItems('labour').find(i => i.id === entry.memoryItemId)
  const p = item ? cardProps(item, false) : null
  const [drawerOpen, setDrawerOpen] = useState(false)

  const person = entry.labourPerson?.trim()
  const task = entry.labourTask?.trim()
  const title = task || person || 'Labour'
  const rate = item && item.costQualifier === 'per_hour' && item.costAmount ? `£${item.costAmount}/hour` : null
  const meta = [task ? person : null, entry.hoursLabel, rate].filter(Boolean).join(' · ')

  const Row = (
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
        {p && <span className="mem-row-tap-chev" aria-hidden="true">›</span>}
      </div>
    </div>
  )

  // No full item to act on (older API without the joined row) → static row.
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
        costLine={entry.lineTotalLabel ? `${entry.lineTotalLabel} cost` : null}
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

export default function LabourTab({ mem, markPaid }: { mem: JobMemory; markPaid?: MarkPaidControls }) {
  const { labourHours, labourSpendGroup, addMemoryItem, refreshError, refetch, budgetError, handleSetLabourBudget } = mem
  const days = labourHours?.days ?? []

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Labour">
      {/* The same ink-band hero as Spend and Payments. Labour's headline is
          hours — the money detail lives in the trio below rather than being
          said twice. Renders before the add header so the band runs straight
          out of the page header: nothing may come between the two. */}
      <section className="mem-hero" aria-label="Labour hours">
        <p className="mem-hero-amount">
          {labourHours?.totalHours ? `${labourHours.totalHours}h` : 'None yet'}
          {labourHours?.totalHours && <span className="mem-hero-of"> job total</span>}
        </p>
      </section>

      <DirectAddForm kind="labour" label="Add labour" sectionLabel="Labour" onAdd={addMemoryItem} actionHidden={days.length === 0} />

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
          action={<DirectAddForm kind="labour" variant="button" label="Add labour" onAdd={addMemoryItem} />}
        />
      ) : (
        <>
          {/* Labour money context from budgetSummary.labour: cost so far, and
              budget/remaining when a Labour budget exists. Trusted labour cost
              counts in Spend either way — no Labour budget is required. */}
          {labourSpendGroup && (
            <section className="labour-money" aria-label="Labour cost">
              <LabourBar spend={labourSpendGroup.knownSpendAmount} budget={labourSpendGroup.budgetAmount} over={labourSpendGroup.overBudget} />
              <div className="budget-cat-figures">
                <div className="budget-figure"><dt>Cost</dt><dd>{moneyFigure(labourSpendGroup.knownSpendAmount) ?? 'None yet'}</dd></div>
                {labourSpendGroup.budgetLabel && (
                  <div className="budget-figure"><dt>Budget</dt><dd>{moneyFigure(labourSpendGroup.budgetAmount)}</dd></div>
                )}
                {labourSpendGroup.remainingLabel && (
                  <div className={`budget-figure${labourSpendGroup.overBudget ? ' budget-figure--over' : ''}`}>
                    <dt>{labourSpendGroup.overBudget ? 'Over' : 'Left'}</dt>
                    <dd>{moneyFigure(labourSpendGroup.remainingAmount?.replace('-', '') ?? null)}</dd>
                  </div>
                )}
              </div>
              <LabourBudgetControl
                budgetCategory={labourSpendGroup.budgetCategory}
                onSave={handleSetLabourBudget}
                error={budgetError || undefined}
              />
            </section>
          )}

          {days.map(day => (
            <section key={day.date || 'day-not-known'} className="labour-day" aria-label={`Labour ${friendlyDayLabel(day.date)}`}>
              <div className="labour-day-head">
                <h3 className="labour-day-label">{friendlyDayLabel(day.date)}</h3>
                {day.totalLabel && <span className="labour-day-total">{day.totalLabel}</span>}
              </div>
              {day.items.map(entry => <LabourEntry key={entry.memoryItemId} entry={entry} mem={mem} markPaid={markPaid} />)}
            </section>
          ))}
        </>
      )}
    </div>
  )
}
