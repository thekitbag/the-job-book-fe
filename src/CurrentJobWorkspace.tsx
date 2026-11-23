import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getReviewQueue,
  isAlreadyInWorkshop,
  moveLeftoverToWorkshop,
  patchJob,
  putBackWorkshopItem,
} from './api'
import { getNotesForJob, subscribeLocalCaptures } from './db'
import { getCaptureSessionId, subscribeLocalOwner } from './localOwner'
import RecordingControls from './RecordingControls'
import { CaptureSyncProvider, useCaptureContext } from './CaptureSyncProvider'
import { useCaptureUpdates } from './captureEvents'
import { useTranscriptPoll } from './useTranscriptPoll'
import { usePwaInstall } from './usePwaInstall'
import { useJobMemory } from './useJobMemory'
import JobLog from './JobLog'
import HoursTab from './HoursTab'
import MemorySectionTab from './MemorySectionTab'
import JobPhotosSection, {
  photoLinkTargetLabel,
  type PhotoLinkTarget,
} from './JobPhotosSection'
import BottomSheet from './BottomSheet'
import JobDetailsSheet from './JobDetailsSheet'
import { useToast } from './Toast'
import MoveToWorkshopResult from './MoveToWorkshopResult'
import type { WorkshopSourceControls } from './workshopSource'
import { track } from './analytics'
import { NORMAL_JOB_STATUSES, jobStatusLabel } from './jobStatus'
import type {
  AuthUser,
  EditableJobStatus,
  Job,
  HoursSummary,
  LocalNote,
  MemoryViewItem,
  WorkshopItem,
} from './types'

const EXPLAINER_KEY = 'job-book-explainer-seen'

const JOB_TYPE_LABELS: Record<string, string> = {
  garden_room: 'Garden room',
  extension: 'Extension',
  other: 'Other',
}

type Section = 'home' | 'hours' | 'materials' | 'joblog'
// Returned is a peer state, not something tucked inside Left over: material
// that went back to the merchant really left the job, and hiding it under the
// stock he still has would be a different (wrong) claim.
type MaterialsTab = 'bought' | 'used' | 'leftover' | 'returned'

export type JobEntry = {
  jobId: string
  focusItemId?: string
}

const SECTION_TITLES: Record<Exclude<Section, 'home'>, string> = {
  hours: 'Hours',
  materials: 'Materials',
  joblog: 'Job log',
}
function HomeSectionCards({
  hours,
  onOpen,
}: {
  hours: HoursSummary | null
  onOpen: (section: Exclude<Section, 'home'>) => void
}) {
  return (
    <nav className="ws-home-cards" aria-label="Job sections">
      {(
        [
          [
            'hours',
            'Hours',
            hours ? `${hours.totalHours}h logged` : 'None yet',
          ],
          ['materials', 'Materials', 'Bought · used · left · returned'],
          ['joblog', 'Job log', 'Notes · photos'],
        ] as const
      ).map(([section, title, detail]) => (
        <button
          key={section}
          type="button"
          className="ws-home-card"
          aria-label={`Open ${title}`}
          onClick={() => onOpen(section)}
        >
          <span className="ws-home-card-text">
            <span className="ws-home-card-title">{title}</span>
            <span className="ws-home-card-figures">
              <span
                className={
                  section === 'hours'
                    ? 'ws-home-card-value'
                    : 'ws-home-card-denom'
                }
              >
                {detail}
              </span>
            </span>
          </span>
          <span className="ws-home-card-chev" aria-hidden="true">
            ›
          </span>
        </button>
      ))}
    </nav>
  )
}

// ── Capture chrome ──────────────────────────────────────────────────────────

function StorageExplainer({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="explainer" role="region" aria-label="About your recordings">
      <p className="explainer-text">
        We save the recording during the pilot so we can check what was captured
        and improve the job memory.
      </p>
      <button className="explainer-dismiss" onClick={onDismiss}>
        Got it
      </button>
    </div>
  )
}

function InstallBanner({
  isIosSafari,
  onInstall,
  onDismiss,
}: {
  isIosSafari: boolean
  onInstall: () => void
  onDismiss: () => void
}) {
  return (
    <div className="install-banner" role="region" aria-label="Install app">
      {isIosSafari ? (
        <p className="install-banner-text">
          Add to your home screen: tap <strong>Share</strong> then{' '}
          <strong>Add to Home Screen</strong>
        </p>
      ) : (
        <p className="install-banner-text">
          Install The Job Book on your phone for quick access
        </p>
      )}
      <div className="install-banner-actions">
        {!isIosSafari && (
          <button className="install-banner-btn" onClick={onInstall}>
            Install
          </button>
        )}
        <button
          className="install-banner-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss install banner"
        >
          Not now
        </button>
      </div>
    </div>
  )
}

// Interstitial shown after a recording stops. Confirms the note is safe and
// reflects live progress (saving → saved → looking for facts) without making
// Mike wait — he can tap Done and carry on at any point.
function Workspace({
  job,
  entry = null,
  onOpenReviewQueue,
  onOpenBookHome,
  onOpenWorkshop = () => {},
  onLogout = () => {},
  user = null,
  onJobUpdated = () => {},
}: {
  job: Job
  // Set only when another screen sent Mike into this job at a specific place.
  entry?: JobEntry | null
  onOpenReviewQueue: () => void
  onOpenBookHome: () => void
  // "See in the Workshop", after a leftover has been moved there. Optional for
  // the same reason onLogout is: a test rendering one lens in isolation has no
  // book level to navigate to, and the result sheet's other two routes (Undo,
  // Done) work without it.
  onOpenWorkshop?: () => void
  onLogout?: () => void
  // Current account, when known — drives role-gated UI only. Normal builders
  // never see the internal Support entry.
  user?: AuthUser | null
  // Called with the updated Job after a successful edit (title rename) so the
  // app can refresh the job list and offline cache.
  onJobUpdated?: (job: Job) => void
}) {
  const [section, setSection] = useState<Section>('home')
  const [materialsTab, setMaterialsTab] = useState<MaterialsTab>('bought')
  // clientNoteId of the note just recorded — drives the capture confirmation.
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [showExplainer, setShowExplainer] = useState(
    () => localStorage.getItem(EXPLAINER_KEY) !== 'true',
  )
  // Open by default so a freshly recorded note confirms capture without hunting,
  // but it stays below the job summary — secondary, not a primary card.
  // Job title rename (PATCH /api/jobs/:jobId). Failure keeps the old title.
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  // Header overflow menu — Rename/Change status/Support/Log out live behind
  // "⋯" so the title row never has to compete with them for width at phone size.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  // Status editing (PATCH /api/jobs/:jobId) via the Change status bottom
  // sheet. Failure keeps the previous confirmed status visible and keeps the
  // sheet open with a retryable inline error. Archive gets an in-sheet
  // confirmation step before any request is sent.
  const [statusSheetOpen, setStatusSheetOpen] = useState(false)
  // Job details sheet — site address and job-local contacts, opened from the
  // header menu. Loaded on open only: contacts are reference context and must
  // never sit on the path that carries Record.
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [savingStatus, setSavingStatus] = useState<EditableJobStatus | null>(
    null,
  )
  const [statusError, setStatusError] = useState<string | null>(null)

  // Switching jobs always lands on the new job's home — never a section of
  // the previous job.
  useEffect(() => {
    setSection('home')
    setMaterialsTab('bought')
    // A details sheet left open would otherwise show the new job's contacts
    // under the old job's heading.
    setDetailsSheetOpen(false)
  }, [job.id])

  const mem = useJobMemory(job)
  const toast = useToast()
  const focusItemId =
    entry?.jobId === job.id ? (entry.focusItemId ?? null) : null
  const entryReady = !!mem.data
  useEffect(() => {
    if (!focusItemId || !entryReady) return
    setSection('materials')
    setMaterialsTab('leftover')
  }, [focusItemId, entryReady])
  const openSection = useCallback((s: Exclude<Section, 'home'>) => {
    track('job_section_opened', { section: s === 'hours' ? 'labour' : s })
    setSection(s)
  }, [])

  const [workshopPendingId, setWorkshopPendingId] = useState<string | null>(
    null,
  )
  const [moveResult, setMoveResult] = useState<WorkshopItem | null>(null)
  const memRefetch = mem.refetch

  const handleMoveToWorkshop = useCallback(
    async (item: MemoryViewItem) => {
      if (workshopPendingId) return
      setWorkshopPendingId(item.id)
      try {
        const res = await moveLeftoverToWorkshop(job.id, item.id)
        track('workshop_move_recorded', {
          job_id: job.id,
          job_status: job.status,
        })
        await memRefetch()
        setMoveResult(res.workshopItem)
      } catch (err: unknown) {
        // A second move of the same leftover is not really a failure from Mike's
        // side — the material is where he wanted it — so it is said plainly and
        // the row is refreshed to show the state he was evidently not seeing.
        if (isAlreadyInWorkshop(err)) {
          await memRefetch()
          toast({
            title: 'Already in the Workshop',
            body: 'This leftover is in there once already. Nothing changed.',
            tone: 'plain',
          })
        } else {
          toast({
            title: 'Could not move it',
            body: 'Nothing changed — it is still just a leftover on this job. Try again.',
            tone: 'plain',
          })
        }
      } finally {
        setWorkshopPendingId(null)
      }
    },
    [job.id, job.status, workshopPendingId, memRefetch, toast],
  )

  const handlePutBackInWorkshop = useCallback(
    async (item: MemoryViewItem) => {
      if (workshopPendingId || !item.workshopItemId) return
      setWorkshopPendingId(item.id)
      try {
        await putBackWorkshopItem(item.workshopItemId)
        track('workshop_put_back', { job_id: job.id })
        await memRefetch()
        toast({
          title: 'Back in the Workshop',
          body: 'The same item is available again, with the amount it had before.',
          tone: 'plain',
        })
      } catch {
        toast({
          title: 'Could not put it back',
          body: 'Nothing changed. Try again.',
          tone: 'plain',
        })
      } finally {
        setWorkshopPendingId(null)
      }
    },
    [job.id, workshopPendingId, memRefetch, toast],
  )

  const workshop = useMemo<WorkshopSourceControls>(
    () => ({
      onMoveToWorkshop: (item) => {
        void handleMoveToWorkshop(item)
      },
      onPutBackInWorkshop: (item) => {
        void handlePutBackInWorkshop(item)
      },
      pendingItemId: workshopPendingId,
    }),
    [handleMoveToWorkshop, handlePutBackInWorkshop, workshopPendingId],
  )

  const startRename = () => {
    setTitleDraft(job.title)
    setTitleError(null)
    setStatusSheetOpen(false)
    setRenaming(true)
  }
  const saveTitle = async () => {
    const title = titleDraft.trim()
    if (!title || title.length > 80 || savingTitle) return
    setSavingTitle(true)
    setTitleError(null)
    try {
      const updated = await patchJob(job.id, { title })
      onJobUpdated(updated)
      setRenaming(false)
    } catch {
      setTitleError('Could not rename — try again')
    } finally {
      setSavingTitle(false)
    }
  }

  // One entry point, reached from three places: the labelled control on the
  // job-home status line, the same control in every section header, and the
  // header menu item.
  const openDetailsSheet = useCallback(() => {
    setRenaming(false)
    setStatusSheetOpen(false)
    setHeaderMenuOpen(false)
    setDetailsSheetOpen(true)
  }, [])

  const openStatusSheet = () => {
    setStatusError(null)
    setConfirmingArchive(false)
    setRenaming(false)
    setStatusSheetOpen(true)
  }
  const closeStatusSheet = () => {
    setStatusSheetOpen(false)
    setConfirmingArchive(false)
    setStatusError(null)
  }
  const saveStatus = async (status: EditableJobStatus) => {
    if (savingStatus) return
    setSavingStatus(status)
    setStatusError(null)
    try {
      const updated = await patchJob(job.id, { status })
      if (status === 'archived') {
        track('job_archived', { job_id: job.id })
      } else {
        track('job_status_changed', {
          job_id: job.id,
          from_status: job.status,
          to_status: status,
        })
      }
      onJobUpdated(updated)
      closeStatusSheet()
    } catch {
      setStatusError('Could not update status — try again')
    } finally {
      setSavingStatus(null)
    }
  }
  const {
    showBanner,
    isIosSafari,
    triggerInstall,
    dismiss: dismissInstall,
  } = usePwaInstall()

  // Things to check — draft queue count. Loads independently; never blocks record.
  const [draftCount, setDraftCount] = useState(0)
  const [queueLoadState, setQueueLoadState] = useState<
    'loading' | 'ready' | 'error'
  >('loading')

  const activeJob = useRef(job.id)
  activeJob.current = job.id
  const refreshNotes = useCallback(async () => {
    const session = getCaptureSessionId()
    const fresh = await getNotesForJob(job.id)
    if (activeJob.current !== job.id || session !== getCaptureSessionId())
      return
    fresh.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    setNotes(fresh)
  }, [job.id])

  useEffect(() => {
    let current = true
    const refresh = () => {
      if (current) void refreshNotes().catch(() => {})
    }
    refresh()
    const unsubscribe = subscribeLocalCaptures(refresh)
    const unsubscribeOwner = subscribeLocalOwner(() => {
      setNotes([])
      refresh()
    })
    return () => {
      current = false
      unsubscribe()
      unsubscribeOwner()
    }
  }, [refreshNotes])

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

  const queueRequest = useRef(0)
  const loadQueue = useCallback(() => {
    const request = ++queueRequest.current
    setQueueLoadState('loading')
    getReviewQueue(job.id)
      .then((q) => {
        if (activeJob.current !== job.id || request !== queueRequest.current)
          return
        const count = q.sections
          .flatMap((s) => s.items)
          .filter((it) => it.status === 'draft').length
        setDraftCount(count)
        setQueueLoadState('ready')
      })
      .catch(() => {
        if (activeJob.current === job.id && request === queueRequest.current)
          setQueueLoadState('error')
      })
  }, [job.id])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  const [photoRevision, setPhotoRevision] = useState(0)
  const loadPhotos = useCallback(() => setPhotoRevision((v) => v + 1), [])

  const readyExtractionCount = notes.filter(
    (n) => n.localState === 'uploaded' && n.extractionStatus === 'ready',
  ).length

  const { recorder, record, recordingTitle } = useCaptureContext()!
  useTranscriptPoll(notes, job.id, refreshNotes)
  const updates = useCaptureUpdates()
  const refreshMemory = mem.refetch
  const previousCaptureUpdate = useRef({
    jobId: job.id,
    updates,
    count: readyExtractionCount,
  })
  useEffect(() => {
    const previous = previousCaptureUpdate.current
    previousCaptureUpdate.current = {
      jobId: job.id,
      updates,
      count: readyExtractionCount,
    }
    if (
      previous.jobId === job.id &&
      (previous.updates !== updates || previous.count !== readyExtractionCount)
    ) {
      void refreshMemory()
      loadQueue()
      loadPhotos()
    }
  }, [
    job.id,
    updates,
    readyExtractionCount,
    refreshMemory,
    loadQueue,
    loadPhotos,
  ])
  const handleRecord = useCallback(() => {
    void record({ jobId: job.id, title: job.title })
  }, [record, job.id, job.title])

  const dismissExplainer = useCallback(() => {
    localStorage.setItem(EXPLAINER_KEY, 'true')
    setShowExplainer(false)
  }, [])

  // Photo link targets: trusted memory items only — review-queue drafts are
  // never offered as link targets (v1 rule). Labels are the items' CURRENT
  // display identity (post-correction), not original extraction text.
  const logRefreshKey = useMemo(
    () => ({ memory: mem.data, photoRevision, notes }),
    [mem.data, photoRevision, notes],
  )
  const photoLinkTargets = useMemo<PhotoLinkTarget[]>(
    () =>
      (mem.data?.sections ?? []).flatMap((s) =>
        s.items.map((i) => ({ id: i.id, label: photoLinkTargetLabel(i) })),
      ),
    [mem.data],
  )

  const hasUrgent = queueLoadState === 'ready' && draftCount > 0
  const thingsCopy =
    draftCount === 1 ? '1 thing to check' : `${draftCount} things to check`

  function renderThingsToCheck() {
    if (hasUrgent) {
      return (
        <button
          type="button"
          className="ws-ttc ws-ttc--urgent"
          onClick={onOpenReviewQueue}
        >
          <span className="ws-ttc-dot" aria-hidden="true" />
          <span className="ws-ttc-label">{thingsCopy}</span>
          <span className="ws-ttc-action">Review ›</span>
        </button>
      )
    }
    // Nothing pending (or the queue failed to load): quiet omission, not a
    // "Nothing to check" block — only the transient loading state gets copy.
    if (queueLoadState === 'loading') {
      return <p className="ws-ttc-quiet">Still looking for useful job facts</p>
    }
    return null
  }

  // Memory-dependent tabs share one load/error gate so a memory-view failure
  // shows a recoverable state without collapsing the header or Record.
  function renderMemoryTab(content: ReactNode) {
    if (mem.loadState === 'error') {
      return (
        <div className="mem-error" role="alert">
          <p>{mem.errorMsg}</p>
          <button className="mem-retry" onClick={mem.reload}>
            Try again
          </button>
        </div>
      )
    }
    if (mem.loadState === 'loading' && !mem.data) {
      return <p className="mem-loading">Loading…</p>
    }
    return content
  }

  const banded = section === 'hours'

  return (
    <div className={`ws-page${banded ? ' ws-page--banded' : ''}`}>
      {headerMenuOpen && (
        <div
          className="mem-menu-scrim"
          onClick={() => {
            setHeaderMenuOpen(false)
          }}
          aria-hidden="true"
        />
      )}

      {section !== 'home' ? (
        // Section workspace header: back to job home + section title, with the
        // job title kept as context. No global tab strip anywhere.
        <header className="ws-header ws-header--section">
          <div className="ws-header-top">
            <button
              type="button"
              className="btn-switch-job"
              onClick={() => setSection('home')}
            >
              ‹ Job home
            </button>

            {!online && (
              <span className="offline-badge" aria-live="polite">
                No signal
              </span>
            )}
          </div>
          <div className="ws-header-titles">
            <h1 className="ws-job-title">{SECTION_TITLES[section]}</h1>
            <p className="ws-job-location">{job.title}</p>
          </div>
        </header>
      ) : (
        <header className="ws-header">
          <div className="ws-header-top">
            {/* The route up to the book level is named after where it goes. "Switch
              job" described a picker; this is the cover of the book, and Mike
              gets there the same way from every job. */}
            <button
              type="button"
              className="btn-switch-job"
              onClick={onOpenBookHome}
            >
              ‹ The Job Book
            </button>
            <div className="ws-header-top-right">
              {!online && (
                <span className="offline-badge" aria-live="polite">
                  No signal
                </span>
              )}
              <div className="ws-header-menu-wrap">
                <button
                  type="button"
                  className="btn-header-menu"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={headerMenuOpen}
                  onClick={() => setHeaderMenuOpen((o) => !o)}
                >
                  ⋯
                </button>
                {headerMenuOpen && (
                  <div className="ws-header-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setHeaderMenuOpen(false)
                        startRename()
                      }}
                    >
                      Rename job
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={openDetailsSheet}
                    >
                      Job details
                    </button>
                    {user?.role === 'INTERNAL' && (
                      <a
                        role="menuitem"
                        href="/internal/support"
                        onClick={() => setHeaderMenuOpen(false)}
                      >
                        Support
                      </a>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="ws-header-menu-danger"
                      onClick={() => {
                        setHeaderMenuOpen(false)
                        onLogout()
                      }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="ws-header-titles">
            {renaming ? (
              <form
                className="ws-rename-form"
                aria-label="Rename job"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveTitle()
                }}
              >
                <input
                  className="ws-rename-input"
                  name="jobTitle"
                  aria-label="Job title"
                  value={titleDraft}
                  maxLength={80}
                  onChange={(e) => setTitleDraft(e.target.value)}
                />
                <div className="ws-rename-actions">
                  <button
                    type="submit"
                    className="btn-queue-save"
                    disabled={savingTitle || titleDraft.trim() === ''}
                  >
                    {savingTitle ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn-queue-cancel"
                    onClick={() => {
                      setRenaming(false)
                      setTitleError(null)
                    }}
                    disabled={savingTitle}
                  >
                    Cancel
                  </button>
                </div>
                {titleError && (
                  <p className="queue-item-error" role="alert">
                    {titleError}
                  </p>
                )}
              </form>
            ) : (
              <>
                <h1 className="ws-job-title">{job.title}</h1>
                {job.roughLocationOrLabel && (
                  <p className="ws-job-location">{job.roughLocationOrLabel}</p>
                )}
                {!job.roughLocationOrLabel &&
                  job.jobType &&
                  job.jobType !== 'other' &&
                  JOB_TYPE_LABELS[job.jobType] && (
                    <p className="ws-job-location">
                      {JOB_TYPE_LABELS[job.jobType]}
                    </p>
                  )}
                <div className="ws-status-block">
                  <span className="ws-status-label">Status</span>
                  <button
                    type="button"
                    className={`ws-status-chip ws-status-chip--${job.status}`}
                    onClick={openStatusSheet}
                    aria-haspopup="dialog"
                    aria-label={`Change job status, current status ${jobStatusLabel(job.status)}`}
                  >
                    {jobStatusLabel(job.status)}
                    <span className="ws-status-chip-chev" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {/* Named, on the status line: site address and phone numbers
                    are things Mike goes looking for, and an unlabelled "⋯" is
                    not somewhere anyone looks for a phone number. The menu
                    item stays, but it is no longer the only way in. */}
                  <button
                    type="button"
                    className="btn-job-details"
                    onClick={openDetailsSheet}
                  >
                    Job details
                    <span className="btn-job-details-chev" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {statusSheetOpen && (
        <BottomSheet title="Change status" onClose={closeStatusSheet}>
          {confirmingArchive ? (
            // Deliberate archive step: archiving is a status update, not a
            // delete, but it removes the job from the normal Switch list — so
            // it never fires from a single tap.
            <div className="status-sheet-confirm">
              <p className="status-sheet-confirm-copy">
                Archive “{job.title}”? It will be removed from your normal job
                list. Its data is kept — nothing is deleted, and it stays
                visible to Support.
              </p>
              <div className="status-sheet-confirm-actions">
                <button
                  type="button"
                  className="status-sheet-confirm-archive"
                  disabled={savingStatus !== null}
                  onClick={() => saveStatus('archived')}
                >
                  {savingStatus === 'archived' ? 'Archiving…' : 'Archive job'}
                </button>
                <button
                  type="button"
                  className="status-sheet-confirm-cancel"
                  disabled={savingStatus !== null}
                  onClick={() => setConfirmingArchive(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="status-sheet-options">
              {NORMAL_JOB_STATUSES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`status-sheet-opt status-sheet-opt--${opt.value}${job.status === opt.value ? ' status-sheet-opt--current' : ''}`}
                  disabled={savingStatus !== null}
                  aria-pressed={job.status === opt.value}
                  onClick={() => saveStatus(opt.value)}
                >
                  <span className="status-sheet-dot" aria-hidden="true" />
                  <span className="status-sheet-opt-label">
                    {savingStatus === opt.value ? 'Saving…' : opt.label}
                  </span>
                  {job.status === opt.value && (
                    <span className="status-sheet-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              ))}
              <div className="status-sheet-divider" role="presentation" />
              <button
                type="button"
                className="status-sheet-archive"
                disabled={savingStatus !== null}
                onClick={() => setConfirmingArchive(true)}
              >
                Archive job…
              </button>
            </div>
          )}
          {statusError && (
            <p className="queue-item-error" role="alert">
              {statusError}
            </p>
          )}
        </BottomSheet>
      )}

      {detailsSheetOpen && (
        <JobDetailsSheet
          jobId={job.id}
          jobTitle={job.title}
          onClose={() => setDetailsSheetOpen(false)}
        />
      )}

      {/* The move result. It replaces the item drawer rather than stacking on
          it, and both ways out of it — into the Workshop, or straight back out
          of the move — are one tap. */}
      {moveResult && (
        <MoveToWorkshopResult
          workshopItem={moveResult}
          onSeeInWorkshop={() => {
            setMoveResult(null)
            onOpenWorkshop()
          }}
          onUndone={() => {
            setMoveResult(null)
            void mem.refetch()
          }}
          onClose={() => setMoveResult(null)}
        />
      )}

      <div className="ws-body">
        {/* App-level notices belong on job home only. They are about recording
            and installing, neither of which a section screen is for — and the
            Spend screen in particular is specified as hero + rows and nothing
            else, with its header and hero running together as one ink band. */}
        {section === 'home' && showBanner && (
          <InstallBanner
            isIosSafari={isIosSafari}
            onInstall={triggerInstall}
            onDismiss={dismissInstall}
          />
        )}
        {section === 'home' && showExplainer && (
          <StorageExplainer onDismiss={dismissExplainer} />
        )}

        {section === 'home' && (
          <div className="ws-overview">
            {renderThingsToCheck()}

            {/* Section cards are the navigation — they render even while the
                memory view is loading or failed. The error block above them
                offers the retry; the cards just show quieter context. */}
            {mem.loadState === 'error' ? (
              <div className="mem-error" role="alert">
                <p>Couldn’t load job details.</p>
                <button className="mem-retry" onClick={mem.reload}>
                  Try again
                </button>
              </div>
            ) : mem.loadState === 'loading' && !mem.data ? (
              <p className="mem-loading">Loading…</p>
            ) : null}

            <HomeSectionCards
              hours={mem.data?.hours ?? null}
              onOpen={openSection}
            />
          </div>
        )}

        {section === 'hours' && renderMemoryTab(<HoursTab mem={mem} />)}

        {section === 'materials' && (
          <>
            <div
              className="ws-tabs ws-tabs--inner"
              role="tablist"
              aria-label="Materials views"
            >
              {(
                [
                  ['bought', 'Bought'],
                  ['used', 'Used'],
                  ['leftover', 'Left over'],
                  ['returned', 'Returned'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={materialsTab === key}
                  className={`ws-tab${materialsTab === key ? ' ws-tab--active' : ''}`}
                  onClick={() => setMaterialsTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {renderMemoryTab(
              materialsTab === 'bought' ? (
                <MemorySectionTab
                  mem={mem}
                  sectionKeys={['ordered_materials']}
                  ariaLabel="Bought materials"
                  sectionAdds={{
                    ordered_materials: {
                      kind: 'bought',
                      label: 'Add bought item',
                    },
                  }}
                  focusItemId={focusItemId}
                />
              ) : materialsTab === 'used' ? (
                <MemorySectionTab
                  mem={mem}
                  sectionKeys={['used_materials']}
                  ariaLabel="Used materials"
                  sectionAdds={{
                    used_materials: { kind: 'used', label: 'Add used item' },
                  }}
                />
              ) : materialsTab === 'leftover' ? (
                <MemorySectionTab
                  mem={mem}
                  sectionKeys={['leftovers']}
                  ariaLabel="Left over materials"
                  sectionAdds={{
                    leftovers: { kind: 'leftover', label: 'Add leftover' },
                  }}
                  focusItemId={focusItemId}
                  workshop={workshop}
                />
              ) : (
                // Deliberately no direct add: a return starts from the Left over
                // item it came out of, so the quantity leaves Left over in the
                // same move. A standalone "add returned item" would let the two
                // states disagree about the same material.
                <MemorySectionTab
                  mem={mem}
                  sectionKeys={['returned_materials']}
                  ariaLabel="Returned materials"
                  emptyText="Nothing returned yet. Take something back to the merchant? Mark it as returned from Left over."
                />
              ),
            )}
          </>
        )}

        {section === 'joblog' && (
          <JobLog
            refreshKey={logRefreshKey}
            jobId={job.id}
            onAddNote={mem.addMemoryItem}
            onEditNote={mem.cardProps}
            photos={
              <JobPhotosSection
                jobId={job.id}
                linkTargets={photoLinkTargets}
                onPhotosChanged={loadPhotos}
              />
            }
          />
        )}
      </div>

      {/* Pinned Record — available on every tab, never blocked by summary loads. */}
      <RecordingControls
        recorder={recorder}
        onRecord={handleRecord}
        jobTitle={recorder.state === 'idle' ? job.title : recordingTitle}
      />
    </div>
  )
}

// An isolated workspace is also a complete capture root (component tests and
// previews). The real app supplies this provider above every screen.
export default function CurrentJobWorkspace(
  props: React.ComponentProps<typeof Workspace>,
) {
  const capture = useCaptureContext()
  return capture ? (
    <Workspace {...props} />
  ) : (
    <CaptureSyncProvider>
      <Workspace {...props} />
    </CaptureSyncProvider>
  )
}
