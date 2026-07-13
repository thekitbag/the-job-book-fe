import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, getJobs, logout, onUnauthorized, ApiError } from './api'
import { identifyAnalyticsUser, resetAnalyticsUser, track } from './analytics'
import CurrentJobWorkspace from './CurrentJobWorkspace'
import AuthScreen, { getResetToken } from './AuthScreen'
import ReviewQueueScreen from './ReviewQueueScreen'
import JobPickerScreen from './JobPickerScreen'
import type { AuthUser, Job } from './types'

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

// Never leave another account's job data visible/cached after logout or a
// session lapsing mid-use (401 from any core data load).
function clearLocalJobData() {
  localStorage.removeItem(CACHED_JOBS_KEY)
  localStorage.removeItem(SELECTED_JOB_ID_KEY)
}

function pickJob(jobs: Job[], storedId: string | null): Job | null {
  if (storedId) {
    const match = jobs.find(j => j.id === storedId)
    if (match) return match
  }
  return jobs.find(j => j.status === 'started')
    ?? jobs.find(j => j.status === 'planning')
    ?? jobs.find(j => j.status === 'finished')
    ?? jobs[0] ?? null
}

type AppState = 'loading' | 'ready' | 'unauthenticated' | 'error' | 'noJobs'
type AppView = 'workspace' | 'reviewQueue' | 'jobPicker'

export default function App() {
  // A password-reset link must work even for a browser that still has a valid
  // session (an old tab left open, a stale cookie, etc.) — always defer to
  // AuthScreen's reset-confirm flow when the URL carries a reset token.
  const [hasResetToken, setHasResetToken] = useState(() => !!getResetToken())
  const [appState, setAppState] = useState<AppState>('loading')
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [view, setView] = useState<AppView>('workspace')
  const [online, setOnline] = useState(navigator.onLine)
  // Current account (for role-gated UI like the internal Support entry).
  // Best-effort: the app works without it; only INTERNAL extras depend on it.
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)

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

  // A 401 from any in-app data load (not just the initial jobs fetch) means
  // the session has lapsed — drop straight back to the auth screen with no
  // stale job data left visible.
  useEffect(() => {
    onUnauthorized(() => {
      clearLocalJobData()
      setJobs([])
      setSelectedJob(null)
      setAppState('unauthenticated')
    })
    return () => onUnauthorized(null)
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

  // Role lookup for gated UI. Refreshes alongside auth transitions; a failure
  // just means no internal extras are shown.
  useEffect(() => {
    if (appState !== 'ready' && appState !== 'noJobs') return
    getCurrentUser()
      .then(u => {
        setCurrentUser(u)
        // Restored sessions never pass through AuthScreen — identify here so a
        // returning user's events are attributed (id + role only, never email).
        identifyAnalyticsUser(u)
      })
      .catch(() => setCurrentUser(null))
  }, [appState])

  // A job edit (title rename, status change) must update everywhere the job
  // is shown or cached: the workspace header, the job list, and the offline
  // cache. Archiving is special: it removes the job from the normal list,
  // and if it was the selected job, moves the user to another visible job
  // (or the job picker/empty state if none remain).
  function handleJobUpdated(updated: Job) {
    if (updated.status === 'archived') {
      const remaining = jobs.filter(j => j.id !== updated.id)
      localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(remaining))
      setJobs(remaining)
      // Stale guard: only move the selection if the archived job is (still)
      // the one currently selected — an archive response for a job the user
      // has since switched away from must not disturb the job now shown.
      if (!selectedJob || selectedJob.id !== updated.id) return
      const next = pickJob(remaining, null)
      if (next) {
        setSelectedJob(next)
        localStorage.setItem(SELECTED_JOB_ID_KEY, next.id)
      } else {
        setSelectedJob(null)
        localStorage.removeItem(SELECTED_JOB_ID_KEY)
        setAppState('noJobs')
      }
      return
    }
    setSelectedJob(prev => (prev && prev.id === updated.id ? updated : prev))
    setJobs(prev => {
      const next = prev.map(j => (j.id === updated.id ? updated : j))
      localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(next))
      return next
    })
  }

  // `cause` keeps job_switched meaning a deliberate switch: selecting the job
  // that was just created is part of job_created, not a switch.
  function handleSelectJob(job: Job, cause: 'switch' | 'created' = 'switch') {
    if (cause === 'switch' && selectedJob && selectedJob.id !== job.id) {
      track('job_switched', { job_id: job.id })
    }
    setSelectedJob(job)
    localStorage.setItem(SELECTED_JOB_ID_KEY, job.id)
    setView('workspace')
  }

  function handleJobAdded(job: Job) {
    const updated = [job, ...jobs]
    setJobs(updated)
    localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(updated))
    setAppState('ready')
    handleSelectJob(job, 'created')
  }

  // Clear local state regardless of whether the backend call succeeds — the
  // priority is never showing this account's data again once Mike has logged out.
  async function handleLogout() {
    track('auth_logout')
    try {
      await logout()
    } catch {
      // ignored — local state is cleared unconditionally below
    }
    // Reset after the logout event so it is still attributed to the user,
    // and before local state clears so no later event carries this identity.
    resetAnalyticsUser()
    clearLocalJobData()
    setJobs([])
    setSelectedJob(null)
    setAppState('unauthenticated')
  }

  if (hasResetToken) {
    return <AuthScreen onAuthSuccess={() => { setHasResetToken(false); loadJobs() }} />
  }

  if (appState === 'loading') {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    )
  }

  if (appState === 'unauthenticated') {
    return <AuthScreen onAuthSuccess={() => loadJobs()} />
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
      <>
        {/* Internal accounts often have no jobs of their own — keep the
            Support entry reachable from the first-job screen too. */}
        {currentUser?.role === 'INTERNAL' && (
          <div className="support-entry-bar">
            <a className="btn-support-entry" href="/internal/support">Founder support ›</a>
          </div>
        )}
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
      </>
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
        onClose={() => setView('workspace')}
      />
    )
  }

  if (view === 'reviewQueue') {
    return <ReviewQueueScreen job={selectedJob} onClose={() => setView('workspace')} />
  }

  return (
    <CurrentJobWorkspace
      job={selectedJob}
      onOpenReviewQueue={() => setView('reviewQueue')}
      onSwitchJob={() => setView('jobPicker')}
      onLogout={handleLogout}
      user={currentUser}
      onJobUpdated={handleJobUpdated}
    />
  )
}
