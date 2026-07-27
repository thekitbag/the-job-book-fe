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
    <label><span className="row-sheet-cost">PERSON</span><select aria-label="Person" value={personId} onChange={e => setPersonId(e.target.value)}><option value="">No person</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button type="button" className="btn-lens-add-text" onClick={() => setAddingPerson(!addingPerson)}>+ Add person</button>
    {addingPerson && <div className="who-new"><input aria-label="New person name" value={newName} onChange={e => setNewName(e.target.value)} /><button type="button" onClick={() => void addPerson()} disabled={saving}>Add</button></div>}
    <label><span className="row-sheet-cost">TASK</span><input aria-label="Task" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Roofing" /></label>
    <label><span className="row-sheet-cost">HOURS (OPTIONAL)</span><input aria-label="Hours" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} /></label>
    <label><span className="row-sheet-cost">RATE (£/H, OPTIONAL)</span><input aria-label="Rate" inputMode="decimal" value={rate} onChange={e => { setRate(e.target.value); setTotal('') }} /></label>
    <label><span className="row-sheet-cost">FIXED TOTAL (£, OPTIONAL)</span><input aria-label="Fixed total" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} /></label>
    <p className="row-sheet-sub">{positive(hours) ? `${hours}h saved.` : 'No hours saved.'} {payable ? `£${cost} goes to Budget.` : 'No Budget cost.'} {payable ? 'You can mark it paid now.' : ''}</p>
    {payable && <label><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /> Already paid — adds Money out</label>}
    {error && <p role="alert" className="queue-item-error">{error}</p>}
    <button className="btn-add-labour-save" disabled={saving}>{saving ? 'Saving…' : 'Save labour'}</button>
  </form></BottomSheet>
}
