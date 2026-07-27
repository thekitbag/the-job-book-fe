import { useState } from 'react'
import { createLabourPerson } from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import type { CreateMemoryItemRequest, LabourPersonWithJobStats, MemoryViewItem } from './types'

// Add hours — Labour is hours-only (labour-hours-budget-costs-paid-undo spec).
// One bottom drawer: pick who worked, how long, on what. No rate, no Budget
// treatment, no estimated cost — Labour records time, Budget records cost. New
// hours never create Budget cost, so entries are always budget-disabled.

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

export default function AddHoursDrawer({ jobId, people, open, onClose, onAdd, onPeopleChanged }: {
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPersonId(people[0]?.id ?? null); setAddingPerson(false); setNewName('')
    setHours(8); setTask(''); setError(null)
  }

  const addNewPerson = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true); setError(null)
    try {
      const created = await createLabourPerson(jobId, { name, defaultBudgetTreatment: 'hours_only' })
      track('labour_person_added', { job_id: jobId, has_rate: false, treatment: 'hours_only' })
      onPeopleChanged()
      setAddingPerson(false); setNewName('')
      setPersonId(created.id)
    } catch { setError('Could not add — that name may already exist') }
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
        // Labour is hours-only: never create Budget cost from an hours entry.
        labourBudgetEnabled: false,
      }
      await onAdd(req)
      track('labour_added', { job_id: jobId, has_person: !!personId, budget_enabled: false, has_rate: false })
      reset()
      onClose()
    } catch { setError('Could not save the hours — try again') }
    finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <BottomSheet title="Add hours" onClose={() => { reset(); onClose() }}>
      <div className="add-labour">
        <p className="row-sheet-cost">WHO</p>
        <div className="who-chips">
          {people.map(p => (
            <button
              key={p.id}
              type="button"
              className={`who-chip${personId === p.id ? ' who-chip--on' : ''}`}
              aria-pressed={personId === p.id}
              onClick={() => setPersonId(p.id)}
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

        {error && <p className="queue-item-error" role="alert">{error}</p>}
        <button type="button" className="btn-add-labour-save" disabled={saving || hours <= 0} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save hours'}
        </button>
      </div>
    </BottomSheet>
  )
}
