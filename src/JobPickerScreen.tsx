import { useState } from 'react'
import { createJob } from './api'
import type { Job, JobType } from './types'

const JOB_TYPE_OPTIONS: { value: JobType; label: string }[] = [
  { value: 'garden_room', label: 'Garden room' },
  { value: 'extension', label: 'Extension' },
  { value: 'other', label: 'Other' },
]

function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_OPTIONS.find(o => o.value === jobType)?.label ?? ''
}

function AddJobForm({
  onAdded,
  onCancel,
  online,
}: {
  onAdded: (job: Job) => void
  onCancel: () => void
  online: boolean
}) {
  const [title, setTitle] = useState('')
  const [jobType, setJobType] = useState<JobType>('garden_room')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const job = await createJob(title, jobType)
      onAdded(job)
    } catch {
      setError('Could not add job — check your connection and try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (!online) {
    return (
      <div className="add-job-offline">
        <p className="add-job-offline-msg">Adding a job needs a connection. You're offline right now.</p>
        <button className="btn-add-job-cancel" onClick={onCancel}>Back</button>
      </div>
    )
  }

  return (
    <form className="add-job-form" aria-label="Add job" onSubmit={handleSubmit}>
      <h2 className="add-job-heading">Add job</h2>
      <label className="add-job-field">
        <span className="add-job-field-label">Job name</span>
        <input
          className="add-job-field-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Poole garden room"
          required
          autoFocus
          disabled={submitting}
        />
      </label>
      <fieldset className="add-job-type-fieldset" disabled={submitting}>
        <legend className="add-job-field-label">Job type</legend>
        <div className="add-job-type-options">
          {JOB_TYPE_OPTIONS.map(opt => (
            <label key={opt.value} className={`add-job-type-option${jobType === opt.value ? ' add-job-type-option--selected' : ''}`}>
              <input
                type="radio"
                name="jobType"
                value={opt.value}
                checked={jobType === opt.value}
                onChange={() => setJobType(opt.value)}
                className="add-job-type-radio"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="add-job-error" role="alert">{error}</p>}
      <div className="add-job-actions">
        <button type="submit" className="btn-add-job-submit" disabled={submitting || !title.trim()}>
          {submitting ? 'Adding…' : 'Add job'}
        </button>
        <button type="button" className="btn-add-job-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function JobPickerScreen({
  jobs,
  selectedJobId,
  online,
  onSelect,
  onJobAdded,
  onClose,
  title = 'Switch job',
  hideBack = false,
}: {
  jobs: Job[]
  selectedJobId: string | null
  online: boolean
  onSelect: (job: Job) => void
  onJobAdded: (job: Job) => void
  onClose: () => void
  title?: string
  hideBack?: boolean
}) {
  const [showAddForm, setShowAddForm] = useState(false)

  function handleAdded(job: Job) {
    onJobAdded(job)
    setShowAddForm(false)
  }

  return (
    <div className="job-picker-page">
      <header className="job-picker-header">
        {!hideBack && (
          <button className="btn-job-picker-back" onClick={onClose} aria-label="Back">
            ← Back
          </button>
        )}
        <h1 className="job-picker-title">{title}</h1>
      </header>

      {showAddForm ? (
        <AddJobForm
          onAdded={handleAdded}
          onCancel={() => setShowAddForm(false)}
          online={online}
        />
      ) : (
        <>
          <ul className="job-picker-list">
            {jobs.map(job => (
              <li key={job.id}>
                <button
                  className={`job-picker-item${job.id === selectedJobId ? ' job-picker-item--selected' : ''}`}
                  onClick={() => onSelect(job)}
                  aria-pressed={job.id === selectedJobId}
                >
                  <span className="job-picker-item-title">{job.title}</span>
                  {job.jobType && job.jobType !== 'other' && (
                    <span className="job-picker-item-type">{jobTypeLabel(job.jobType)}</span>
                  )}
                  {job.id === selectedJobId && (
                    <span className="job-picker-item-check" aria-hidden="true">✓</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="job-picker-add">
            <button
              className="btn-job-picker-add"
              onClick={() => setShowAddForm(true)}
            >
              + Add job
            </button>
          </div>
        </>
      )}
    </div>
  )
}
