import { useEffect, useState } from 'react'
import { createLabourPerson } from './api'
import BottomSheet from './BottomSheet'
import type { CreateMemoryItemRequest, LabourPersonWithJobStats, MemoryViewItem } from './types'

const positive = (value: string) => /^\d+(\.\d+)?$/.test(value) && Number(value) > 0

export default function AddHoursDrawer({ jobId, people, open, onClose, onAdd, onPeopleChanged }: {
  jobId: string; people: LabourPersonWithJobStats[]; open: boolean; onClose: () => void
  onAdd: (req: CreateMemoryItemRequest) => Promise<MemoryViewItem>; onPeopleChanged: () => void
}) {
  const [personId, setPersonId] = useState('')
  const [hours, setHours] = useState('')
  const [task, setTask] = useState('')
  const [rate, setRate] = useState('')
  const [total, setTotal] = useState('')
  const [paid, setPaid] = useState(false)
  const [newName, setNewName] = useState('')
  const [addingPerson, setAddingPerson] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cost = total !== '' ? total : (positive(hours) && positive(rate) ? String(Number(hours) * Number(rate)) : '')
  const payable = positive(cost)

  useEffect(() => { if (open && !personId && people[0]) setPersonId(people[0].id) }, [open, people, personId])
  useEffect(() => { const selected = people.find(p => p.id === personId); if (selected) setRate(selected.defaultHourlyRateAmount ?? '') }, [personId, people]) // inherit, then allow an entry override

  const addPerson = async () => {
    if (!newName.trim()) return
    setSaving(true); setError(null)
    try {
      const created = await createLabourPerson(jobId, { name: newName.trim() })
      onPeopleChanged(); setPersonId(created.id); setAddingPerson(false); setNewName('')
    } catch { setError('Could not add that person') } finally { setSaving(false) }
  }
  const save = async () => {
    if (!task.trim() || (!positive(hours) && !positive(total))) { setError('Add a task and either hours or a total cost.'); return }
    setSaving(true); setError(null)
    try {
      const req: CreateMemoryItemRequest = {
        memoryType: 'labour', labourPersonId: personId || null, labourTask: task.trim(),
        labourHours: positive(hours) ? hours : null, costAmount: total !== '' ? total : (rate === '' ? null : rate),
        costCurrency: (rate !== '' || total !== '') ? 'GBP' : null,
        costQualifier: total !== '' ? 'total' : (rate !== '' ? 'per_hour' : null),
        totalCostAmount: total !== '' ? total : null, markPaid: paid,
      }
      await onAdd(req); onPeopleChanged(); onClose()
      setHours(''); setTask(''); setRate(''); setTotal(''); setPaid(false)
    } catch { setError('Could not save the labour — try again') } finally { setSaving(false) }
  }
  if (!open) return null
  return <BottomSheet title="Add labour" onClose={onClose}><form className="add-labour" aria-label="Add labour" onSubmit={e => { e.preventDefault(); void save() }}>
    <div className="add-labour-person-row">
      <label className="queue-field">
        <span className="queue-field-label">Person</span>
        <select className="queue-field-input" aria-label="Person" value={personId} onChange={e => setPersonId(e.target.value)}>
          <option value="">No person</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <button type="button" className="btn-lens-add-text" onClick={() => setAddingPerson(!addingPerson)}>{addingPerson ? 'Cancel' : '+ Add person'}</button>
    </div>
    {addingPerson && <div className="who-new">
      <input className="queue-field-input" aria-label="New person name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" />
      <button type="button" className="btn-rate-save" onClick={() => void addPerson()} disabled={saving || !newName.trim()}>Add</button>
    </div>}
    <label className="queue-field">
      <span className="queue-field-label">Task</span>
      <input className="queue-field-input" aria-label="Task" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Roofing" />
    </label>
    <div className="add-labour-cost-row">
      <label className="queue-field">
        <span className="queue-field-label">Hours (optional)</span>
        <input className="queue-field-input" aria-label="Hours" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 8" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Rate (£/h, optional)</span>
        <input className="queue-field-input" aria-label="Rate" inputMode="decimal" value={rate} onChange={e => { setRate(e.target.value); setTotal('') }} placeholder="e.g. 25" />
      </label>
    </div>
    <label className="queue-field">
      <span className="queue-field-label">Fixed total (£, optional)</span>
      <input className="queue-field-input" aria-label="Fixed total" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="Use instead of an hourly rate" />
    </label>
    <div className={`add-labour-budget ${payable ? 'add-labour-budget--budget' : 'add-labour-budget--hours'}`} aria-live="polite">
      <div className="add-labour-budget-head">
        <span className={`labour-budget-card-cap ${payable ? '' : 'labour-budget-card-cap--grey'}`}>Entry effect</span>
        <strong>{positive(hours) ? `${hours}h` : 'No hours'}</strong>
      </div>
      <p className="add-labour-hours-copy">{payable ? `£${cost} goes to Budget. You can mark it paid now.` : 'No Budget cost.'}</p>
    </div>
    {payable && <label className="direct-add-paid">
      <input type="checkbox" aria-label="Already paid" checked={paid} onChange={e => setPaid(e.target.checked)} />
      <span className="direct-add-paid-text">
        <span className="direct-add-paid-title">Already paid</span>
        <span className="direct-add-paid-sub">Also records it in Money out</span>
      </span>
    </label>}
    {error && <p role="alert" className="queue-item-error">{error}</p>}
    <button className="btn-add-labour-save" disabled={saving}>{saving ? 'Saving…' : 'Save labour'}</button>
  </form></BottomSheet>
}
