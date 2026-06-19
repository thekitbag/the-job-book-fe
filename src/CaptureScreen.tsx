import { useCallback, useEffect, useState } from 'react'
import { saveNote, getNotesForJob } from './db'
import { getDraftFacts, getReviewQueue } from './api'
import { useRecorder, isRecordingSupported } from './useRecorder'
import { useSync } from './useSync'
import { useTranscriptPoll } from './useTranscriptPoll'
import { usePwaInstall } from './usePwaInstall'
import type { CandidateFact, Job, LocalNote } from './types'

const MAX_DURATION_MS = 3 * 60 * 1000
const EXPLAINER_KEY = 'job-book-explainer-seen'

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function NoteStateLabel({ note, online }: { note: LocalNote; online: boolean }) {
  switch (note.localState) {
    case 'saved_local':
      return online
        ? <span className="note-state note-state--local">Saved on phone</span>
        : <span className="note-state note-state--offline">Saved on this phone</span>
    case 'uploading':
      return <span className="note-state note-state--uploading">Saving…</span>
    case 'uploaded':
      return <span className="note-state note-state--saved">Voice note saved</span>
    case 'upload_failed':
      return <span className="note-state note-state--failed">Will retry</span>
    case 'upload_needs_attention':
      return <span className="note-state note-state--attention">Needs attention</span>
  }
}

function TranscriptSection({ note }: { note: LocalNote }) {
  const [open, setOpen] = useState(false)
  const { transcriptStatus, transcriptText } = note
  if (transcriptStatus === 'ready' && transcriptText) {
    return (
      <div className="transcript-section">
        <button
          type="button"
          className="transcript-toggle"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {open ? 'Hide transcript' : 'Show transcript'}
        </button>
        {open && <p className="transcript-text">{transcriptText}</p>}
      </div>
    )
  }
  if (transcriptStatus === 'failed') {
    return <p className="transcript-failed">Transcription failed — recording is still saved</p>
  }
  if (transcriptStatus === 'transcribing') {
    return <p className="transcript-pending">Transcribing…</p>
  }
  return <p className="transcript-pending">Waiting for transcript</p>
}

function FactCard({ fact }: { fact: CandidateFact }) {
  const isUnclear = fact.factType === 'unclear' || fact.status === 'unclear'
  let badge: 'unclear' | 'low' | 'medium' | null = null
  if (isUnclear) {
    badge = 'unclear'
  } else if (fact.confidenceLabel === 'low') {
    badge = 'low'
  } else if (fact.confidenceLabel === 'medium' || fact.uncertaintyFlags.length > 0) {
    badge = 'medium'
  }
  return (
    <div className={`fact-card fact-card--${fact.confidenceLabel}`}>
      <p className="fact-summary">{fact.summary}</p>
      <div className="fact-meta">
        {badge === 'unclear' && <span className="fact-badge fact-badge--unclear">Unclear</span>}
        {badge === 'low' && <span className="fact-badge fact-badge--low">Low confidence</span>}
        {badge === 'medium' && <span className="fact-badge fact-badge--medium">Needs checking</span>}
        <span className="fact-source">From what the system heard</span>
      </div>
    </div>
  )
}

function DraftFactsSection({
  note,
  facts,
  factsLoadFailed,
}: {
  note: LocalNote
  facts: CandidateFact[]
  factsLoadFailed: boolean
}) {
  if (note.transcriptStatus !== 'ready') return null

  if (note.extractionStatus === 'failed') {
    return (
      <p className="extraction-failed">
        Could not extract draft facts — recording and transcript are still saved
      </p>
    )
  }

  if (note.extractionStatus !== 'ready') {
    return <p className="extraction-pending">Looking for job facts…</p>
  }

  if (factsLoadFailed) {
    return <p className="extraction-failed">Could not load facts — try refreshing</p>
  }

  const noteFacts = facts.filter(f => f.sourceNoteIds.includes(note.serverNoteId!))

  return (
    <div className="draft-facts-section">
      <p className="draft-facts-label">Draft facts</p>
      {noteFacts.length === 0 ? (
        <p className="draft-facts-empty">No facts found in this note</p>
      ) : (
        <ul className="fact-list">
          {noteFacts.map(fact => (
            <li key={fact.id}>
              <FactCard fact={fact} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NoteCard({
  note,
  online,
  onRetry,
  facts,
  factsLoadFailed,
}: {
  note: LocalNote
  online: boolean
  onRetry: (id: string) => void
  facts: CandidateFact[]
  factsLoadFailed: boolean
}) {
  return (
    <div className="note-card">
      <div className="note-card-meta">
        <span className="note-time">{formatTime(note.capturedAt)}</span>
        <span className="note-duration">{formatDuration(note.durationMs)}</span>
      </div>
      <div className="note-card-status">
        <NoteStateLabel note={note} online={online} />
        {note.localState === 'upload_needs_attention' && (
          <button className="btn-retry" onClick={() => onRetry(note.clientNoteId)}>
            Retry
          </button>
        )}
      </div>
      {note.localState === 'uploaded' && note.serverNoteId && (
        <>
          <TranscriptSection note={note} />
          <DraftFactsSection note={note} facts={facts} factsLoadFailed={factsLoadFailed} />
        </>
      )}
    </div>
  )
}

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
          Add to your home screen: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>
        </p>
      ) : (
        <p className="install-banner-text">Install The Job Book on your phone for quick access</p>
      )}
      <div className="install-banner-actions">
        {!isIosSafari && (
          <button className="install-banner-btn" onClick={onInstall}>
            Install
          </button>
        )}
        <button className="install-banner-dismiss" onClick={onDismiss} aria-label="Dismiss install banner">
          Not now
        </button>
      </div>
    </div>
  )
}

const JOB_TYPE_LABELS: Record<string, string> = {
  garden_room: 'Garden room',
  extension: 'Extension',
  other: 'Other',
}

export default function CaptureScreen({
  job,
  onOpenReviewQueue,
  onOpenJobMemory,
  onSwitchJob,
}: {
  job: Job
  onOpenReviewQueue?: () => void
  onOpenJobMemory?: () => void
  onSwitchJob?: () => void
}) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [showExplainer, setShowExplainer] = useState(
    () => localStorage.getItem(EXPLAINER_KEY) !== 'true',
  )
  const { showBanner, isIosSafari, triggerInstall, dismiss: dismissInstall } = usePwaInstall()
  const [facts, setFacts] = useState<CandidateFact[]>([])
  const [factsLoadFailed, setFactsLoadFailed] = useState(false)
  const [showSourceHistory, setShowSourceHistory] = useState(true)

  // Things to check queue state
  const [draftCount, setDraftCount] = useState<number>(0)
  const [queueLoadState, setQueueLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

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
        const count = q.sections
          .flatMap(s => s.items)
          .filter(it => it.status === 'draft')
          .length
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
      syncAll()
      loadQueue()
    })
  }, [recorder, job.id, refreshNotes, syncAll, loadQueue])

  const dismissExplainer = useCallback(() => {
    localStorage.setItem(EXPLAINER_KEY, 'true')
    setShowExplainer(false)
  }, [])

  const thingsToCheckLabel = (() => {
    if (queueLoadState === 'loading') return 'Still looking for useful job facts'
    if (queueLoadState === 'error') return 'Things to check'
    if (draftCount === 1) return '1 thing to check'
    if (draftCount > 1) return `${draftCount} things to check`
    return 'Nothing to check'
  })()

  const hasUrgentItems = queueLoadState === 'ready' && draftCount > 0

  if (!isRecordingSupported) {
    return (
      <div className="capture-page">
        <div className="capture-header">
          <span className="capture-app-name">The Job Book</span>
        </div>
        <div className="unsupported-msg">
          {!window.isSecureContext
            ? 'Open this page over https:// to enable the microphone.'
            : 'Recording is not supported in this browser. Try Chrome or Safari.'}
        </div>
      </div>
    )
  }

  return (
    <div className="capture-page">
      <header className="capture-header">
        <span className="capture-app-name">The Job Book</span>
        {!online && (
          <span className="offline-badge" aria-live="polite">No signal</span>
        )}
      </header>

      {/* 1. Current job identity — title + Switch job make the selection clear */}
      <div className="capture-current-job">
        {onSwitchJob && (
          <div className="capture-current-job-row">
            <button className="btn-switch-job" onClick={onSwitchJob}>Switch job</button>
          </div>
        )}
        <div className="capture-current-job-detail">
          <span className="capture-current-job-title">{job.title}</span>
          {job.jobType && job.jobType !== 'other' && JOB_TYPE_LABELS[job.jobType] && (
            <span className="capture-current-job-type">{JOB_TYPE_LABELS[job.jobType]}</span>
          )}
        </div>
      </div>

      {showBanner && (
        <InstallBanner
          isIosSafari={isIosSafari}
          onInstall={triggerInstall}
          onDismiss={dismissInstall}
        />
      )}

      {showExplainer && <StorageExplainer onDismiss={dismissExplainer} />}

      {/* 2. Record — primary action */}
      <div className="capture-controls">
        {recorder.state === 'idle' && (
          <button
            className="record-btn"
            onClick={handleRecord}
            aria-label="Start recording"
          >
            <span className="record-btn-icon" aria-hidden="true" />
            Record
          </button>
        )}

        {(recorder.state === 'recording' || recorder.state === 'stopping') && (
          <div className="recording-active">
            <div className="recording-indicator" aria-live="polite" aria-atomic="true">
              <span className="dot" aria-hidden="true" />
              Recording
            </div>
            <div className="recording-elapsed">
              {formatDuration(recorder.elapsedMs)}
              <span className="recording-max"> / {formatDuration(MAX_DURATION_MS)}</span>
            </div>
            <button
              className="stop-btn"
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

      {/* 3 & 4. Things to check (stateful) + Job memory (quieter) */}
      {(onOpenReviewQueue || onOpenJobMemory) && (
        <div className="capture-job-actions">
          {onOpenReviewQueue && (
            <button
              className={`btn-things-to-check${hasUrgentItems ? ' btn-things-to-check--urgent' : ''}`}
              onClick={onOpenReviewQueue}
            >
              <span className="action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5h11M9 12h11M9 19h11" />
                  <path d="m3 5 1.5 1.5L7 4M3 12l1.5 1.5L7 11M3 19l1.5 1.5L7 18" />
                </svg>
              </span>
              <span className="action-text">
                <span className="things-to-check-title">Things to check</span>
                <span className="things-to-check-state">{thingsToCheckLabel}</span>
              </span>
            </button>
          )}
          {onOpenJobMemory && (
            <button className="btn-job-memory" onClick={onOpenJobMemory}>
              <span className="action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
                  <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
                </svg>
              </span>
              <span className="action-text">
                <span>Job memory</span>
                <span className="btn-job-memory-sub">What I remember</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* 5. Source history — secondary, collapsible */}
      <section className="source-history" aria-label="Source history">
        <div className="source-history-header">
          <button
            className="source-history-toggle"
            aria-expanded={showSourceHistory}
            onClick={() => setShowSourceHistory(h => !h)}
          >
            {showSourceHistory
              ? 'Hide source history'
              : notes.length > 0
                ? `Source history (${notes.length})`
                : 'Source history'}
          </button>
          {showSourceHistory && notes.some(n => n.localState === 'uploaded' && n.serverNoteId) && (
            <button className="btn-refresh-transcripts" onClick={handleRefresh}>
              Refresh
            </button>
          )}
        </div>
        {showSourceHistory && (
          notes.length === 0 ? (
            <p className="notes-empty">No notes yet. Tap Record to add one.</p>
          ) : (
            <ul className="notes-list">
              {notes.map(note => (
                <li key={note.clientNoteId}>
                  <NoteCard note={note} online={online} onRetry={retryNote} facts={facts} factsLoadFailed={factsLoadFailed} />
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  )
}
