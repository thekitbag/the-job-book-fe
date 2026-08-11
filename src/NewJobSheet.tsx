import { useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import { createJob } from './api'
import { track } from './analytics'
import type { CreateJobRequest, Job } from './types'

/**
 * New job — the lightweight command that starts a job. Three things only: what
 * it's called, where it is (optional), and whether it has started or is being
 * planned. No budget, no customer, no dates: none of that is known when Mike
 * writes a job into the book, and asking for it is how a capture app turns
 * into an admin app.
 *
 * The primary action is "Add job", not the design pack's "Start the job" — a
 * Planning job has not started, and the copy has to be true for both states.
 */
export default function NewJobSheet({
  online,
  onAdded,
  onClose,
}: {
  online: boolean
  onAdded: (job: Job) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [where, setWhere] = useState('')
  const [status, setStatus] = useState<'started' | 'planning'>('started')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One tap, one job. React state lands a render too late to stop a double
  // tap, so the guard that actually holds is a ref read synchronously.
  const inFlight = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    const req: CreateJobRequest = {
      title: trimmed,
      roughLocationOrLabel: where.trim() || null,
      status,
    }
    try {
      const job = await createJob(req)
      track('job_created', { job_id: job.id, job_status: job.status, has_where: !!req.roughLocationOrLabel })
      onAdded(job)
    } catch {
      // Nothing is added to the index and nothing is selected: a job that was
      // not saved must never appear as if it were. The typed details stay put
      // so the retry is one tap, not a re-type.
      setError('Could not add the job — check your connection and try again')
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet title="New job" onClose={onClose}>
      {!online ? (
        <div className="new-job-offline">
          <p className="new-job-offline-msg">Adding a job needs a connection. You're offline right now.</p>
          <button type="button" className="btn-new-job-cancel" onClick={onClose}>Back</button>
        </div>
      ) : (
        <form className="new-job-form" onSubmit={handleSubmit}>
          <label className="new-job-field">
            <span className="new-job-field-label">Job name</span>
            <input
              className="new-job-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={80}
              required
              disabled={submitting}
            />
          </label>

          <label className="new-job-field">
            <span className="new-job-field-label">Where (optional)</span>
            <input
              className="new-job-input"
              value={where}
              onChange={e => setWhere(e.target.value)}
              placeholder="Address or road name"
              maxLength={160}
              disabled={submitting}
            />
          </label>

          <fieldset className="new-job-state" disabled={submitting}>
            <legend className="new-job-field-label">State</legend>
            <div className="new-job-state-options">
              {/* In progress is the default: most jobs are written into the
                  book because they are happening. */}
              {([['started', 'In progress'], ['planning', 'Planning']] as const).map(([value, label]) => (
                <label
                  key={value}
                  className={`new-job-state-option${status === value ? ' new-job-state-option--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="newJobState"
                    value={value}
                    checked={status === value}
                    onChange={() => setStatus(value)}
                    className="new-job-state-radio"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="new-job-error" role="alert">{error}</p>}

          <div className="new-job-actions">
            <button type="submit" className="btn-new-job-submit" disabled={submitting || !title.trim()}>
              {submitting ? 'Adding…' : 'Add job'}
            </button>
            <button type="button" className="btn-new-job-cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </BottomSheet>
  )
}
