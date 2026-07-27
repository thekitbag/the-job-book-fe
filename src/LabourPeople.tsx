import { useCallback, useEffect, useRef, useState } from 'react'
import { createLabourPerson, getLabourPeople, patchLabourPerson } from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import type { LabourPeopleResponse, LabourPersonWithJobStats } from './types'

// Labour people — the lightweight worker list. Labour is hours-only, so people
// carry no rate or Budget treatment here (labour-hours-budget-costs-paid-undo
// spec): they exist only to attribute hours. Managed from Labour via a bottom
// drawer; never a separate admin/HR page. Nothing here reads or writes cost.

export function useLabourPeople(jobId: string) {
  const [data, setData] = useState<LabourPeopleResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const currentJobIdRef = useRef(jobId)
  currentJobIdRef.current = jobId

  const reload = useCallback(async () => {
    const requested = jobId
    try {
      const fresh = await getLabourPeople(requested)
      if (currentJobIdRef.current !== requested) return
      setData(fresh)
      setLoadState('ready')
    } catch {
      if (currentJobIdRef.current !== requested) return
      setLoadState('error')
    }
  }, [jobId])

  useEffect(() => { setData(null); setLoadState('loading'); void reload() }, [reload])

  return { data, loadState, reload }
}

export type LabourPeopleState = ReturnType<typeof useLabourPeople>

// ── People summary (the block on the Labour page) ────────────────────────────
// Job-local names, hours and default rate context.

export function PeopleSummary({ people, onManage }: {
  people: LabourPersonWithJobStats[]
  onManage: () => void
}) {
  // Only people with hours on this job appear in the on-page summary; the rest
  // are reachable from Manage. Keeps the Labour page about this job.
  const shown = people.filter(p => p.jobHours !== null)
  if (shown.length === 0) {
    return (
      <section className="labour-people" aria-label="People">
        <div className="labour-people-head">
          <span className="mem-section-label">People</span>
          <button type="button" className="btn-lens-add-text" onClick={onManage}>Manage ›</button>
        </div>
        <p className="mem-tab-empty">No people yet. Add who worked to attribute hours.</p>
      </section>
    )
  }
  return (
    <section className="labour-people" aria-label="People">
      <div className="labour-people-head">
        <span className="mem-section-label">People</span>
        <button type="button" className="btn-lens-add-text" onClick={onManage}>Manage ›</button>
      </div>
      <ul className="labour-people-list">
        {shown.map(p => (
          <li key={p.id}>
            <div className="labour-person-row labour-person-row--static">
              <span className="labour-person-name">{p.name}{p.isSelf && <span className="labour-person-you"> · you</span>}</span>
              <span className="labour-person-figures">{[p.jobHoursLabel, p.defaultHourlyRateAmount === null ? 'No rate' : `£${p.defaultHourlyRateAmount}/hour`].filter(Boolean).join(' · ')}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Management drawer (list + add a person, name only) ───────────────────────

export function ManagePeopleDrawer({ jobId, people, open, onClose, onChanged }: {
  jobId: string
  people: LabourPersonWithJobStats[]
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [rate, setRate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setAdding(false); setName(''); setError(null) }
  }, [open])

  if (!open) return null

  const addPerson = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true); setError(null)
    try {
      await createLabourPerson(jobId, { name: trimmed })
      track('labour_person_added', { job_id: jobId, has_rate: false })
      onChanged()
      setAdding(false); setName('')
    } catch { setError('Could not add — check the name and try again') }
    finally { setSaving(false) }
  }

  return (
    <BottomSheet title="People" onClose={onClose}>
      <div className="manage-people">
        <p className="row-sheet-sub">People and rates for this job only.</p>
        <ul className="manage-people-list">
          {people.map(p => (
            <li key={p.id}>
              <div className="labour-person-row labour-person-row--static">
                <span className="labour-person-name">{p.name}{p.isSelf && <span className="labour-person-you"> · you</span>}</span>
                {editing === p.id ? <span className="rate-row"><span className="rate-row-prefix" aria-hidden="true">£</span><input className="queue-field-input" aria-label={`Rate for ${p.name}`} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} /><span className="rate-row-suffix">/h</span><button type="button" className="btn-rate-save" onClick={async () => { setSaving(true); try { await patchLabourPerson(jobId, p.id, { defaultHourlyRateAmount: rate === '' ? null : rate, defaultHourlyRateCurrency: rate === '' ? null : 'GBP' }); onChanged(); setEditing(null) } catch { setError('Could not save the rate') } finally { setSaving(false) } }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></span> : <button type="button" className="btn-lens-add-text" onClick={() => { setEditing(p.id); setRate(p.defaultHourlyRateAmount ?? '') }}>{p.defaultHourlyRateAmount === null ? 'Set rate' : `£${p.defaultHourlyRateAmount}/h · Edit`}</button>}
              </div>
            </li>
          ))}
        </ul>
        {adding ? (
          <form className="who-new" aria-label="Add a person" onSubmit={e => { e.preventDefault(); void addPerson() }}>
            <input className="queue-field-input" aria-label="New person name" value={name} maxLength={80} placeholder="Name" onChange={e => setName(e.target.value)} />
            <button type="submit" className="btn-queue-save" disabled={saving || name.trim() === ''}>{saving ? 'Saving…' : 'Add'}</button>
            <button type="button" className="btn-queue-cancel" onClick={() => { setAdding(false); setError(null) }} disabled={saving}>Cancel</button>
          </form>
        ) : (
          <button type="button" className="btn-add-category" onClick={() => { setError(null); setAdding(true) }}>+ Add a person</button>
        )}
        {error && <p className="queue-item-error" role="alert">{error}</p>}
      </div>
    </BottomSheet>
  )
}
