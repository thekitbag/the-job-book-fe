import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getDraftFacts, getJobPhotos, getReviewQueue, patchJob, resolveApiUrl } from './api'
import { saveNote, getNotesForJob } from './db'
import { useRecorder, isRecordingSupported } from './useRecorder'
import { useSync } from './useSync'
import { useTranscriptPoll } from './useTranscriptPoll'
import { usePwaInstall } from './usePwaInstall'
import { useJobMemory } from './useJobMemory'
import { deriveLatestActivity, formatMoney, mergeLatestActivityWithPhotos } from './memoryScan'
import SpendTab from './SpendTab'
import LabourTab from './LabourTab'
import MemorySectionTab from './MemorySectionTab'
import JobPhotosSection, { photoLinkTargetLabel, type PhotoLinkTarget } from './JobPhotosSection'
import SourceHistory, { formatDuration, formatSavedStamp } from './SourceHistory'
import BottomSheet from './BottomSheet'
import { durationBucket, mimeTypeFamily, track } from './analytics'
import { NORMAL_JOB_STATUSES, jobStatusLabel } from './jobStatus'
import type { AuthUser, CandidateFact, EditableJobStatus, Job, JobPhoto, LabourHoursSummary, LatestActivityItem, LatestActivityType, LocalNote, TotalKnownCost } from './types'

const MAX_DURATION_MS = 3 * 60 * 1000
const EXPLAINER_KEY = 'job-book-explainer-seen'

const JOB_TYPE_LABELS: Record<string, string> = {
  garden_room: 'Garden room',
  extension: 'Extension',
  other: 'Other',
}

const NOTES_SECTION_KEYS = ['general_notes', 'supplier_delivery_notes', 'customer_changes', 'watch_outs']

// Stable section navigation: home is the root of the current-job workspace,
// not a tab. The four sections are stable workspaces — future Payments becomes
// a fifth card here, and Variations becomes a Job log filter, without another
// cramped top-level tab strip.
type Section = 'home' | 'spend' | 'labour' | 'materials' | 'joblog'
type MaterialsTab = 'bought' | 'used' | 'leftover'
type JobLogFilter = 'all' | 'notes' | 'photos' | 'receipts'

const SECTION_TITLES: Record<Exclude<Section, 'home'>, string> = {
  spend: 'Spend',
  labour: 'Labour',
  materials: 'Materials',
  joblog: 'Job log',
}

// Where a latest-activity row's underlying detail lives. Section-level
// navigation (with the right inner tab/filter preselected) is the v1 minimum;
// item-level highlight is a follow-up.
const ACTIVITY_DEST: Record<LatestActivityType, { section: Exclude<Section, 'home'>; materialsTab?: MaterialsTab; joblogFilter?: JobLogFilter }> = {
  bought: { section: 'spend' },
  used: { section: 'materials', materialsTab: 'used' },
  labour: { section: 'labour' },
  note: { section: 'joblog', joblogFilter: 'notes' },
  photo: { section: 'joblog', joblogFilter: 'photos' },
}

// ── Job home: stable section cards ───────────────────────────────────────────
// Spend/Labour carry live context (known spend vs budget, hours logged); the
// other two describe what lives inside. Cards render even while memory is
// loading or failed — navigation must never disappear with the data.

function HomeSectionCards({ total, budgetAmount, labourHours, onOpen }: {
  total: TotalKnownCost | null
  budgetAmount: string | null
  labourHours: LabourHoursSummary | null
  onOpen: (section: Exclude<Section, 'home'>) => void
}) {
  const known = total?.knownSpendAmount ? parseFloat(total.knownSpendAmount) : 0
  const budget = budgetAmount ? parseFloat(budgetAmount) : null
  const hasBudget = budget !== null && budget > 0
  const hasHours = labourHours?.totalHours != null

  const spendContext = total?.knownSpendAmount
    ? `${formatMoney(known, total.knownSpendCurrency)}${hasBudget ? ` of ${formatMoney(budget!, 'GBP')}` : ''}`
    : 'None yet'
  const labourContext = hasHours ? `${labourHours!.totalHours}h logged` : 'None yet'

  const cards: { section: Exclude<Section, 'home'>; icon: string; title: string; context: string }[] = [
    { section: 'spend', icon: '£', title: 'Spend', context: spendContext },
    { section: 'labour', icon: '⏱', title: 'Labour', context: labourContext },
    { section: 'materials', icon: '🧰', title: 'Materials', context: 'Bought · used · left over' },
    { section: 'joblog', icon: '📓', title: 'Job log', context: 'Notes · photos · receipts' },
  ]

  return (
    <nav className="ws-home-cards" aria-label="Job sections">
      {cards.map(c => (
        <button
          key={c.section}
          type="button"
          className="ws-home-card"
          aria-label={`Open ${c.title}`}
          onClick={() => onOpen(c.section)}
        >
          <span className="ws-home-card-icon" aria-hidden="true">{c.icon}</span>
          <span className="ws-home-card-text">
            <span className="ws-home-card-title">{c.title}</span>
            <span className="ws-home-card-context">{c.context}</span>
          </span>
          <span className="ws-home-card-chev" aria-hidden="true">›</span>
        </button>
      ))}
    </nav>
  )
}

// ── Job log: Receipts filter ─────────────────────────────────────────────────
// A receipt is a photo linked to a bought (ordered material) item — an explicit
// evidence link the user made, never inferred from descriptors or file
// contents. No link, no receipt.

function isReceiptPhoto(p: JobPhoto): boolean {
  return p.linkedMemoryItem?.memoryType === 'ordered_material'
}

function ReceiptsFilter({ photos }: { photos: JobPhoto[] }) {
  const receipts = photos.filter(isReceiptPhoto)
  if (receipts.length === 0) {
    return (
      <div className="ws-receipts-empty">
        <p className="empty-title">No receipts yet</p>
        <p className="empty-hint">Photos linked to a bought item show up here as receipts. Add a photo in Job log and link it to the spend it proves.</p>
      </div>
    )
  }
  return (
    <ul className="ws-receipts-list">
      {receipts.map(p => (
        <li key={p.id} className="ws-receipt-row">
          <img className="ws-receipt-thumb" src={resolveApiUrl(p.imageUrl)} alt={p.descriptor ?? 'Receipt photo'} />
          <span className="ws-receipt-text">
            <span className="ws-receipt-headline">{p.descriptor ?? 'Receipt photo'}</span>
            {p.linkedMemoryItem && <span className="ws-receipt-link">Proof for: {p.linkedMemoryItem.summary}</span>}
            <span className="ws-receipt-time">{formatSavedStamp(p.uploadedAt)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function LatestActivity({ items, onOpenItem }: { items: LatestActivityItem[]; onOpenItem: (item: LatestActivityItem) => void }) {
  if (items.length === 0) return null
  return (
    <section className="ws-latest" aria-label="Latest on this job">
      <h2 className="mem-section-heading">Latest on this job</h2>
      <ul className="ws-latest-card">
        {items.map(item => (
          <li key={item.memoryItemId}>
            <button
              type="button"
              className="ws-latest-row"
              onClick={() => onOpenItem(item)}
              aria-label={`${item.typeLabel}: ${item.headline}`}
            >
              <span className="ws-latest-top">
                <span className={`ws-type-chip ws-type-chip--${item.type}`}>{item.typeLabel}</span>
                <span className="ws-latest-headline">{item.headline}</span>
                {item.costLabel && <span className="ws-latest-right">{item.costLabel}</span>}
              </span>
              <span className="ws-latest-time">{formatSavedStamp(item.effectiveAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Capture chrome ──────────────────────────────────────────────────────────

function StorageExplainer({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="explainer" role="region" aria-label="About your recordings">
      <p className="explainer-text">
        We save the recording during the pilot so we can check what was captured and improve the job memory.
      </p>
      <button className="explainer-dismiss" onClick={onDismiss}>Got it</button>
    </div>
  )
}

function InstallBanner({ isIosSafari, onInstall, onDismiss }: {
  isIosSafari: boolean
  onInstall: () => void
  onDismiss: () => void
}) {
  return (
    <div className="install-banner" role="region" aria-label="Install app">
      {isIosSafari ? (
        <p className="install-banner-text">
          Add to your home screen: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>
        </p>
      ) : (
        <p className="install-banner-text">Install The Job Book on your phone for quick access</p>
      )}
      <div className="install-banner-actions">
        {!isIosSafari && (
          <button className="install-banner-btn" onClick={onInstall}>Install</button>
        )}
        <button className="install-banner-dismiss" onClick={onDismiss} aria-label="Dismiss install banner">
          Not now
        </button>
      </div>
    </div>
  )
}

// Interstitial shown after a recording stops. Confirms the note is safe and
// reflects live progress (saving → saved → looking for facts) without making
// Mike wait — he can tap Done and carry on at any point.
function CaptureConfirmation({
  note,
  online,
  onClose,
  onOpenReviewQueue,
}: {
  note: LocalNote | undefined
  online: boolean
  onClose: () => void
  onOpenReviewQueue: () => void
}) {
  const state = note?.localState
  const uploaded = state === 'uploaded'
  const failedSend = state === 'upload_failed' || state === 'upload_needs_attention'
  const stillSending = !uploaded && !failedSend // saved_local / uploading

  let title = 'Voice note saved'
  let sub = "I'll pull out anything useful for this job."
  let ready = false

  if (stillSending) {
    if (!online) {
      title = 'Saved on this phone'
      sub = "I'll send it through when there's signal."
    } else {
      title = 'Saving your note…'
      sub = 'Keeping it safe on your phone too.'
    }
  } else if (failedSend) {
    title = 'Saved on this phone'
    sub = "Couldn't send it yet — I'll keep trying automatically."
  } else if (note?.transcriptStatus === 'failed') {
    sub = "Couldn't make out this recording, but it's safe."
  } else if (note?.extractionStatus === 'ready') {
    sub = 'Job facts are ready to check.'
    ready = true
  } else if (note?.extractionStatus === 'failed') {
    sub = "Saved — I couldn't pull job facts from this one."
  } else if (uploaded) {
    sub = 'Looking for useful job facts…'
  }

  // Spinner only while the note is actively being sent; a saved note (locally or
  // uploaded) shows a reassuring tick even while facts are still being found.
  const spinner = title === 'Saving your note…'

  return (
    // Scrim click-to-dismiss is a pointer convenience duplicating the visible
    // Done/close button, which stays keyboard-reachable; the inner card's
    // onClick only stops propagation. TODO(a11y follow-up): add an Escape-key
    // handler and focus trap for this dialog.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div className="ws-capture-scrim" role="dialog" aria-modal="true" aria-label="Recording saved" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="ws-capture-card" onClick={e => e.stopPropagation()}>
        <div className="ws-capture-icon" aria-hidden="true">
          {spinner
            ? <span className="ws-capture-spinner" />
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
        </div>
        <p className="ws-capture-title" aria-live="polite">{title}</p>
        <p className="ws-capture-sub" aria-live="polite">{sub}</p>
        <div className="ws-capture-actions">
          {ready && (
            <button type="button" className="ws-capture-review" onClick={onOpenReviewQueue}>
              See things to check
            </button>
          )}
          <button type="button" className="ws-capture-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

export default function CurrentJobWorkspace({
  job,
  onOpenReviewQueue,
  onSwitchJob,
  onLogout = () => {},
  user = null,
  onJobUpdated = () => {},
}: {
  job: Job
  onOpenReviewQueue: () => void
  onSwitchJob: () => void
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
  const [joblogFilter, setJoblogFilter] = useState<JobLogFilter>('all')
  // clientNoteId of the note just recorded — drives the capture confirmation.
  const [justCapturedId, setJustCapturedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [showExplainer, setShowExplainer] = useState(
    () => localStorage.getItem(EXPLAINER_KEY) !== 'true',
  )
  // Open by default so a freshly recorded note confirms capture without hunting,
  // but it stays below the job summary — secondary, not a primary card.
  const [showSourceHistory, setShowSourceHistory] = useState(true)
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
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [savingStatus, setSavingStatus] = useState<EditableJobStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Switching jobs always lands on the new job's home — never a section of
  // the previous job.
  useEffect(() => {
    setSection('home')
    setMaterialsTab('bought')
    setJoblogFilter('all')
  }, [job.id])

  const openSection = useCallback((s: Exclude<Section, 'home'>) => {
    track('job_section_opened', { section: s })
    setSection(s)
  }, [])

  const openActivityItem = useCallback((item: LatestActivityItem) => {
    const dest = ACTIVITY_DEST[item.type]
    if (dest.materialsTab) setMaterialsTab(dest.materialsTab)
    if (dest.joblogFilter) setJoblogFilter(dest.joblogFilter)
    openSection(dest.section)
  }, [openSection])

  const startRename = () => { setTitleDraft(job.title); setTitleError(null); setStatusSheetOpen(false); setRenaming(true) }
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

  const openStatusSheet = () => { setStatusError(null); setConfirmingArchive(false); setRenaming(false); setStatusSheetOpen(true) }
  const closeStatusSheet = () => { setStatusSheetOpen(false); setConfirmingArchive(false); setStatusError(null) }
  const saveStatus = async (status: EditableJobStatus) => {
    if (savingStatus) return
    setSavingStatus(status)
    setStatusError(null)
    try {
      const updated = await patchJob(job.id, { status })
      if (status === 'archived') {
        track('job_archived', { job_id: job.id })
      } else {
        track('job_status_changed', { job_id: job.id, from_status: job.status, to_status: status })
      }
      onJobUpdated(updated)
      closeStatusSheet()
    } catch {
      setStatusError('Could not update status — try again')
    } finally {
      setSavingStatus(null)
    }
  }
  const { showBanner, isIosSafari, triggerInstall, dismiss: dismissInstall } = usePwaInstall()

  const [facts, setFacts] = useState<CandidateFact[]>([])
  const [factsLoadFailed, setFactsLoadFailed] = useState(false)

  // Things to check — draft queue count. Loads independently; never blocks record.
  const [draftCount, setDraftCount] = useState(0)
  const [queueLoadState, setQueueLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  const mem = useJobMemory(job)

  const refreshNotes = useCallback(async () => {
    const fresh = await getNotesForJob(job.id)
    fresh.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    setNotes(fresh)
  }, [job.id])

  useEffect(() => { refreshNotes() }, [refreshNotes])

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

  const loadQueue = useCallback(() => {
    setQueueLoadState('loading')
    getReviewQueue(job.id)
      .then(q => {
        const count = q.sections.flatMap(s => s.items).filter(it => it.status === 'draft').length
        setDraftCount(count)
        setQueueLoadState('ready')
      })
      .catch(() => setQueueLoadState('error'))
  }, [job.id])

  useEffect(() => { loadQueue() }, [loadQueue])

  // Latest activity's photo rows — loaded independently of JobPhotosSection's
  // own Notes-tab fetch. Failure quietly omits photos rather than blocking
  // Overview or Record. Stale-job guarded like JobPhotosSection; re-run after
  // JobPhotosSection reports a change (e.g. a new upload) so Overview reflects it.
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const currentJobIdRef = useRef(job.id)
  currentJobIdRef.current = job.id

  const loadPhotos = useCallback(() => {
    const requestedJobId = job.id
    getJobPhotos(requestedJobId)
      .then(res => { if (currentJobIdRef.current === requestedJobId) setPhotos(res.photos) })
      .catch(() => { if (currentJobIdRef.current === requestedJobId) setPhotos([]) })
  }, [job.id])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  const readyExtractionCount = notes.filter(
    n => n.localState === 'uploaded' && n.extractionStatus === 'ready',
  ).length

  const fetchFacts = useCallback(() => {
    getDraftFacts(job.id)
      .then(data => { setFacts(data); setFactsLoadFailed(false) })
      .catch(() => setFactsLoadFailed(true))
  }, [job.id])

  useEffect(() => {
    if (readyExtractionCount === 0) return
    fetchFacts()
  }, [readyExtractionCount, fetchFacts])

  const { syncAll, retryNote } = useSync(refreshNotes)
  const { refreshNow: refreshStatus } = useTranscriptPoll(notes, job.id, refreshNotes)
  const recorder = useRecorder()

  const handleRefresh = useCallback(() => {
    refreshStatus()
    if (readyExtractionCount > 0) fetchFacts()
  }, [refreshStatus, readyExtractionCount, fetchFacts])

  const handleRecord = useCallback(async () => {
    const started = await recorder.start(async (result) => {
      track('record_completed', {
        job_id: job.id,
        duration_bucket: durationBucket(result.durationMs),
        mime_type_family: mimeTypeFamily(result.mimeType),
      })
      const clientNoteId = crypto.randomUUID()
      const note: LocalNote = {
        clientNoteId,
        jobId: job.id,
        capturedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        mimeType: result.mimeType,
        blob: result.blob,
        sizeBytes: result.blob.size,
        localState: 'saved_local',
        uploadAttemptCount: 0,
        lastUploadAttemptAt: null,
        serverNoteId: null,
        lastErrorCode: null,
        transcriptStatus: null,
        transcriptText: null,
        transcriptErrorCode: null,
        extractionStatus: null,
      }
      await saveNote(note)
      await refreshNotes()
      setJustCapturedId(clientNoteId)
      syncAll()
      loadQueue()
    })
    // The UI has no cancel affordance mid-recording; the only way a tapped
    // Record produces no note is a failed start (mic permission denied).
    if (started) track('record_started', { job_id: job.id })
    else track('record_cancelled', { job_id: job.id, error_kind: 'PERMISSION_DENIED' })
  }, [recorder, job.id, refreshNotes, syncAll, loadQueue])

  const dismissExplainer = useCallback(() => {
    localStorage.setItem(EXPLAINER_KEY, 'true')
    setShowExplainer(false)
  }, [])

  const latest = useMemo(
    () => mergeLatestActivityWithPhotos(deriveLatestActivity(mem.data?.sections ?? [], 20), photos),
    [mem.data, photos],
  )

  // Job log "All": every note-type memory item and photo, merged newest-first.
  // Bought/used/labour stay in their own sections — the log is the narrative
  // record (notes, photos, receipts), not a duplicate of the money lenses.
  const jobLogItems = useMemo(
    () => mergeLatestActivityWithPhotos(deriveLatestActivity(mem.data?.sections ?? [], 500), photos, 500)
      .filter(i => i.type === 'note' || i.type === 'photo'),
    [mem.data, photos],
  )

  // Photo link targets: trusted memory items only — review-queue drafts are
  // never offered as link targets (v1 rule). Labels are the items' CURRENT
  // display identity (post-correction), not original extraction text.
  const photoLinkTargets = useMemo<PhotoLinkTarget[]>(
    () => (mem.data?.sections ?? []).flatMap(s => s.items.map(i => ({ id: i.id, label: photoLinkTargetLabel(i) }))),
    [mem.data],
  )

  const hasUrgent = queueLoadState === 'ready' && draftCount > 0
  const thingsCopy = draftCount === 1 ? '1 thing to check' : `${draftCount} things to check`

  function renderThingsToCheck() {
    if (hasUrgent) {
      return (
        <button type="button" className="ws-ttc ws-ttc--urgent" onClick={onOpenReviewQueue}>
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
          <button className="mem-retry" onClick={mem.reload}>Try again</button>
        </div>
      )
    }
    if (mem.loadState === 'loading' && !mem.data) {
      return <p className="mem-loading">Loading…</p>
    }
    return content
  }

  return (
    <div className="ws-page">
      {(mem.openMenuCatId || headerMenuOpen) && (
        <div
          className="mem-menu-scrim"
          onClick={() => { mem.setOpenMenuCatId(null); setHeaderMenuOpen(false) }}
          aria-hidden="true"
        />
      )}

      {section !== 'home' ? (
        // Section workspace header: back to job home + section title, with the
        // job title kept as context. No global tab strip anywhere.
        <header className="ws-header ws-header--section">
          <div className="ws-header-top">
            <button type="button" className="btn-switch-job" onClick={() => setSection('home')}>‹ Job home</button>
            <div className="ws-header-top-right">
              {!online && <span className="offline-badge" aria-live="polite">No signal</span>}
            </div>
          </div>
          <div className="ws-header-titles">
            <h1 className="ws-job-title">{SECTION_TITLES[section]}</h1>
            <p className="ws-job-location">{job.title}</p>
          </div>
        </header>
      ) : (
      <header className="ws-header">
        <div className="ws-header-top">
          <button type="button" className="btn-switch-job" onClick={onSwitchJob}>‹ Switch job</button>
          <div className="ws-header-top-right">
            {!online && <span className="offline-badge" aria-live="polite">No signal</span>}
            <div className="ws-header-menu-wrap">
              <button
                type="button"
                className="btn-header-menu"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={headerMenuOpen}
                onClick={() => setHeaderMenuOpen(o => !o)}
              >⋯</button>
              {headerMenuOpen && (
                <div className="ws-header-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setHeaderMenuOpen(false); startRename() }}>Rename job</button>
                  {user?.role === 'INTERNAL' && (
                    <a role="menuitem" href="/internal/support" onClick={() => setHeaderMenuOpen(false)}>Support</a>
                  )}
                  <button type="button" role="menuitem" className="ws-header-menu-danger" onClick={() => { setHeaderMenuOpen(false); onLogout() }}>Log out</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="ws-header-titles">
          {renaming ? (
            <form className="ws-rename-form" aria-label="Rename job" onSubmit={e => { e.preventDefault(); void saveTitle() }}>
              <input
                className="ws-rename-input"
                name="jobTitle"
                aria-label="Job title"
                value={titleDraft}
                maxLength={80}
                onChange={e => setTitleDraft(e.target.value)}
              />
              <div className="ws-rename-actions">
                <button type="submit" className="btn-queue-save" disabled={savingTitle || titleDraft.trim() === ''}>
                  {savingTitle ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn-queue-cancel" onClick={() => { setRenaming(false); setTitleError(null) }} disabled={savingTitle}>
                  Cancel
                </button>
              </div>
              {titleError && <p className="queue-item-error" role="alert">{titleError}</p>}
            </form>
          ) : (
            <>
              <h1 className="ws-job-title">{job.title}</h1>
              {job.roughLocationOrLabel && <p className="ws-job-location">{job.roughLocationOrLabel}</p>}
              {!job.roughLocationOrLabel && job.jobType && job.jobType !== 'other' && JOB_TYPE_LABELS[job.jobType] && (
                <p className="ws-job-location">{JOB_TYPE_LABELS[job.jobType]}</p>
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
                  <span className="ws-status-chip-chev" aria-hidden="true">▾</span>
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
                Archive “{job.title}”? It will be removed from your normal job list.
                Its data is kept — nothing is deleted, and it stays visible to Support.
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
              {NORMAL_JOB_STATUSES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`status-sheet-opt status-sheet-opt--${opt.value}${job.status === opt.value ? ' status-sheet-opt--current' : ''}`}
                  disabled={savingStatus !== null}
                  aria-pressed={job.status === opt.value}
                  onClick={() => saveStatus(opt.value)}
                >
                  <span className="status-sheet-dot" aria-hidden="true" />
                  <span className="status-sheet-opt-label">{savingStatus === opt.value ? 'Saving…' : opt.label}</span>
                  {job.status === opt.value && <span className="status-sheet-check" aria-hidden="true">✓</span>}
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
          {statusError && <p className="queue-item-error" role="alert">{statusError}</p>}
        </BottomSheet>
      )}

      <div className="ws-body">
        {showBanner && (
          <InstallBanner isIosSafari={isIosSafari} onInstall={triggerInstall} onDismiss={dismissInstall} />
        )}
        {showExplainer && <StorageExplainer onDismiss={dismissExplainer} />}

        {section === 'home' && (
          <div className="ws-overview">
            {renderThingsToCheck()}

            {/* Section cards are the navigation — they render even while the
                memory view is loading or failed. The error block above them
                offers the retry; the cards just show quieter context. */}
            {mem.loadState === 'error' ? (
              <div className="mem-error" role="alert">
                <p>Couldn’t load job details.</p>
                <button className="mem-retry" onClick={mem.reload}>Try again</button>
              </div>
            ) : mem.loadState === 'loading' && !mem.data ? (
              <p className="mem-loading">Loading…</p>
            ) : null}

            <HomeSectionCards
              total={mem.totalKnownCost}
              budgetAmount={mem.budgetSummary?.totals.budgetAmount ?? null}
              labourHours={mem.labourHours}
              onOpen={openSection}
            />

            <LatestActivity items={latest} onOpenItem={openActivityItem} />

            <SourceHistory
              notes={notes}
              online={online}
              onRetry={retryNote}
              facts={facts}
              factsLoadFailed={factsLoadFailed}
              onRefresh={handleRefresh}
              open={showSourceHistory}
              onToggle={() => setShowSourceHistory(h => !h)}
            />
          </div>
        )}

        {section === 'spend' && renderMemoryTab(<SpendTab mem={mem} />)}
        {section === 'labour' && renderMemoryTab(<LabourTab mem={mem} />)}

        {section === 'materials' && (
          <>
            <div className="ws-tabs ws-tabs--inner" role="tablist" aria-label="Materials views">
              {([['bought', 'Bought'], ['used', 'Used'], ['leftover', 'Left over']] as const).map(([key, label]) => (
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
                  sectionAdds={{ ordered_materials: { kind: 'spend', label: 'Add bought item' } }}
                />
              ) : materialsTab === 'used' ? (
                <MemorySectionTab
                  mem={mem}
                  sectionKeys={['used_materials']}
                  ariaLabel="Used materials"
                  sectionAdds={{ used_materials: { kind: 'used', label: 'Add used item' } }}
                />
              ) : (
                <MemorySectionTab
                  mem={mem}
                  sectionKeys={['leftovers']}
                  ariaLabel="Left over materials"
                  sectionAdds={{ leftovers: { kind: 'leftover', label: 'Add leftover' } }}
                />
              ),
            )}
          </>
        )}

        {section === 'joblog' && (
          <>
            <div className="ws-tabs ws-tabs--inner" role="tablist" aria-label="Job log filters">
              {([['all', 'All'], ['notes', 'Notes'], ['photos', 'Photos'], ['receipts', 'Receipts']] as const).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={joblogFilter === key}
                  className={`ws-tab${joblogFilter === key ? ' ws-tab--active' : ''}`}
                  onClick={() => setJoblogFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {joblogFilter === 'all' && renderMemoryTab(
              jobLogItems.length === 0 ? (
                <p className="mem-tab-empty">Nothing in the job log yet. Notes and photos land here.</p>
              ) : (
                <ul className="ws-latest-card ws-joblog-feed" aria-label="Job log">
                  {jobLogItems.map(item => (
                    <li key={item.memoryItemId}>
                      <button
                        type="button"
                        className="ws-latest-row"
                        onClick={() => setJoblogFilter(item.type === 'photo' ? 'photos' : 'notes')}
                        aria-label={`${item.typeLabel}: ${item.headline}`}
                      >
                        <span className="ws-latest-top">
                          <span className={`ws-type-chip ws-type-chip--${item.type}`}>{item.typeLabel}</span>
                          <span className="ws-latest-headline">{item.headline}</span>
                        </span>
                        <span className="ws-latest-time">{formatSavedStamp(item.effectiveAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ),
            )}
            {joblogFilter === 'notes' && renderMemoryTab(
              <MemorySectionTab
                mem={mem}
                sectionKeys={NOTES_SECTION_KEYS}
                ariaLabel="Notes"
                directAdd={{ kind: 'note', label: 'Add note', sectionLabel: 'Notes' }}
              />,
            )}
            {joblogFilter === 'photos' && (
              <JobPhotosSection jobId={job.id} linkTargets={photoLinkTargets} onPhotosChanged={loadPhotos} />
            )}
            {joblogFilter === 'receipts' && <ReceiptsFilter photos={photos} />}
          </>
        )}
      </div>

      {/* Pinned Record — available on every tab, never blocked by summary loads. */}
      <div className="ws-record-bar">
        {!isRecordingSupported ? (
          <p className="ws-record-unsupported">
            {!window.isSecureContext
              ? 'Open this page over https:// to enable the microphone.'
              : 'Recording is not supported in this browser. Try Chrome or Safari.'}
          </p>
        ) : recorder.state === 'idle' ? (
          <button className="ws-record-btn" onClick={handleRecord} aria-label="Start recording">
            <span className="ws-record-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
              </svg>
            </span>
            <span className="ws-record-text">
              <span className="ws-record-title">Record</span>
              <span className="ws-record-sub">Tap · say it · done</span>
            </span>
          </button>
        ) : (
          <div className="ws-recording-active">
            <span className="ws-rec-dot" aria-hidden="true" />
            <span className="ws-rec-elapsed" aria-live="polite" aria-atomic="true">
              {formatDuration(recorder.elapsedMs)}
              <span className="ws-rec-max"> / {formatDuration(MAX_DURATION_MS)}</span>
            </span>
            <button
              className="ws-stop-btn"
              onClick={recorder.stop}
              disabled={recorder.state === 'stopping'}
              aria-label="Stop recording"
            >
              {recorder.state === 'stopping' ? 'Saving…' : 'Stop'}
            </button>
          </div>
        )}
        {recorder.permissionError && (
          <p className="permission-error">
            Microphone access denied. Check your browser settings and try again.
          </p>
        )}
      </div>

      {justCapturedId && (
        <CaptureConfirmation
          note={notes.find(n => n.clientNoteId === justCapturedId)}
          online={online}
          onClose={() => setJustCapturedId(null)}
          onOpenReviewQueue={() => { setJustCapturedId(null); onOpenReviewQueue() }}
        />
      )}
    </div>
  )
}
