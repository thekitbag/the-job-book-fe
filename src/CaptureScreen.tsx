import { useCallback, useEffect, useState } from 'react'
import { saveNote, getNotesForJob } from './db'
import { getDraftFacts } from './api'
import { useRecorder, isRecordingSupported } from './useRecorder'
import { useSync } from './useSync'
import { useTranscriptPoll } from './useTranscriptPoll'
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

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function NoteStateLabel({ note, online }: { note: LocalNote; online: boolean }) {
  switch (note.localState) {
    case 'saved_local':
      return online
        ? <span className="note-state note-state--local">Saved on phone</span>
        : <span className="note-state note-state--waiting">Waiting for signal</span>
    case 'uploading':
      return <span className="note-state note-state--uploading">Uploading…</span>
    case 'uploaded':
      return <span className="note-state note-state--synced">Synced</span>
    case 'upload_failed':
      return <span className="note-state note-state--failed">Will retry</span>
    case 'upload_needs_attention':
      return <span className="note-state note-state--attention">Needs attention</span>
  }
}

function TranscriptSection({ note }: { note: LocalNote }) {
  const { transcriptStatus, transcriptText } = note
  if (transcriptStatus === 'ready' && transcriptText) {
    return (
      <div className="transcript-section">
        <p className="transcript-label">What the system heard</p>
        <p className="transcript-text">{transcriptText}</p>
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
  // Badge precedence (tech lead steer 2025-06-07):
  // unclear type/status → Unclear
  // low confidence → Low confidence
  // medium confidence OR any uncertainty flags → Needs checking
  // high with no flags → no badge
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
  // Extraction only starts after transcript succeeds — don't show section before that.
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
        <span className="note-size">{formatBytes(note.sizeBytes)}</span>
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

export default function CaptureScreen({ job, onOpenReview }: { job: Job; onOpenReview?: () => void }) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [showExplainer, setShowExplainer] = useState(
    () => localStorage.getItem(EXPLAINER_KEY) !== 'true',
  )
  const [facts, setFacts] = useState<CandidateFact[]>([])
  const [factsLoadFailed, setFactsLoadFailed] = useState(false)

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

  // Fetch draft facts whenever a new note reaches extraction-ready state.
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
    })
  }, [recorder, job.id, refreshNotes, syncAll])

  const dismissExplainer = useCallback(() => {
    localStorage.setItem(EXPLAINER_KEY, 'true')
    setShowExplainer(false)
  }, [])

  if (!isRecordingSupported) {
    return (
      <div className="capture-page">
        <div className="capture-header">
          <span className="capture-app-name">Job Book</span>
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
        <span className="capture-app-name">Job Book</span>
        {!online && (
          <span className="offline-badge" aria-live="polite">No signal</span>
        )}
      </header>

      <div className="capture-job">
        <h1 className="capture-job-title">{job.title}</h1>
        <p className="capture-job-label">{job.roughLocationOrLabel}</p>
      </div>

      {showExplainer && <StorageExplainer onDismiss={dismissExplainer} />}

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

      {onOpenReview && readyExtractionCount > 0 && (
        <div className="review-entry">
          <button className="btn-open-review" onClick={onOpenReview}>
            Review draft facts
          </button>
        </div>
      )}

      <section className="notes-section">
        <div className="notes-heading-row">
          <h2 className="notes-heading">Recent notes</h2>
          {notes.some(n => n.localState === 'uploaded' && n.serverNoteId) && (
            <button className="btn-refresh-transcripts" onClick={handleRefresh}>
              Refresh
            </button>
          )}
        </div>
        {notes.length === 0 ? (
          <p className="notes-empty">No notes yet. Tap Record to add one.</p>
        ) : (
          <ul className="notes-list">
            {notes.map(note => (
              <li key={note.clientNoteId}>
                <NoteCard note={note} online={online} onRetry={retryNote} facts={facts} factsLoadFailed={factsLoadFailed} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
