import { useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import NewJobSheet from './NewJobSheet'
import { formatJobDay } from './SourceHistory'
import type { Job } from './types'
export default function CaptureJobPicker({
  jobs,
  order,
  lastJobId,
  online,
  onChoose,
  onClose,
  onJobAdded,
  title = 'Which job?',
  savedLabel,
  lastActivity = {},
  excludeJobId,
}: {
  jobs: Job[]
  order: string[]
  lastJobId: string | null
  online: boolean
  onChoose: (job: Job, method: 'picker' | 'new_job') => void | Promise<void>
  onClose: () => void
  onJobAdded: (job: Job) => void
  title?: string
  savedLabel?: string
  lastActivity?: Record<string, string>
  excludeJobId?: string
}) {
  const initialOrder = useRef(order),
    initialLast = useRef(lastJobId)
  const takeSnapshot = (available: Job[]) => {
    const order = initialOrder.current,
      lastJobId = initialLast.current
    const jobs = available
    const rank = (j: Job) =>
      j.id === lastJobId
        ? -1
        : order.includes(j.id)
          ? order.indexOf(j.id)
          : order.length + jobs.indexOf(j)
    return jobs
      .filter((j) => j.status !== 'archived')
      .map((j) => ({ ...j }))
      .sort((a, b) => rank(a) - rank(b))
  }
  const [snapshot, setSnapshot] = useState(() => takeSnapshot(jobs))
  // Populate a cold picker once data arrives; existing rows never move.
  if (!snapshot.length && jobs.some((j) => j.status !== 'archived'))
    setSnapshot(takeSnapshot(jobs))
  const [other, setOther] = useState(false),
    [adding, setAdding] = useState(false),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    lock = useRef(false)
  const choose = async (job: Job, method: 'picker' | 'new_job') => {
    if (lock.current) return
    lock.current = true
    setSaving(true)
    try {
      await onChoose(job, method)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save that choice. Try again.',
      )
      lock.current = false
      setSaving(false)
    }
  }
  if (adding)
    return (
      <NewJobSheet
        online={online}
        onClose={() => setAdding(false)}
        onAdded={(job) => {
          onJobAdded(job)
          setAdding(false)
          void choose(job, 'new_job')
        }}
      />
    )
  return (
    <BottomSheet title={title} onClose={onClose}>
      {savedLabel && (
        <p className="capture-picker-saved">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4.5 12.5l5 5L19.5 7" />
          </svg>
          {savedLabel}
        </p>
      )}
      <div className="capture-picker-list">
        {snapshot
          .filter(
            (j) => j.id !== excludeJobId && (j.status === 'started' || other),
          )
          .map((job) => {
            const detail =
              job.status === 'planning'
                ? 'Planning'
                : job.status === 'finished'
                  ? 'Finished'
                  : lastActivity[job.id]
                    ? formatJobDay(lastActivity[job.id])
                    : ''
            return (
              <button
                className="capture-job-choice"
                type="button"
                key={job.id}
                aria-label={job.title}
                disabled={saving}
                onClick={() => {
                  void choose(job, 'picker')
                }}
              >
                <span>
                  <strong>{job.title}</strong>
                  {detail && <small>{detail}</small>}
                </span>
                <span className="capture-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            )
          })}
        {!other &&
          snapshot.some(
            (j) =>
              j.id !== excludeJobId &&
              (j.status === 'planning' || j.status === 'finished'),
          ) && (
            <button
              className="capture-picker-action capture-picker-more"
              type="button"
              onClick={() => setOther(true)}
            >
              <span>Planning and finished jobs</span>
              <span className="capture-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          )}
        {online ? (
          <button
            className="capture-picker-action capture-picker-new"
            type="button"
            disabled={saving}
            onClick={() => setAdding(true)}
          >
            <span>
              <span aria-hidden="true">+ </span>New job
            </span>
          </button>
        ) : (
          <p className="capture-picker-note">
            New job needs signal. You can still choose a saved job.
          </p>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="capture-picker-footer">
        <button
          className="capture-picker-later"
          type="button"
          onClick={onClose}
        >
          Later
        </button>
      </div>
    </BottomSheet>
  )
}
