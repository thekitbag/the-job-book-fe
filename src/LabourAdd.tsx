import { useMemo, useState } from 'react'
import { createLabourPerson, patchLabourPerson } from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import { formatMoney } from './memoryScan'
import type { CreateMemoryItemRequest, LabourPersonWithJobStats, MemoryViewItem } from './types'

// Add labour (design 10d/10e). One bottom drawer: pick who worked, how long, on
// what — then a Budget block that states the outcome for the chosen person
// (their rate + treatment, with an estimated cost), so Mike never has to know a
// hidden rule. Hours always save; Budget cost only when the entry is
// budget-enabled and has a rate.

const POS = /^\d+(\.\d+)?$/

function HoursStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, Math.round(v * 100) / 100))
  return (
    <div className="hours-stepper">
      <button type="button" className="stepper-btn" aria-label="Fewer hours" onClick={() => set(value - 1)}>–</button>
      <div className="stepper-value">
        <input
          className="stepper-input"
          aria-label="Hours"
          inputMode="decimal"
          value={String(value)}
          onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) set(n); else if (e.target.value === '') onChange(0) }}
        />
        <span className="stepper-unit">h</span>
      </div>
      <button type="button" className="stepper-btn stepper-btn--plus" aria-label="More hours" onClick={() => set(value + 1)}>+</button>
    </div>
  )
}

export default function AddLabourDrawer({ jobId, people, open, onClose, onAdd, onPeopleChanged }: {
  jobId: string
  people: LabourPersonWithJobStats[]
  open: boolean
  onClose: () => void
  onAdd: (req: CreateMemoryItemRequest) => Promise<MemoryViewItem>
  onPeopleChanged: () => void
}) {
  const [personId, setPersonId] = useState<string | null>(people[0]?.id ?? null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [newName, setNewName] = useState('')
  const [hours, setHours] = useState(8)
  const [task, setTask] = useState('')
  // Per-entry overrides (null = inherit the person's default).
  const [rateOverride, setRateOverride] = useState<string | null>(null)
  const [treatmentOverride, setTreatmentOverride] = useState<boolean | null>(null)
  const [editingRate, setEditingRate] = useState(false)
  const [rateDraft, setRateDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const person = useMemo(() => people.find(p => p.id === personId) ?? null, [people, personId])

  // Effective rule for this entry: overrides win over the person's defaults.
  const effRate = rateOverride ?? person?.defaultHourlyRateAmount ?? null
  const effBudget = treatmentOverride ?? (person?.defaultBudgetTreatment === 'counts_toward_budget')
  const estimated = effBudget && effRate && hours > 0 ? hours * parseFloat(effRate) : null

  const reset = () => {
    setPersonId(people[0]?.id ?? null); setAddingPerson(false); setNewName('')
    setHours(8); setTask(''); setRateOverride(null); setTreatmentOverride(null)
    setEditingRate(false); setRateDraft(''); setError(null)
  }

  const selectPerson = (id: string) => { setPersonId(id); setRateOverride(null); setTreatmentOverride(null); setEditingRate(false) }

  const addNewPerson = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true); setError(null)
    try {
      const created = await createLabourPerson(jobId, { name, defaultBudgetTreatment: 'hours_only' })
      track('labour_person_added', { job_id: jobId, has_rate: false, treatment: 'hours_only' })
      onPeopleChanged()
      setAddingPerson(false); setNewName('')
      selectPerson(created.id)
    } catch { setError('Could not add — that name may already exist') }
    finally { setSaving(false) }
  }

  // Setting a rate in the add flow remembers it on the person (design 10f) and
  // applies it to this entry.
  const saveRate = async () => {
    if (!person || !POS.test(rateDraft.trim())) return
    const rate = rateDraft.trim()
    setSaving(true); setError(null)
    try {
      await patchLabourPerson(jobId, person.id, { defaultHourlyRateAmount: rate, defaultHourlyRateCurrency: 'GBP' })
      onPeopleChanged()
      setRateOverride(rate)
      setEditingRate(false)
    } catch { setError('Could not save the rate — try again') }
    finally { setSaving(false) }
  }

  const save = async () => {
    if (hours <= 0) return
    setSaving(true); setError(null)
    try {
      const req: CreateMemoryItemRequest = {
        memoryType: 'labour',
        labourHours: String(hours),
        labourTask: task.trim() || null,
        labourPersonId: personId,
        labourBudgetEnabled: effBudget,
        // Send an explicit rate only when overriding; otherwise the person's
        // default is applied by the backend/mock.
        ...(rateOverride ? { costAmount: rateOverride, costCurrency: 'GBP', costQualifier: 'per_hour' as const } : {}),
      }
      await onAdd(req)
      track('labour_added', { job_id: jobId, has_person: !!personId, budget_enabled: effBudget, has_rate: !!effRate })
      reset()
      onClose()
    } catch { setError('Could not save the labour — try again') }
    finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <BottomSheet title="Add labour" onClose={() => { reset(); onClose() }}>
      <div className="add-labour">
        <p className="row-sheet-cost">WHO</p>
        <div className="who-chips">
          {people.map(p => (
            <button
              key={p.id}
              type="button"
              className={`who-chip${personId === p.id ? ' who-chip--on' : ''}`}
              aria-pressed={personId === p.id}
              onClick={() => selectPerson(p.id)}
            >
              {p.name}{p.isSelf && <span className="who-chip-you"> · you</span>}
            </button>
          ))}
          <button type="button" className="who-chip who-chip--new" onClick={() => setAddingPerson(a => !a)}>+ New</button>
        </div>

        {addingPerson && (
          <form className="who-new" aria-label="Add a person" onSubmit={e => { e.preventDefault(); void addNewPerson() }}>
            <input className="queue-field-input" aria-label="New person name" value={newName} maxLength={80} placeholder="Name" onChange={e => setNewName(e.target.value)} />
            <button type="submit" className="btn-queue-save" disabled={saving || newName.trim() === ''}>Add</button>
          </form>
        )}

        <div className="add-labour-ht">
          <div>
            <p className="row-sheet-cost">HOURS</p>
            <HoursStepper value={hours} onChange={setHours} />
          </div>
          <label className="add-labour-task">
            <span className="row-sheet-cost">TASK</span>
            <input className="queue-field-input" name="labourTask" value={task} placeholder="e.g. Fencing" onChange={e => setTask(e.target.value)} />
          </label>
        </div>

        {/* Budget block reflects the chosen person's rule. */}
        {editingRate ? (
          <div className="add-labour-budget add-labour-budget--budget">
            <p className="row-sheet-cost">{person ? `${person.name}'s rate` : 'Rate'}</p>
            <p className="labour-budget-card-help">Used to estimate budget cost. Remembered for next time.</p>
            <div className="rate-row">
              <input className="queue-field-input" aria-label="Rate per hour" inputMode="decimal" value={rateDraft} autoFocus placeholder="e.g. 20" onChange={e => setRateDraft(e.target.value)} />
              <button type="button" className="btn-queue-save" disabled={saving || !POS.test(rateDraft.trim())} onClick={() => void saveRate()}>Save rate</button>
              <button type="button" className="btn-queue-cancel" onClick={() => setEditingRate(false)}>Cancel</button>
            </div>
          </div>
        ) : effBudget ? (
          <div className="add-labour-budget add-labour-budget--budget">
            <div className="add-labour-budget-head">
              <span className="labour-budget-card-cap">BUDGET</span>
              {effRate
                ? <button type="button" className="btn-lens-add-text" onClick={() => { setRateDraft(effRate ?? ''); setEditingRate(true) }}>{person ? `${person.name}'s rate ` : ''}£{effRate}/h · Change ›</button>
                : <button type="button" className="btn-lens-add-text" onClick={() => { setRateDraft(''); setEditingRate(true) }}>Add rate ›</button>}
            </div>
            <span className="labour-tag labour-tag--budget">Counts toward budget</span>
            {estimated !== null ? (
              <div className="add-labour-estimate">
                <span>Estimated cost</span>
                <b>{formatMoney(estimated, 'GBP')}</b>
              </div>
            ) : (
              <p className="labour-budget-card-help">No rate yet — hours saved, no Budget cost.</p>
            )}
            <button type="button" className="add-labour-toggle" onClick={() => setTreatmentOverride(false)}>Make this entry hours only ›</button>
          </div>
        ) : (
          <div className="add-labour-budget add-labour-budget--hours">
            <div className="add-labour-budget-head">
              <span className="labour-budget-card-cap labour-budget-card-cap--grey">BUDGET</span>
              <span className="labour-tag labour-tag--hours">Hours only</span>
            </div>
            <p className="add-labour-hours-copy">
              This will not change the job budget. <button type="button" className="add-labour-toggle-inline" onClick={() => setTreatmentOverride(true)}>Change for this entry ›</button>
            </p>
          </div>
        )}

        {error && <p className="queue-item-error" role="alert">{error}</p>}
        <button type="button" className="btn-add-labour-save" disabled={saving || hours <= 0} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save labour'}
        </button>
      </div>
    </BottomSheet>
  )
}
