import { jobsInGroup, liveJobs } from './jobGroups'
import type { Job } from './types'

/**
 * Book Home — the cover of The Job Book, one level above a single job.
 *
 * It answers exactly one question: which job do I want to open? So it is a
 * jobs index and nothing else — no Record bar (recording always happens
 * inside a named job, never against an ambiguous global destination), no
 * money, no counts of things to check, and no placeholder rows explaining
 * sections that don't exist yet.
 *
 * Coming here never changes which job is selected for recording. Only tapping
 * a job does that.
 */
export default function BookHomeScreen({
  jobs,
  onOpenJob,
  onOpenAllJobs,
  onOpenFinishedJobs,
}: {
  jobs: Job[]
  onOpenJob: (job: Job) => void
  onOpenAllJobs: () => void
  onOpenFinishedJobs: () => void
}) {
  const live = liveJobs(jobs)
  const finishedCount = jobsInGroup(jobs, 'finished').length

  return (
    <div className="book-page">
      {/* Ink band: the book level is a different place from a job, and the
          header treatment is what says so before a single word is read. */}
      <header className="book-header">
        <h1 className="book-title">The Job Book</h1>
      </header>

      <div className="book-body">
        <div className="book-section-head">
          <h2 className="book-section-label" id="jobs-on-the-book">Jobs on the book</h2>
          <button type="button" className="book-link" onClick={onOpenAllJobs}>
            All jobs<span className="book-chev" aria-hidden="true">›</span>
          </button>
        </div>

        <ul className="book-job-list" aria-labelledby="jobs-on-the-book">
          {live.map(job => (
            <li key={job.id}>
              <button type="button" className="book-job-row" onClick={() => onOpenJob(job)}>
                <span className="book-job-name">{job.title}</span>
                {/* In progress is the ordinary case and goes unsaid; only
                    Planning earns a word, because it changes what the job is. */}
                {job.status === 'planning' && <span className="book-job-state">Planning</span>}
                <span className="book-chev" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>

        {finishedCount > 0 && (
          <button type="button" className="book-finished-row" onClick={onOpenFinishedJobs}>
            <span className="book-finished-label">Finished jobs</span>{' '}
            <span className="book-finished-count">{finishedCount}</span>
            <span className="book-chev" aria-hidden="true">›</span>
          </button>
        )}
        {/* When every job is finished the list is simply empty. No explanatory
            paragraph: "All jobs ›" above is still the route to the finished
            work and to New job, and it is already on the page. */}
      </div>
    </div>
  )
}
