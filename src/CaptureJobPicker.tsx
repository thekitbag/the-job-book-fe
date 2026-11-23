import { useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import NewJobSheet from './NewJobSheet'
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
}: {
  jobs: Job[]
  order: string[]
  lastJobId: string | null
  online: boolean
  onChoose: (job: Job, method: 'picker' | 'new_job') => void | Promise<void>
  onClose: () => void
  onJobAdded: (job: Job) => void
  title?: string
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
      <div className="capture-picker-list">
        {snapshot
          .filter((j) => j.status === 'started' || other)
          .map((job) => (
            <button
              className="capture-job-choice"
              type="button"
              key={job.id}
              disabled={saving}
              onClick={() => {
                void choose(job, 'picker')
              }}
            >
              {job.title}
            </button>
          ))}
      </div>
      {!other &&
        snapshot.some(
          (j) => j.status === 'planning' || j.status === 'finished',
        ) && (
          <button
            className="capture-link"
            type="button"
            onClick={() => setOther(true)}
          >
            Planning and finished jobs
          </button>
        )}
      {online ? (
        <button
          className="capture-link"
          type="button"
          disabled={saving}
          onClick={() => setAdding(true)}
        >
          New job
        </button>
      ) : (
        <p>New job needs signal. You can still choose a saved job.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="capture-secondary" type="button" onClick={onClose}>
        Later
      </button>
    </BottomSheet>
  )
}
