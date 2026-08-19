import { useCallback, useEffect, useState } from 'react'
import { getBookMoney, getCurrentUser, getJobs, getWorkshop, logout, onUnauthorized, ApiError } from './api'
import { identifyAnalyticsUser, resetAnalyticsUser, track } from './analytics'
import CurrentJobWorkspace from './CurrentJobWorkspace'
import AuthScreen, { getResetToken } from './AuthScreen'
import ReviewQueueScreen from './ReviewQueueScreen'
import BookHomeScreen from './BookHomeScreen'
import BookMoneyScreen from './BookMoneyScreen'
import AllJobsScreen from './AllJobsScreen'
import WorkshopScreen from './WorkshopScreen'
import type { AuthUser, BookMoneyResponse, Job, WorkshopResponse } from './types'
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
// The app still launches into the last selected Job Home. Book Home is the
// level above it, reached from a job — never the default screen.
type AppView = 'workspace' | 'reviewQueue' | 'bookHome' | 'allJobs' | 'bookMoney' | 'workshop'

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
  // Cross-job Money (GET /api/book/money) — one response behind both the Book
  // Home row and the Money page, loaded at the book level rather than per job.
  // A failure only costs the Money row: the jobs index never depends on it.
  const [bookMoney, setBookMoney] = useState<BookMoneyResponse | null>(null)
  const [bookMoneyState, setBookMoneyState] = useState<'loading' | 'ready' | 'error'>('loading')
  // Cross-job Workshop (GET /api/workshop) — one response behind both the Book
  // Home row and the Workshop page, for the same reason Money has one: the
  // count on the cover and the list inside it must be the same read. Loaded at
  // the book level, and a failure only costs the Workshop row.
  const [workshopData, setWorkshopData] = useState<WorkshopResponse | null>(null)
  const [workshopState, setWorkshopState] = useState<'loading' | 'ready' | 'error'>('loading')
  // Settling a supplier account is gated by backend config while real-account
  // validation is outstanding. Enablement is the backend's statement, never a
  // guess from this build's environment, and the frontend fails closed: only an
  // explicit capability of true offers the controls, so a backend too old to
  // send the field shows no settlement UI rather than a button that cannot work.
  // The latch below is the second line — the gate can be switched off between
  // the read and the write — and holds for the session so Mike is never offered
  // the same unavailable action twice.
  const [settlementUnavailable, setSettlementUnavailable] = useState(false)
  // Where a job should open when something outside it sent Mike there — a
  // supplier line (Budget, that item) or an owed row (that job's Money).
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

  // Cross-job Money. Fetched when the book level is opened rather than kept
  // permanently fresh: it is a summary of facts corrected inside jobs, so every
  // arrival at Book Home or Money re-reads it and a correction made moments ago
  // is already reflected.
  const loadBookMoney = useCallback(() => {
    setBookMoneyState(prev => (prev === 'ready' ? 'ready' : 'loading'))
    getBookMoney()
      .then(res => { setBookMoney(res); setBookMoneyState('ready') })
      .catch(() => setBookMoneyState('error'))
  }, [])

  // Workshop is availability memory changed from two places — the Workshop page
  // itself and any job's leftover — so it is re-read on every arrival at the
  // book level rather than cached. A leftover moved in a moment ago is already
  // on the cover by the time Mike gets back to it.
  const loadWorkshop = useCallback(() => {
    setWorkshopState(prev => (prev === 'ready' ? 'ready' : 'loading'))
    getWorkshop()
      .then(res => { setWorkshopData(res); setWorkshopState('ready') })
      .catch(() => setWorkshopState('error'))
  }, [])

  const openBookHome = useCallback(() => {
    loadBookMoney()
    loadWorkshop()
    setView('bookHome')
  }, [loadBookMoney, loadWorkshop])

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

  // Opening a job from Book Home or All Jobs is what makes it the recording
  // destination — and the only thing that does. Moving up to the book level
  // and back down again leaves the selection exactly where it was, and a
  // recording already in flight keeps the job id it captured at start.
  //
  // `cause` keeps job_switched meaning a deliberate switch: selecting the job
  // that was just created is part of job_created, not a switch.
  function handleSelectJob(job: Job, cause: 'switch' | 'created' = 'switch', entry: JobEntry | null = null) {
    if (cause === 'switch' && selectedJob && selectedJob.id !== job.id) {
      track('job_switched', { job_id: job.id })
    }
    // Opening a job plainly lands on its home; only an explicit entry (from a
    // Money row) says otherwise, and it never outlives this one navigation.
    setJobEntry(entry)
    setSelectedJob(job)
    localStorage.setItem(SELECTED_JOB_ID_KEY, job.id)
    setView('workspace')
  }

  // Cross-job Money hands Mike back to the job that owns the fact: a supplier
  // or missing-price line to the source item in Budget, an owed row to that
  // job's Money. The job must be one of his current jobs — Money never shows
  // rows from anywhere else, so a miss here means the jobs list is stale, and
  // staying put is better than opening the wrong job.
  function openSourceItem(target: { jobId: string; sourceMemoryItemId: string }) {
    const job = jobs.find(j => j.id === target.jobId)
    if (!job) return
    track('book_money_source_opened', { job_id: job.id })
    // Which lens shows this item is the job's call, not Money's — see JobEntry.
    handleSelectJob(job, 'switch', { jobId: job.id, focusItemId: target.sourceMemoryItemId })
  }

  // Workshop hands Mike back to the job the material came from, at the leftover
  // itself. Same rule as Money's source routing: the job must be one of his
  // current jobs, and if it isn't, staying put beats opening the wrong job.
  function openWorkshopSource(target: { jobId: string; sourceMemoryItemId: string | null }) {
    const job = jobs.find(j => j.id === target.jobId)
    if (!job) return
    handleSelectJob(job, 'switch', {
      jobId: job.id,
      focusItemId: target.sourceMemoryItemId ?? undefined,
    })
  }

  function openJobMoney(jobId: string) {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    track('book_money_owed_opened', { job_id: job.id })
    handleSelectJob(job, 'switch', { jobId: job.id, section: 'money' })
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
      {/* An empty book still opens on All Jobs rather than a special
          first-run screen: it already carries the one route that matters
          (New job), and it is the same page Mike will use ever after. */}
      <AllJobsScreen
        jobs={[]}
        online={online}
        hideBack={true}
        onOpenJob={handleSelectJob}
        onJobAdded={handleJobAdded}
        onBack={() => {}}
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

  if (view === 'bookHome') {
    return (
      <BookHomeScreen
        jobs={jobs}
        money={bookMoney?.bookHome ?? null}
        workshop={workshopData?.bookHome ?? null}
        onOpenAllJobs={() => setView('allJobs')}
        onOpenMoney={() => { track('book_money_opened'); loadBookMoney(); setView('bookMoney') }}
        onOpenWorkshop={openWorkshop}
      />
    )
  }

  if (view === 'bookMoney') {
    return (
      <BookMoneyScreen
        data={bookMoney}
        loadState={bookMoneyState}
        onBack={() => setView('bookHome')}
        onReload={loadBookMoney}
        settlementAvailable={bookMoney?.capabilities?.supplierAccountSettlement === true && !settlementUnavailable}
        onSettlementUnavailable={() => setSettlementUnavailable(true)}
        onOpenSource={openSourceItem}
        onOpenJobMoney={openJobMoney}
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

  if (view === 'reviewQueue') {
    return <ReviewQueueScreen job={selectedJob} onClose={() => setView('workspace')} />
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
