import { useCallback, useEffect, useState } from 'react'
import { getCurrentJob, ApiError } from './api'
import CaptureScreen from './CaptureScreen'
import PasscodeScreen from './PasscodeScreen'
import ReviewQueueScreen from './ReviewQueueScreen'
import type { Job } from './types'

const CACHED_JOB_KEY = 'job-book-cached-job'

function loadCachedJob(): Job | null {
  try {
    const raw = localStorage.getItem(CACHED_JOB_KEY)
    return raw ? (JSON.parse(raw) as Job) : null
  } catch {
    return null
  }
}

type AppState = 'loading' | 'ready' | 'unauthenticated' | 'error'
type AppView = 'capture' | 'reviewQueue'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [job, setJob] = useState<Job | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [view, setView] = useState<AppView>('capture')

  const fetchJob = useCallback(() => {
    setAppState('loading')
    getCurrentJob()
      .then(j => {
        localStorage.setItem(CACHED_JOB_KEY, JSON.stringify(j))
        setJob(j)
        setAppState('ready')
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          setAppState('unauthenticated')
          return
        }
        const cached = loadCachedJob()
        if (cached) {
          setJob(cached)
          setAppState('ready')
          return
        }
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job')
        setAppState('error')
      })
  }, [])

  useEffect(() => { fetchJob() }, [fetchJob])

  if (appState === 'loading') {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    )
  }

  if (appState === 'unauthenticated') {
    return <PasscodeScreen onLoginSuccess={fetchJob} />
  }

  if (appState === 'error' || !job) {
    return (
      <div className="app-error">
        <p>Could not load the current job.</p>
        <p className="app-error-detail">{errorMsg}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    )
  }

  if (view === 'reviewQueue') {
    return <ReviewQueueScreen job={job} onClose={() => setView('capture')} />
  }

  return <CaptureScreen job={job} onOpenReviewQueue={() => setView('reviewQueue')} />
}
