import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getDraftFacts, getReviewQueue } from './api'
import { saveNote, getNotesForJob } from './db'
import { useRecorder, isRecordingSupported } from './useRecorder'
import { useSync } from './useSync'
import { useTranscriptPoll } from './useTranscriptPoll'
import { usePwaInstall } from './usePwaInstall'
import { useJobMemory } from './useJobMemory'
import { deriveLabourToday, deriveLatestActivity, formatMoney } from './memoryScan'
import SpendTab from './SpendTab'
import LabourTab from './LabourTab'
import MemorySectionTab from './MemorySectionTab'
import SourceHistory, { formatDuration } from './SourceHistory'
import type { CandidateFact, Job, LabourTodaySummary, LatestActivityItem, LocalNote, TotalKnownCost } from './types'

const MAX_DURATION_MS = 3 * 60 * 1000
const EXPLAINER_KEY = 'job-book-explainer-seen'

const JOB_TYPE_LABELS: Record<string, string> = {
  garden_room: 'Garden room',
  extension: 'Extension',
  other: 'Other',
}

const USED_SECTION_KEYS = ['used_materials', 'leftovers']
const NOTES_SECTION_KEYS = ['supplier_delivery_notes', 'customer_changes', 'watch_outs']

type Tab = 'overview' | 'spend' | 'labour' | 'used' | 'notes'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'spend', label: 'Spend' },
  { key: 'labour', label: 'Labour' },
  { key: 'used', label: 'Used' },
  { key: 'notes', label: 'Notes' },
]

function relativeAge(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((now - then) / 86_400_000)
  return days <= 0 ? 'today' : `${days}d`
}

// ── Overview cards ──────────────────────────────────────────────────────────

function KnownSpendCard({ total, budgetAmount, onOpen }: {
  total: TotalKnownCost | null
  budgetAmount: string | null
  onOpen: () => void
}) {
  const known = total?.knownSpendAmount ? parseFloat(total.knownSpendAmount) : 0
  const budget = budgetAmount ? parseFloat(budgetAmount) : null
  const hasBudget = budget !== null && budget > 0
  const pct = hasBudget ? Math.min(100, Math.round((known / budget!) * 100)) : 0
  return (
    <button type="button" className="ws-card ws-card--spend" onClick={onOpen} aria-label="Known spend — open Spend">
      <span className="ws-card-cap">Known spend</span>
      <span className="ws-card-amount">{total?.knownSpendAmount ? formatMoney(known, total.knownSpendCurrency) : 'None yet'}</span>
      {hasBudget && <span className="ws-card-bar"><span style={{ width: `${pct}%` }} /></span>}
      <span className="ws-card-sub">
        {hasBudget ? `of ${formatMoney(budget!, 'GBP')} · ` : 'No budget yet · '}Spend ›
      </span>
    </button>
  )
}

function LabourTodayCard({ summary, onOpen }: { summary: LabourTodaySummary; onOpen: () => void }) {
  const people = summary.perPerson.map(p => `${p.person} ${p.hours}`).join(' · ')
  return (
    <button type="button" className="ws-card ws-card--labour" onClick={onOpen} aria-label="Labour today — open Labour">
      <span className="ws-card-cap">Labour today</span>
      <span className="ws-card-amount">{summary.hasHours ? `${summary.totalHours}h` : 'None yet'}</span>
      <span className="ws-card-sub">{people ? `${people} · ` : ''}Labour ›</span>
    </button>
  )
}

function LatestActivity({ items }: { items: LatestActivityItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="ws-latest" aria-label="Latest on this job">
      <p className="ws-latest-heading">Latest on this job</p>
      <ul className="ws-latest-list">
        {items.map(item => (
          <li key={item.memoryItemId} className="ws-latest-row">
            <span className={`ws-type-chip ws-type-chip--${item.type}`}>{item.typeLabel}</span>
            <span className="ws-latest-headline">{item.headline}</span>
            <span className="ws-latest-right">{item.costLabel ?? relativeAge(item.effectiveAt)}</span>
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
    <div className="ws-capture-scrim" role="dialog" aria-modal="true" aria-label="Recording saved" onClick={onClose}>
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
}: {
  job: Job
  onOpenReviewQueue: () => void
  onSwitchJob: () => void
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

  const labourToday = useMemo(
    () => deriveLabourToday(mem.data?.sections ?? []),
    [mem.data],
  )
  const latest = useMemo(
    () => deriveLatestActivity(mem.data?.sections ?? []),
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
    const quiet = queueLoadState === 'loading'
      ? 'Still looking for useful job facts'
      : 'Nothing to check'
    return <p className="ws-ttc-quiet">{quiet}</p>
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
      {mem.openMenuCatId && (
        <div className="mem-menu-scrim" onClick={() => mem.setOpenMenuCatId(null)} aria-hidden="true" />
      )}

      <header className="ws-header">
        <div className="ws-header-titles">
          <h1 className="ws-job-title">{job.title}</h1>
          {job.roughLocationOrLabel && <p className="ws-job-location">{job.roughLocationOrLabel}</p>}
          {!job.roughLocationOrLabel && job.jobType && job.jobType !== 'other' && JOB_TYPE_LABELS[job.jobType] && (
            <p className="ws-job-location">{JOB_TYPE_LABELS[job.jobType]}</p>
          )}
        </div>
        <div className="ws-header-actions">
          {!online && <span className="offline-badge" aria-live="polite">No signal</span>}
          <button className="btn-switch-job" onClick={onSwitchJob}>Switch ›</button>
        </div>
      </header>

      <nav className="ws-tabs" role="tablist" aria-label="Job lenses">
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
      </nav>

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
                <div className="ws-overview-cards">
                  <KnownSpendCard
                    total={mem.totalKnownCost}
                    budgetAmount={mem.budgetSummary?.totals.budgetAmount ?? null}
                    onOpen={() => setTab('spend')}
                  />
                  <LabourTodayCard summary={labourToday} onOpen={() => setTab('labour')} />
                </div>
                <LatestActivity items={latest} />
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
          <MemorySectionTab mem={mem} sectionKeys={USED_SECTION_KEYS} ariaLabel="Used and left over" />,
        )}
        {tab === 'notes' && renderMemoryTab(
          <MemorySectionTab mem={mem} sectionKeys={NOTES_SECTION_KEYS} ariaLabel="Notes" />,
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
              <span className="ws-record-sub">Pinned on every tab</span>
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
