import { useCallback, useEffect, useRef, useState } from 'react'
import { createLabourPerson, getLabourPeople, patchLabourPerson } from './api'
import { track } from './analytics'
import BottomSheet from './BottomSheet'
import type { LabourBudgetTreatment, LabourPeopleResponse, LabourPersonWithJobStats } from './types'

// Labour people — the lightweight worker list with default rate + Budget
// treatment. Managed entirely from Labour via bottom drawers; never a separate
// admin/HR page. Nothing here reads or writes hours: people carry defaults that
// pre-fill new labour, and hours totals are independent of all of it.

const POS = /^\d+(\.\d+)?$/
const validRate = (s: string) => s.trim() === '' || (POS.test(s.trim()) && parseFloat(s) > 0)

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

// ── People summary (10a: the block on the Labour page) ───────────────────────

// A person's Budget treatment as a small legible tag: cobalt Budget /
// grey Hours only / cobalt "Add rate" prompt when a budget person has no rate.
function personTag(p: LabourPersonWithJobStats): { kind: 'budget' | 'hours' | 'add-rate'; label: string } {
  if (p.defaultBudgetTreatment === 'counts_toward_budget') {
    if (!p.defaultHourlyRateAmount) return { kind: 'add-rate', label: 'Add rate ›' }
    return { kind: 'budget', label: 'Budget' }
  }
  return { kind: 'hours', label: 'Hours only' }
}

function personRateHours(p: LabourPersonWithJobStats): string | null {
  const parts: string[] = []
  if (p.jobHoursLabel) parts.push(p.jobHoursLabel)
  if (p.defaultHourlyRateAmount) parts.push(`£${p.defaultHourlyRateAmount}/h`)
  return parts.length ? parts.join(' · ') : null
}

export function PeopleSummary({ people, onManage, onOpenPerson }: {
  people: LabourPersonWithJobStats[]
  onManage: () => void
  onOpenPerson: (person: LabourPersonWithJobStats) => void
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
        <p className="mem-tab-empty">No people yet. Add who worked to set rates and Budget treatment.</p>
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
        {shown.map(p => {
          const tag = personTag(p)
          const rh = personRateHours(p)
          return (
            <li key={p.id}>
              <button type="button" className="labour-person-row" onClick={() => onOpenPerson(p)} aria-label={`${p.name} settings`}>
                <span className="labour-person-name">{p.name}{p.isSelf && <span className="labour-person-you"> · you</span>}</span>
                {rh && <span className="labour-person-figures">{rh}</span>}
                <span className={`labour-tag labour-tag--${tag.kind}`}>{tag.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── Management drawers (10b manage list / 10c person settings / add person) ──

type ManageSub =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'person'; person: LabourPersonWithJobStats }

function TreatmentChooser({ value, onChange, name }: {
  value: LabourBudgetTreatment
  onChange: (v: LabourBudgetTreatment) => void
  name: string
}) {
  return (
    <div className="treatment-chooser" role="radiogroup" aria-label={`Does ${name}'s labour count toward budget?`}>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'counts_toward_budget'}
        className={`treatment-opt${value === 'counts_toward_budget' ? ' treatment-opt--on' : ''}`}
        onClick={() => onChange('counts_toward_budget')}
      >
        <span className="treatment-radio" aria-hidden="true" />
        <span className="treatment-text">
          <span className="treatment-title">Counts toward budget</span>
          <span className="treatment-sub">Rated hours add to the job's budgeted cost</span>
        </span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'hours_only'}
        className={`treatment-opt${value === 'hours_only' ? ' treatment-opt--on' : ''}`}
        onClick={() => onChange('hours_only')}
      >
        <span className="treatment-radio" aria-hidden="true" />
        <span className="treatment-text">
          <span className="treatment-title">Hours only</span>
          <span className="treatment-sub">Track time, don't change the budget</span>
        </span>
      </button>
    </div>
  )
}

function AddPersonForm({ saving, error, onSave, onCancel }: {
  saving: boolean
  error: string | null
  onSave: (fields: { name: string; rate: string; treatment: LabourBudgetTreatment }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [treatment, setTreatment] = useState<LabourBudgetTreatment>('hours_only')
  const canSave = name.trim() !== '' && validRate(rate)
  return (
    <form className="pay-form" aria-label="Add a person" onSubmit={e => { e.preventDefault(); if (canSave) onSave({ name: name.trim(), rate: rate.trim(), treatment }) }}>
      <label className="queue-field">
        <span className="queue-field-label">Name</span>
        <input className="queue-field-input" name="name" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="e.g. Kurt" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Default rate (£/hour) — optional</span>
        <input className="queue-field-input" name="rate" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 20" />
      </label>
      <span className="queue-field-label">Does their labour count toward budget?</span>
      <TreatmentChooser value={treatment} onChange={setTreatment} name={name.trim() || 'this person'} />
      {error && <p className="queue-item-error" role="alert">{error}</p>}
      <div className="pay-form-actions">
        <button type="submit" className="btn-queue-save" disabled={saving || !canSave}>{saving ? 'Saving…' : 'Add person'}</button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  )
}

function PersonSettings({ person, saving, error, onSaveRate, onSaveTreatment, onBack }: {
  person: LabourPersonWithJobStats
  saving: boolean
  error: string | null
  onSaveRate: (rate: string | null) => void
  onSaveTreatment: (t: LabourBudgetTreatment) => void
  onBack: () => void
}) {
  const [editingRate, setEditingRate] = useState(false)
  const [rateDraft, setRateDraft] = useState(person.defaultHourlyRateAmount ?? '')
  return (
    <div className="row-sheet-substate">
      <button type="button" className="row-sheet-back" onClick={onBack}>‹ Back</button>
      <p className="row-sheet-cost">RATE</p>
      {editingRate ? (
        <form className="pay-form" aria-label="Set rate" onSubmit={e => { e.preventDefault(); if (validRate(rateDraft)) onSaveRate(rateDraft.trim() || null) }}>
          <label className="queue-field">
            <span className="queue-field-label">Rate (£/hour)</span>
            <input className="queue-field-input" name="rate" inputMode="decimal" value={rateDraft} autoFocus onChange={e => setRateDraft(e.target.value)} placeholder="e.g. 20" />
          </label>
          <div className="pay-form-actions">
            <button type="submit" className="btn-queue-save" disabled={saving || !validRate(rateDraft)}>{saving ? 'Saving…' : 'Save rate'}</button>
            {person.defaultHourlyRateAmount && (
              <button type="button" className="pay-clear-total" disabled={saving} onClick={() => onSaveRate(null)}>Clear rate</button>
            )}
            <button type="button" className="btn-queue-cancel" onClick={() => setEditingRate(false)} disabled={saving}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="labour-rate-row">
          <span className="labour-rate-value">{person.defaultHourlyRateAmount ? `£${person.defaultHourlyRateAmount}/hour` : 'No rate yet'}</span>
          <button type="button" className="btn-lens-add-text" onClick={() => { setRateDraft(person.defaultHourlyRateAmount ?? ''); setEditingRate(true) }}>Change ›</button>
        </div>
      )}
      <p className="row-sheet-cost">DOES {person.name.toUpperCase()}'S LABOUR COUNT TOWARD BUDGET?</p>
      <TreatmentChooser value={person.defaultBudgetTreatment} onChange={onSaveTreatment} name={person.name} />
      {error && <p className="queue-item-error" role="alert">{error}</p>}
    </div>
  )
}

export function ManagePeopleDrawer({ jobId, people, open, onClose, onChanged, initialPerson }: {
  jobId: string
  people: LabourPersonWithJobStats[]
  open: boolean
  onClose: () => void
  onChanged: () => void
  // When set, open straight on that person's settings (from a Labour-page row tap).
  initialPerson?: LabourPersonWithJobStats | null
}) {
  const [sub, setSub] = useState<ManageSub>({ kind: 'list' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setSub(initialPerson ? { kind: 'person', person: initialPerson } : { kind: 'list' }); setError(null) }
  }, [open, initialPerson])

  if (!open) return null

  // Keep the shown person fresh after a change (defaults update in place).
  const shownPerson = sub.kind === 'person' ? (people.find(p => p.id === sub.person.id) ?? sub.person) : null

  const addPerson = async (fields: { name: string; rate: string; treatment: LabourBudgetTreatment }) => {
    setSaving(true); setError(null)
    try {
      await createLabourPerson(jobId, {
        name: fields.name,
        defaultHourlyRateAmount: fields.rate || null,
        defaultHourlyRateCurrency: fields.rate ? 'GBP' : null,
        defaultBudgetTreatment: fields.treatment,
      })
      track('labour_person_added', { job_id: jobId, has_rate: fields.rate !== '', treatment: fields.treatment })
      onChanged()
      setSub({ kind: 'list' })
    } catch { setError('Could not add — check the name and try again') }
    finally { setSaving(false) }
  }

  const patch = async (personId: string, req: Parameters<typeof patchLabourPerson>[2], evt: string) => {
    setSaving(true); setError(null)
    try {
      await patchLabourPerson(jobId, personId, req)
      track(evt, { job_id: jobId })
      onChanged()
    } catch { setError('Could not save — try again') }
    finally { setSaving(false) }
  }

  const title =
    sub.kind === 'add' ? 'Add a person' :
    sub.kind === 'person' ? (shownPerson?.name ?? 'Person') :
    'People'

  return (
    <BottomSheet title={title} onClose={onClose}>
      {sub.kind === 'list' && (
        <div className="manage-people">
          <p className="row-sheet-sub">Set a rate and whether their hours count toward the job budget. Used to fill in new labour automatically.</p>
          <ul className="manage-people-list">
            {people.map(p => (
              <li key={p.id}>
                <button type="button" className="labour-person-row" onClick={() => { setError(null); setSub({ kind: 'person', person: p }) }}>
                  <span className="labour-person-name">{p.name}{p.isSelf && <span className="labour-person-you"> · you</span>}</span>
                  <span className="labour-person-figures">
                    {p.defaultHourlyRateAmount ? `£${p.defaultHourlyRateAmount}/h` : 'No rate yet'} · {p.defaultBudgetTreatment === 'counts_toward_budget' ? 'Counts toward budget' : 'Hours only'}
                  </span>
                  <span className="labour-person-chev" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-add-category" onClick={() => { setError(null); setSub({ kind: 'add' }) }}>+ Add a person</button>
        </div>
      )}

      {sub.kind === 'add' && (
        <div className="row-sheet-substate">
          <button type="button" className="row-sheet-back" onClick={() => setSub({ kind: 'list' })}>‹ Back</button>
          <AddPersonForm saving={saving} error={error} onSave={addPerson} onCancel={() => setSub({ kind: 'list' })} />
        </div>
      )}

      {sub.kind === 'person' && shownPerson && (
        <PersonSettings
          person={shownPerson}
          saving={saving}
          error={error}
          onSaveRate={rate => patch(shownPerson.id, { defaultHourlyRateAmount: rate, defaultHourlyRateCurrency: rate ? 'GBP' : null }, 'labour_person_rate_updated')}
          onSaveTreatment={t => patch(shownPerson.id, { defaultBudgetTreatment: t }, 'labour_person_treatment_updated')}
          onBack={() => setSub({ kind: 'list' })}
        />
      )}
    </BottomSheet>
  )
}
