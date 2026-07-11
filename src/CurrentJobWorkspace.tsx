import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getDraftFacts, getJobPhotos, getReviewQueue, patchJob } from './api'
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
import { EDITABLE_JOB_STATUSES, jobStatusLabel } from './jobStatus'
import type { AuthUser, CandidateFact, EditableJobStatus, Job, JobPhoto, LabourHoursSummary, LatestActivityItem, LatestActivityType, LocalNote, TotalKnownCost } from './types'

const MAX_DURATION_MS = 3 * 60 * 1000
const EXPLAINER_KEY = 'job-book-explainer-seen'

const JOB_TYPE_LABELS: Record<string, string> = {
  garden_room: 'Garden room',
  extension: 'Extension',
  other: 'Other',
}

const USED_SECTION_KEYS = ['used_materials', 'leftovers']
const NOTES_SECTION_KEYS = ['general_notes', 'supplier_delivery_notes', 'customer_changes', 'watch_outs']

type Tab = 'overview' | 'spend' | 'labour' | 'used' | 'notes'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'spend', label: 'Spend' },
  { key: 'labour', label: 'Labour' },
  { key: 'used', label: 'Used' },
  { key: 'notes', label: 'Notes' },
]

// Where a latest-activity row's underlying detail lives. Tab-level navigation
// is the v1 minimum (spec allows this); item-level reveal is a follow-up.
const ACTIVITY_TAB: Record<LatestActivityType, Tab> = {
  bought: 'spend',
  used: 'used',
  labour: 'labour',
  note: 'notes',
  photo: 'notes',
}

// ── Overview: Job so far ─────────────────────────────────────────────────────
// One consolidated card, row-per-signal — not a grid of separate stat cards.

function JobSoFar({ total, budgetAmount, labourHours, onOpenSpend, onOpenLabour }: {
  total: TotalKnownCost | null
  budgetAmount: string | null
  labourHours: LabourHoursSummary | null
  onOpenSpend: () => void
  onOpenLabour: () => void
}) {
  const known = total?.knownSpendAmount ? parseFloat(total.knownSpendAmount) : 0
  const budget = budgetAmount ? parseFloat(budgetAmount) : null
  const hasBudget = budget !== null && budget > 0
  const pct = hasBudget ? Math.min(100, Math.round((known / budget!) * 100)) : 0
  const hasHours = labourHours?.totalHours != null

  return (
    <section className="ws-jsf" aria-label="Job so far">
      <h2 className="mem-section-heading">Job so far</h2>
      <div className="ws-jsf-card">
        <button type="button" className="ws-jsf-row" onClick={onOpenSpend} aria-label="Known spend — open Spend">
          <span className="ws-jsf-row-top">
            <span className="ws-jsf-label">Known spend</span>
            <span className="ws-jsf-value">
              {total?.knownSpendAmount ? formatMoney(known, total.knownSpendCurrency) : 'None yet'}
              {hasBudget && <span className="ws-jsf-value-of"> of {formatMoney(budget!, 'GBP')}</span>}
            </span>
          </span>
          {hasBudget && <span className="ws-card-bar"><span style={{ width: `${pct}%` }} /></span>}
        </button>
        <div className="ws-jsf-divider" />
        <button type="button" className="ws-jsf-row" onClick={onOpenLabour} aria-label="Labour hours — open Labour">
          <span className="ws-jsf-row-top">
            <span className="ws-jsf-label">Labour hours</span>
            <span className="ws-jsf-value">{hasHours ? `${labourHours!.totalHours}h` : 'None yet'}</span>
          </span>
        </button>
      </div>
    </section>
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
  const [tab, setTab] = useState<Tab>('overview')
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
  // Status editing (PATCH /api/jobs/:jobId). Failure keeps the previous
  // confirmed status visible with a retryable inline error.
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus] = useState<EditableJobStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const startRename = () => { setTitleDraft(job.title); setTitleError(null); setEditingStatus(false); setRenaming(true) }
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

  const startEditStatus = () => { setStatusError(null); setRenaming(false); setEditingStatus(true) }
  const saveStatus = async (status: EditableJobStatus) => {
    if (savingStatus) return
    setSavingStatus(status)
    setStatusError(null)
    try {
      const updated = await patchJob(job.id, { status })
      onJobUpdated(updated)
      setEditingStatus(false)
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
    await recorder.start(async (result) => {
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
  }, [recorder, job.id, refreshNotes, syncAll, loadQueue])

  const dismissExplainer = useCallback(() => {
    localStorage.setItem(EXPLAINER_KEY, 'true')
    setShowExplainer(false)
  }, [])

  const latest = useMemo(
    () => mergeLatestActivityWithPhotos(deriveLatestActivity(mem.data?.sections ?? [], 20), photos),
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
              {editingStatus ? (
                <div className="ws-status-edit" role="group" aria-label="Change status">
                  {EDITABLE_JOB_STATUSES.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`ws-status-edit-opt${job.status === opt.value ? ' ws-status-edit-opt--current' : ''}${opt.value === 'archived' ? ' ws-status-edit-opt--archive' : ''}`}
                      disabled={savingStatus !== null}
                      aria-pressed={job.status === opt.value}
                      onClick={() => {
                        // Archiving removes the job from the normal list — it's
                        // an archive action, not a delete, but still needs
                        // explicit confirmation before applying.
                        if (opt.value === 'archived' && !window.confirm(
                          `Archive "${job.title}"? It will be removed from your normal job list. Its data is kept and it stays visible to Support.`,
                        )) return
                        saveStatus(opt.value)
                      }}
                    >
                      {savingStatus === opt.value ? 'Saving…' : opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ws-status-edit-cancel"
                    disabled={savingStatus !== null}
                    onClick={() => { setEditingStatus(false); setStatusError(null) }}
                  >
                    Cancel
                  </button>
                  {statusError && <p className="queue-item-error" role="alert">{statusError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  className={`ws-status-chip ws-status-chip--${job.status}`}
                  onClick={startEditStatus}
                  aria-label={`Status: ${jobStatusLabel(job.status)} — change status`}
                >
                  {jobStatusLabel(job.status)}
                  <span className="ws-status-chip-chev" aria-hidden="true">▾</span>
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* div, not nav: a tablist role must not override the nav landmark's
          implicit navigation role (jsx-a11y/no-noninteractive-element-to-interactive-role) */}
      <div className="ws-tabs" role="tablist" aria-label="Job lenses">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`ws-tab${tab === t.key ? ' ws-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ws-body">
        {showBanner && (
          <InstallBanner isIosSafari={isIosSafari} onInstall={triggerInstall} onDismiss={dismissInstall} />
        )}
        {showExplainer && <StorageExplainer onDismiss={dismissExplainer} />}

        {tab === 'overview' && (
          <div className="ws-overview" role="tabpanel" aria-label="Overview">
            {renderThingsToCheck()}

            {mem.loadState === 'error' ? (
              <div className="mem-error" role="alert">
                <p>Couldn’t load job details.</p>
                <button className="mem-retry" onClick={mem.reload}>Try again</button>
              </div>
            ) : mem.loadState === 'loading' && !mem.data ? (
              <p className="mem-loading">Loading…</p>
            ) : (
              <>
                <JobSoFar
                  total={mem.totalKnownCost}
                  budgetAmount={mem.budgetSummary?.totals.budgetAmount ?? null}
                  labourHours={mem.labourHours}
                  onOpenSpend={() => setTab('spend')}
                  onOpenLabour={() => setTab('labour')}
                />
                <LatestActivity items={latest} onOpenItem={item => setTab(ACTIVITY_TAB[item.type])} />
              </>
            )}

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

        {tab === 'spend' && renderMemoryTab(<SpendTab mem={mem} />)}
        {tab === 'labour' && renderMemoryTab(<LabourTab mem={mem} />)}
        {tab === 'used' && renderMemoryTab(
          <MemorySectionTab
            mem={mem}
            sectionKeys={USED_SECTION_KEYS}
            ariaLabel="Used and left over"
            sectionAdds={{
              used_materials: { kind: 'used', label: 'Add used item' },
              leftovers: { kind: 'leftover', label: 'Add leftover' },
            }}
          />,
        )}
        {tab === 'notes' && renderMemoryTab(
          <MemorySectionTab
            mem={mem}
            sectionKeys={NOTES_SECTION_KEYS}
            ariaLabel="Notes"
            directAdd={{ kind: 'note', label: 'Add note', sectionLabel: 'Notes' }}
            footer={<JobPhotosSection jobId={job.id} linkTargets={photoLinkTargets} onPhotosChanged={loadPhotos} />}
          />,
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
