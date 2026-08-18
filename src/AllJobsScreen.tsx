import { useState } from 'react'
import NewJobSheet from './NewJobSheet'
import { JOB_GROUP_LABELS, indexedJobs, jobsInGroup, type JobGroupKey } from './jobGroups'
import type { Job } from './types'

const GROUP_ORDER: JobGroupKey[] = ['started', 'planning', 'finished']

/**
 * All Jobs — one grouped index of every job, in progress through finished.
 *
 * Deliberately not tabs: Mike is looking for a job he half-remembers, and a
 * tab hides two thirds of the book behind a guess about which state it's in.
 * One scroll shows the lot.
 *
 * Rows carry the job name and where it is, and nothing else. There is no
 * honest "started 11 Jul" or "finished 20 Jun" to show — createdAt/updatedAt
 * record when the row changed, not when work happened — so the design's date
 * line is omitted rather than invented.
 */
export default function AllJobsScreen({
  jobs,
  online,
  hideBack = false,
  onOpenJob,
  onJobAdded,
  onBack,
}: {
  jobs: Job[]
  online: boolean
  hideBack?: boolean
  onOpenJob: (job: Job) => void
  onJobAdded: (job: Job) => void
  onBack: () => void
}) {
  const [newJobOpen, setNewJobOpen] = useState(false)

  const total = indexedJobs(jobs).length

  return (
    <div className="book-page">
      <header className="book-header book-header--sub">
        {!hideBack && (
          <button type="button" className="book-back" onClick={onBack} aria-label="Back to The Job Book">
            <span aria-hidden="true">‹ </span>The Job Book
          </button>
        )}
        <h1 className="book-title book-title--sub">
          All jobs <span className="book-total">{total}</span>
        </h1>
      </header>

      <div className="book-body">
        <div className="book-section-head book-section-head--ruled">
          <h2 className="book-section-label">Every job</h2>
          {/* A command, not a filter: it sits with the page action, never as a
              fourth group in the list. */}
          <button type="button" className="book-link" onClick={() => setNewJobOpen(true)}>New job</button>
        </div>

        {GROUP_ORDER.map(key => {
          const groupJobs = jobsInGroup(jobs, key)
          if (groupJobs.length === 0) return null
          const label = JOB_GROUP_LABELS[key]
          return (
            <section
              key={key}
              className="alljobs-group"
              aria-label={label}
            >
              <h2 className="alljobs-group-head">
                {label} <span className="alljobs-group-count">{groupJobs.length}</span>
              </h2>
              <ul className="alljobs-list">
                {groupJobs.map(job => (
                  <li key={job.id}>
                    <button type="button" className="alljobs-row" onClick={() => onOpenJob(job)}>
                      <span className="alljobs-row-main">
                        <span className="alljobs-row-name">{job.title}</span>
                        {job.roughLocationOrLabel && (
                          <span className="alljobs-row-where">{job.roughLocationOrLabel}</span>
                        )}
                      </span>
                      <span className="book-chev" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {newJobOpen && (
        <NewJobSheet
          online={online}
          onAdded={job => { setNewJobOpen(false); onJobAdded(job) }}
          onClose={() => setNewJobOpen(false)}
        />
      )}
    </div>
  )
}
