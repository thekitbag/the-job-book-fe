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
import HomeScreen from './HomeScreen'
import CaptureFlow from './CaptureFlow'
import UnfiledScreen from './UnfiledScreen'
import NewJobSheet from './NewJobSheet'
import { useLocalCaptures } from './useLocalCaptures'
import { useCaptureUpdates } from './captureEvents'
import type { CaptureHome } from './captureTypes'
import { getCaptureHome, getJob } from './api'
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
  const owner = getLocalOwnerId()
  if (owner) localStorage.removeItem('job-book-capture-home:' + owner)
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
// Cold launches start on Home; recording continues across screen changes.
type AppView =
  | 'workspace'
  | 'reviewQueue'
  | 'bookHome'
  | 'allJobs'
  | 'workshop'
  | 'unfiled'

function AppContent() {
  const capture = useCaptureContext()!
  const { setSyncEnabled } = capture
  const local = useLocalCaptures(),
    captureUpdate = useCaptureUpdates()
  const [home, setHome] = useState<CaptureHome | null>(null),
    [newJobOpen, setNewJobOpen] = useState(false)
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
  const [view, setView] = useState<AppView>('bookHome')
  const [online, setOnline] = useState(navigator.onLine)
  const [foregroundRevision, setForegroundRevision] = useState(0)
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
    const setOn = () => {
      setOnline(true)
      setForegroundRevision((v) => v + 1)
    }
    const foreground = () => {
      if (document.visibilityState === 'visible')
        setForegroundRevision((v) => v + 1)
    }
    const setOff = () => setOnline(false)
    document.addEventListener('visibilitychange', foreground)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    return () => {
      document.removeEventListener('visibilitychange', foreground)
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
    setHome(null)
    setView('bookHome')
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

  useEffect(() => {
    if (foregroundRevision && !hasResetToken && appState !== 'unauthenticated')
      loadJobs()
  }, [foregroundRevision, hasResetToken, appState, loadJobs])

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
          setView('bookHome')
          setHome(null)
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
    setHome(null)
    setView('bookHome')
    setCurrentUser(user)
    setAppState('noJobs')
    setSyncEnabled(true)
    setHasResetToken(false)
    loadJobs()
  }

  const onBookHome = view === 'bookHome'
  useEffect(() => {
    if (signedOut || hasResetToken) return
    let active = true
    const boundary = getCaptureSessionId(),
      owner = getLocalOwnerId(),
      key = owner ? 'job-book-capture-home:' + owner : null
    if (key && !home) {
      try {
        const cached = localStorage.getItem(key)
        if (cached) setHome(JSON.parse(cached) as CaptureHome)
      } catch {
        /* Cache is best effort. */
      }
    }
    void getCaptureHome()
      .then((fresh) => {
        if (!active || boundary !== getCaptureSessionId()) return
        setHome(fresh)
        if (key) localStorage.setItem(key, JSON.stringify(fresh))
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // Local sync and explicit decisions refresh Home independently of job loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    signedOut,
    hasResetToken,
    capture.revision,
    captureUpdate,
    currentUser?.id,
    foregroundRevision,
    // Counts change elsewhere (checks, Workshop); refresh on each return Home.
    onBookHome,
  ])

  async function openJobById(id: string, checks = false) {
    const boundary = getCaptureSessionId()
    try {
      const job = jobs.find((j) => j.id === id) ?? (await getJob(id))
      if (boundary !== getCaptureSessionId()) return
      handleSelectJob(job)
      if (checks) setView('reviewQueue')
    } catch {
      setErrorMsg('Could not open that job. Try again when there’s signal.')
    }
  }
  function registerJob(job: Job) {
    setJobs((previous) => {
      const next = [job, ...previous.filter((j) => j.id !== job.id)]
      localStorage.setItem(CACHED_JOBS_KEY, JSON.stringify(next))
      return next
    })
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
        allowIdle={false}
      />
      {capture.message && (
        <div className="capture-neutral" role="status">
          <p>{capture.message}</p>
          <button
            className="capture-link"
            type="button"
            onClick={() => capture.setMessage('')}
          >
            Dismiss
          </button>
        </div>
      )}
      {capture.photoError && (
        <p className="capture-neutral" role="alert">
          {capture.photoError}
        </p>
      )}
      {renderScreen()}
      <input
        id="capture-home-photo"
        type="file"
        accept="image/*"
        className="capture-hidden-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void capture.pickPhoto(file)
        }}
      />
      <CaptureFlow
        jobs={jobs}
        home={home}
        online={online}
        onJobAdded={registerJob}
        onOpenJob={(id) => {
          void openJobById(id)
        }}
        onOpenChecks={(id) => {
          void openJobById(id, true)
        }}
      />
      {newJobOpen && (
        <NewJobSheet
          online={online}
          onClose={() => setNewJobOpen(false)}
          onAdded={(job) => {
            registerJob(job)
            setNewJobOpen(false)
            handleSelectJob(job, 'created')
          }}
        />
      )}
    </>
  )

  function renderScreen() {
    if (view === 'bookHome' || (!selectedJob && view === 'workspace')) {
      const unfiledNotes = local.notes.filter((n) => n.jobId === null),
        unfiledPhotos = local.photos.filter((p) => p.jobId === null)
      const localUnfiled =
        unfiledNotes.filter((n) => !n.serverNoteId).length +
        unfiledPhotos.filter((p) => !p.serverPhotoId).length
      const localUploadedUnfiled =
        unfiledNotes.filter((n) => !!n.serverNoteId).length +
        unfiledPhotos.filter((p) => !!p.serverPhotoId).length
      return (
        <HomeScreen
          supported={capture.supported}
          permissionError={capture.recorder.permissionError}
          jobs={jobs}
          home={home}
          known={jobsLoadState === 'ready' || !!home}
          online={online}
          onRecord={() => {
            void capture.record({ jobId: null, title: null })
          }}
          recording={capture.recorder.state !== 'idle'}
          recordingTitle={capture.recordingTitle}
          onPhoto={() => document.getElementById('capture-home-photo')?.click()}
          onOpenJob={(id) => {
            void openJobById(id)
          }}
          onOpenAllJobs={() => setView('allJobs')}
          onNewJob={() => setNewJobOpen(true)}
          onOpenUnfiled={() => setView('unfiled')}
          onWorkshop={openWorkshop}
          onLogout={() => {
            void handleLogout()
          }}
          user={currentUser}
          localUnfiled={localUnfiled}
          localUploadedUnfiled={localUploadedUnfiled}
        />
      )
    }
    if (view === 'unfiled')
      return <UnfiledScreen onBack={() => setView('bookHome')} />

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
