import { useCallback, useEffect, useState } from 'react'
import {
  AuxiliaryCaptureControls,
  CaptureSyncProvider,
  useCaptureContext,
} from './CaptureSyncProvider'
import {
  beginSignedInSession,
  clearLocalOwner,
  establishLocalOwner,
  getCaptureSessionId,
  getLocalOwnerId,
} from './localOwner'
import { stampUnownedCaptures } from './db'
import {
  getCurrentUser,
  getJobs,
  getWorkshop,
  logout,
  onUnauthorized,
  ApiError,
} from './api'
import { identifyAnalyticsUser, resetAnalyticsUser, track } from './analytics'
import CurrentJobWorkspace from './CurrentJobWorkspace'
import AuthScreen, { getResetToken } from './AuthScreen'
import ReviewQueueScreen from './ReviewQueueScreen'
import BookHomeScreen from './BookHomeScreen'
import AllJobsScreen from './AllJobsScreen'
import WorkshopScreen from './WorkshopScreen'
import type { AuthUser, Job, WorkshopResponse } from './types'
import type { JobEntry } from './CurrentJobWorkspace'

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
  clearLocalOwner()
  localStorage.removeItem(CACHED_JOBS_KEY)
  localStorage.removeItem(SELECTED_JOB_ID_KEY)
}

function pickJob(jobs: Job[], storedId: string | null): Job | null {
  if (storedId) {
    const match = jobs.find((j) => j.id === storedId)
    if (match) return match
  }
  return (
    jobs.find((j) => j.status === 'started') ??
    jobs.find((j) => j.status === 'planning') ??
    jobs.find((j) => j.status === 'finished') ??
    jobs[0] ??
    null
  )
}

type AppState = 'ready' | 'unauthenticated' | 'noJobs'
// The app still launches into the last selected Job Home. Book Home is the
// level above it, reached from a job — never the default screen.
type AppView = 'workspace' | 'reviewQueue' | 'bookHome' | 'allJobs' | 'workshop'

function AppContent() {
  const { setSyncEnabled } = useCaptureContext()!
  // A password-reset link must work even for a browser that still has a valid
  // session (an old tab left open, a stale cookie, etc.) — always defer to
  // AuthScreen's reset-confirm flow when the URL carries a reset token.
  const [hasResetToken, setHasResetToken] = useState(() => !!getResetToken())
  const [jobs, setJobs] = useState<Job[]>(loadCachedJobs)
  const [selectedJob, setSelectedJob] = useState<Job | null>(() =>
    pickJob(loadCachedJobs(), loadSelectedJobId()),
  )
  const [appState, setAppState] = useState<AppState>(() =>
    loadCachedJobs().length ? 'ready' : 'noJobs',
  )
  const [jobsLoadState, setJobsLoadState] = useState<
    'loading' | 'ready' | 'error'
  >(() => (loadCachedJobs().length ? 'ready' : 'loading'))
  const [errorMsg, setErrorMsg] = useState('')
  const [view, setView] = useState<AppView>('workspace')
  const [online, setOnline] = useState(navigator.onLine)
  const [workshopData, setWorkshopData] = useState<WorkshopResponse | null>(
    null,
  )
  const [workshopState, setWorkshopState] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [jobEntry, setJobEntry] = useState<JobEntry | null>(null)
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
  const expireSession = useCallback(() => {
    setSyncEnabled(false)
    clearLocalJobData()
    setJobs([])
    setJobsLoadState('loading')
    setSelectedJob(null)
    setCurrentUser(null)
    setWorkshopData(null)
    setView('workspace')
    setAppState('unauthenticated')
  }, [setSyncEnabled])

  useEffect(() => {
    onUnauthorized(expireSession)
    return () => onUnauthorized(null)
  }, [expireSession])

  useEffect(() => {
    setSyncEnabled(!hasResetToken && appState !== 'unauthenticated')
  }, [hasResetToken, appState, setSyncEnabled])

  const loadJobs = useCallback(() => {
    const session = getCaptureSessionId()
    setErrorMsg('')
    setJobsLoadState((previous) => (previous === 'ready' ? 'ready' : 'loading'))
    // Never replace a usable cached screen with a loading gate.
    void getJobs()
      .then((loaded) => {
        if (session !== getCaptureSessionId()) return
        localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(loaded))
        setJobs(loaded)
        setJobsLoadState('ready')
        const chosen = pickJob(loaded, loadSelectedJobId())
        setSelectedJob(chosen)
        if (chosen) localStorage.setItem(SELECTED_JOB_ID_KEY, chosen.id)
        else localStorage.removeItem(SELECTED_JOB_ID_KEY)
        setAppState(chosen ? 'ready' : 'noJobs')
      })
      .catch((err: unknown) => {
        if (session !== getCaptureSessionId()) return
        if (err instanceof ApiError && err.status === 401) {
          expireSession()
          return
        }
        setJobsLoadState((previous) =>
          previous === 'ready' ? 'ready' : 'error',
        )
        setErrorMsg(
          'Jobs could not refresh. You can still record on this phone.',
        )
      })
  }, [expireSession])

  useEffect(() => {
    if (!hasResetToken) loadJobs()
  }, [loadJobs, hasResetToken])

  const signedOut = appState === 'unauthenticated'

  // Identity lookup is independent of jobs: a hung jobs request must not delay
  // stamping captures made before /me resolves. Sign-in always rotates session.
  useEffect(() => {
    if (hasResetToken || signedOut) return
    const session = getCaptureSessionId()
    let active = true
    void getCurrentUser()
      .then(async (user) => {
        if (!active || session !== getCaptureSessionId()) return
        const previousOwner = getLocalOwnerId()
        if (!establishLocalOwner(user.id, session)) return
        if (previousOwner && previousOwner !== user.id) {
          localStorage.removeItem(CACHED_JOBS_KEY)
          localStorage.removeItem(SELECTED_JOB_ID_KEY)
          setJobs([])
          setJobsLoadState('loading')
          setSelectedJob(null)
          setWorkshopData(null)
          setView('workspace')
          setAppState('noJobs')
          loadJobs()
        } else {
          await stampUnownedCaptures(user.id, session).catch(() => {})
        }
        if (getLocalOwnerId() !== user.id) return
        setCurrentUser(user)
        identifyAnalyticsUser(user)
      })
      .catch((err: unknown) => {
        if (!active || session !== getCaptureSessionId()) return
        if (err instanceof ApiError && err.status === 401) expireSession()
        else setCurrentUser(null)
      })
    return () => {
      active = false
    }
  }, [signedOut, hasResetToken, loadJobs, expireSession])

  function handleAuthSuccess(user: AuthUser) {
    beginSignedInSession(user.id)
    localStorage.removeItem(CACHED_JOBS_KEY)
    localStorage.removeItem(SELECTED_JOB_ID_KEY)
    setJobs([])
    setJobsLoadState('loading')
    setSelectedJob(null)
    setWorkshopData(null)
    setView('workspace')
    setCurrentUser(user)
    setAppState('noJobs')
    setSyncEnabled(true)
    setHasResetToken(false)
    loadJobs()
  }

  // Workshop is availability memory changed from two places — the Workshop page
  // itself and any job's leftover — so it is re-read on every arrival at the
  // book level rather than cached. A leftover moved in a moment ago is already
  // on the cover by the time Mike gets back to it.
  const loadWorkshop = useCallback(() => {
    setWorkshopState((prev) => (prev === 'ready' ? 'ready' : 'loading'))
    getWorkshop()
      .then((res) => {
        setWorkshopData(res)
        setWorkshopState('ready')
      })
      .catch(() => setWorkshopState('error'))
  }, [])

  const openBookHome = useCallback(() => {
    loadWorkshop()
    setView('bookHome')
  }, [loadWorkshop])

  const openWorkshop = useCallback(() => {
    track('workshop_opened')
    loadWorkshop()
    setView('workshop')
  }, [loadWorkshop])

  // A job edit (title rename, status change) must update everywhere the job
  // is shown or cached: the workspace header, the job list, and the offline
  // cache. Archiving is special: it removes the job from the normal list,
  // and if it was the selected job, moves the user to another visible job
  // (or the job picker/empty state if none remain).
  function handleJobUpdated(updated: Job) {
    if (updated.status === 'archived') {
      const remaining = jobs.filter((j) => j.id !== updated.id)
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
    setSelectedJob((prev) => (prev && prev.id === updated.id ? updated : prev))
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === updated.id ? updated : j))
      localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(next))
      return next
    })
  }

  // Opening a job from Book Home or All Jobs is what makes it the recording
  // destination — and the only thing that does. Moving up to the book level
  // and back down again leaves the selection exactly where it was, and a
  // recording already in flight keeps the job id it captured at start.
  //
  // `cause` keeps job_switched meaning a deliberate switch: selecting the job
  // that was just created is part of job_created, not a switch.
  function handleSelectJob(
    job: Job,
    cause: 'switch' | 'created' = 'switch',
    entry: JobEntry | null = null,
  ) {
    if (cause === 'switch' && selectedJob && selectedJob.id !== job.id) {
      track('job_switched', { job_id: job.id })
    }
    setJobEntry(entry)
    setSelectedJob(job)
    localStorage.setItem(SELECTED_JOB_ID_KEY, job.id)
    setView('workspace')
  }

  function openWorkshopSource(target: {
    jobId: string
    sourceMemoryItemId: string | null
  }) {
    const job = jobs.find((j) => j.id === target.jobId)
    if (!job) return
    handleSelectJob(job, 'switch', {
      jobId: job.id,
      focusItemId: target.sourceMemoryItemId ?? undefined,
    })
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
    resetAnalyticsUser()
    expireSession()
    try {
      await logout()
    } catch {
      /* Local identity already cleared. */
    }
  }

  if (hasResetToken || appState === 'unauthenticated') {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />
  }

  const workspaceVisible = !!selectedJob && view === 'workspace'
  return (
    <>
      {errorMsg && (
        <div className="capture-refresh-error" role="status">
          <p>{errorMsg}</p>
          <button onClick={loadJobs}>Try again</button>
        </div>
      )}
      <AuxiliaryCaptureControls
        workspaceVisible={workspaceVisible}
        allowIdle={!selectedJob}
      />
      {renderScreen()}
    </>
  )

  function renderScreen() {
    if (!selectedJob && view === 'workspace') {
      return (
        <>
          {/* Internal accounts often have no jobs of their own — keep the
            Support entry reachable from the first-job screen too. */}
          {currentUser?.role === 'INTERNAL' && (
            <div className="support-entry-bar">
              <a className="btn-support-entry" href="/internal/support">
                Founder support ›
              </a>
            </div>
          )}
          {/* An empty book still opens on All Jobs rather than a special
          first-run screen: it already carries the one route that matters
          (New job), and it is the same page Mike will use ever after. */}
          {jobsLoadState !== 'ready' ? (
            <div className="app-loading">
              <p role="status">
                {jobsLoadState === 'loading'
                  ? 'Loading your jobs…'
                  : 'Your jobs aren’t available yet.'}
              </p>
            </div>
          ) : (
            <AllJobsScreen
              jobs={[]}
              online={online}
              hideBack={true}
              onOpenJob={handleSelectJob}
              onJobAdded={handleJobAdded}
              onBack={() => {}}
            />
          )}
        </>
      )
    }

    if (view === 'bookHome') {
      return (
        <BookHomeScreen
          jobs={jobs}
          workshop={workshopData?.bookHome ?? null}
          onOpenAllJobs={() => setView('allJobs')}
          onOpenWorkshop={openWorkshop}
        />
      )
    }

    if (view === 'workshop') {
      return (
        <WorkshopScreen
          data={workshopData}
          loadState={workshopState}
          onBack={openBookHome}
          onReload={loadWorkshop}
          onOpenSourceItem={openWorkshopSource}
        />
      )
    }

    if (view === 'allJobs') {
      return (
        <AllJobsScreen
          jobs={jobs}
          online={online}
          onOpenJob={handleSelectJob}
          onJobAdded={handleJobAdded}
          onBack={() => setView('bookHome')}
        />
      )
    }

    if (!selectedJob) return null

    if (view === 'reviewQueue') {
      return (
        <ReviewQueueScreen
          job={selectedJob}
          onClose={() => setView('workspace')}
        />
      )
    }

    return (
      <CurrentJobWorkspace
        job={selectedJob}
        entry={jobEntry && jobEntry.jobId === selectedJob.id ? jobEntry : null}
        onOpenReviewQueue={() => setView('reviewQueue')}
        onOpenBookHome={openBookHome}
        onOpenWorkshop={openWorkshop}
        onLogout={handleLogout}
        user={currentUser}
        onJobUpdated={handleJobUpdated}
      />
    )
  }
}

export default function App() {
  return (
    <CaptureSyncProvider>
      <AppContent />
    </CaptureSyncProvider>
  )
}
