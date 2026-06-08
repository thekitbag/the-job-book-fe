import { useEffect, useState } from 'react'
import { getCurrentJob } from './api'
import CaptureScreen from './CaptureScreen'
import ReviewScreen from './ReviewScreen'
import type { Job } from './types'

type AppState = 'loading' | 'ready' | 'error'
type AppView = 'capture' | 'review'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [job, setJob] = useState<Job | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [view, setView] = useState<AppView>('capture')

  useEffect(() => {
    getCurrentJob()
      .then(j => { setJob(j); setAppState('ready') })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job')
        setAppState('error')
      })
  }, [])

  if (appState === 'loading') {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    )
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

  if (view === 'review') {
    return <ReviewScreen job={job} onClose={() => setView('capture')} />
  }

  return <CaptureScreen job={job} onOpenReview={() => setView('review')} />
}
