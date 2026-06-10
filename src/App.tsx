import { useCallback, useEffect, useState } from 'react'
import { getJobs, ApiError } from './api'
import CaptureScreen from './CaptureScreen'
import PasscodeScreen from './PasscodeScreen'
import ReviewQueueScreen from './ReviewQueueScreen'
import JobPickerScreen from './JobPickerScreen'
import type { Job } from './types'

const SELECTED_JOB_ID_KEY = 'job-book-selected-job-id'
const CACHED_JOBS_KEY = 'job-book-cached-jobs'

function loadCachedJobs(): Job[] {
  try {
    const raw = localStorage.getItem(CACHED_JOBS_KEY)
    return raw ? (JSON.parse(raw) as Job[]) : []
  } catch {
    return []
  }
}

function loadSelectedJobId(): string | null {
  return localStorage.getItem(SELECTED_JOB_ID_KEY)
}

function pickJob(jobs: Job[], storedId: string | null): Job | null {
  if (storedId) {
    const match = jobs.find(j => j.id === storedId)
    if (match) return match
  }
  return jobs.find(j => j.status === 'active') ?? jobs[0] ?? null
}

type AppState = 'loading' | 'ready' | 'unauthenticated' | 'error' | 'noJobs'
type AppView = 'capture' | 'reviewQueue' | 'jobPicker'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [view, setView] = useState<AppView>('capture')
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const setOn = () => setOnline(true)
    const setOff = () => setOnline(false)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    return () => {
      window.removeEventListener('online', setOn)
      window.removeEventListener('offline', setOff)
    }
  }, [])

  const loadJobs = useCallback(() => {
    setAppState('loading')
    getJobs()
      .then(loaded => {
        localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(loaded))
        setJobs(loaded)
        const storedId = loadSelectedJobId()
        const chosen = pickJob(loaded, storedId)
        if (!chosen) {
          setAppState('noJobs')
          return
        }
        setSelectedJob(chosen)
        localStorage.setItem(SELECTED_JOB_ID_KEY, chosen.id)
        setAppState('ready')
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          setAppState('unauthenticated')
          return
        }
        // Offline fallback: use cached jobs and selected id
        const cached = loadCachedJobs()
        const storedId = loadSelectedJobId()
        const chosen = pickJob(cached, storedId)
        if (chosen) {
          setJobs(cached)
          setSelectedJob(chosen)
          setAppState('ready')
          return
        }
        setErrorMsg(err instanceof Error ? err.message : 'Could not load jobs')
        setAppState('error')
      })
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs])

  function handleSelectJob(job: Job) {
    setSelectedJob(job)
    localStorage.setItem(SELECTED_JOB_ID_KEY, job.id)
    setView('capture')
  }

  function handleJobAdded(job: Job) {
    const updated = [job, ...jobs]
    setJobs(updated)
    localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(updated))
    handleSelectJob(job)
  }

  if (appState === 'loading') {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    )
  }

  if (appState === 'unauthenticated') {
    return <PasscodeScreen onLoginSuccess={loadJobs} />
  }

  if (appState === 'error') {
    return (
      <div className="app-error">
        <p>Could not load jobs.</p>
        <p className="app-error-detail">{errorMsg}</p>
        <button onClick={loadJobs}>Try again</button>
      </div>
    )
  }

  if (appState === 'noJobs') {
    return (
      <JobPickerScreen
        jobs={[]}
        selectedJobId={null}
        online={online}
        onSelect={handleSelectJob}
        onJobAdded={handleJobAdded}
        onClose={() => {}}
        title="Add first job"
        hideBack={true}
      />
    )
  }

  if (!selectedJob) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    )
  }

  if (view === 'jobPicker') {
    return (
      <JobPickerScreen
        jobs={jobs}
        selectedJobId={selectedJob.id}
        online={online}
        onSelect={handleSelectJob}
        onJobAdded={handleJobAdded}
        onClose={() => setView('capture')}
      />
    )
  }

  if (view === 'reviewQueue') {
    return <ReviewQueueScreen job={selectedJob} onClose={() => setView('capture')} />
  }

  return (
    <CaptureScreen
      job={selectedJob}
      onOpenReviewQueue={() => setView('reviewQueue')}
      onSwitchJob={() => setView('jobPicker')}
    />
  )
}
