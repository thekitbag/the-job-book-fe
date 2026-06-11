import { useEffect, useState } from 'react'
import { getJobs, getInspectionData, ApiError } from './api'
import type {
  InspectionCandidateFact,
  InspectionData,
  InspectionMemoryItem,
  InspectionNote,
  InspectionNotesByDay,
  InspectionPossibleMiss,
  InspectionQueueSection,
  Job,
} from './types'

const INSPECTION_KEY_SESSION = 'job-book-inspection-key'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
function formatBytes(b: number) {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`
  return `${(b / (1024 * 1024)).toFixed(1)}MB`
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReviewStateBadge({ state }: { state: string }) {
  const cls: Record<string, string> = {
    waiting: 'insp-badge insp-badge--waiting',
    confirmed: 'insp-badge insp-badge--confirmed',
    edited: 'insp-badge insp-badge--edited',
    dismissed: 'insp-badge insp-badge--dismissed',
  }
  return (
    <span className={cls[state] ?? 'insp-badge insp-badge--other'}>
      {state.charAt(0).toUpperCase() + state.slice(1)}
    </span>
  )
}

function ConfidenceBadge({ label }: { label: string }) {
  return (
    <span className={`insp-badge insp-badge--conf-${label}`}>{label}</span>
  )
}

function FactRow({ fact }: { fact: InspectionCandidateFact }) {
  return (
    <div className="insp-fact">
      <div className="insp-fact-header">
        <span className="insp-fact-type">{fact.factType.replace(/_/g, ' ')}</span>
        <ReviewStateBadge state={fact.reviewState} />
        <ConfidenceBadge label={fact.confidenceLabel} />
        {fact.uncertaintyFlags.length > 0 && (
          <span className="insp-badge insp-badge--flags">{fact.uncertaintyFlags.join(', ')}</span>
        )}
      </div>
      <p className="insp-fact-summary">{fact.summary}</p>
      {(fact.materialName || fact.quantity || fact.supplierName || fact.deliveryTiming || fact.locationOrUse) && (
        <p className="insp-detail-line">
          {[
            fact.quantity && fact.unit ? `${fact.quantity} ${fact.unit}` : fact.quantity,
            fact.materialName,
            fact.supplierName,
            fact.deliveryTiming,
            fact.locationOrUse,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

function NoteBlock({ note }: { note: InspectionNote }) {
  return (
    <div className="insp-note">
      <div className="insp-note-header">
        <span className="insp-note-time">{formatTime(note.capturedAt)}</span>
        <span className="insp-note-meta">{formatDuration(note.durationMs)} · {formatBytes(note.sizeBytes)} · {note.mimeType.split(';')[0]}</span>
        {note.audioStored
          ? <span className="insp-badge insp-badge--ok">Audio stored</span>
          : <span className="insp-badge insp-badge--warn">No audio</span>}
        <span className="insp-badge insp-badge--neutral">{note.serverStatus}</span>
      </div>

      <div className="insp-transcript">
        <span className="insp-section-micro">Transcript</span>
        <span className={`insp-badge insp-badge--${note.transcript?.status ?? 'none'}`}>
          {note.transcript?.status ?? 'none'}
        </span>
        {note.transcript?.extractionStatus && (
          <span className={`insp-badge insp-badge--${note.transcript.extractionStatus}`}>
            extraction: {note.transcript.extractionStatus}
          </span>
        )}
        {note.transcript?.errorCode && (
          <span className="insp-badge insp-badge--error">{note.transcript.errorCode}</span>
        )}
        {note.transcript?.text && (
          <blockquote className="insp-transcript-text">{note.transcript.text}</blockquote>
        )}
      </div>

      <div className="insp-facts">
        <span className="insp-section-micro">Draft facts ({note.candidateFacts.length})</span>
        {note.candidateFacts.length === 0
          ? <p className="insp-empty-hint">None</p>
          : note.candidateFacts.map(f => <FactRow key={f.id} fact={f} />)}
      </div>
    </div>
  )
}

function DayBlock({ day }: { day: InspectionNotesByDay }) {
  return (
    <div className="insp-day">
      <h3 className="insp-day-heading">{formatDate(day.localDate + 'T12:00:00Z')}</h3>
      {day.notes.map(n => <NoteBlock key={n.id} note={n} />)}
    </div>
  )
}

function QueueSection({ section }: { section: InspectionQueueSection }) {
  if (section.items.length === 0) return null
  return (
    <div className="insp-queue-section">
      <h4 className="insp-queue-section-label">{section.label}</h4>
      {section.items.map(item => (
        <div key={item.id} className="insp-queue-item">
          <span className="insp-badge insp-badge--waiting">{item.status}</span>
          {item.timeLabel && <span className="insp-note-meta">{item.timeLabel}</span>}
          <span className="insp-queue-item-summary">{item.summary}</span>
        </div>
      ))}
    </div>
  )
}

function MemoryRow({ item }: { item: InspectionMemoryItem }) {
  return (
    <div className="insp-memory-item">
      <span className="insp-fact-type">{item.memoryType.replace(/_/g, ' ')}</span>
      <span className="insp-memory-summary">{item.summary}</span>
      <span className="insp-note-meta">{formatTime(item.createdAt)}</span>
    </div>
  )
}

function MissRow({ miss }: { miss: InspectionPossibleMiss }) {
  return (
    <div className="insp-miss">
      <p className="insp-miss-reason">{miss.reason}</p>
      {miss.transcriptExcerpt && (
        <blockquote className="insp-transcript-text">"{miss.transcriptExcerpt}"</blockquote>
      )}
    </div>
  )
}

// ── Main inspection view ──────────────────────────────────────────────────────

function InspectionView({ data }: { data: InspectionData }) {
  const totalNotes = data.notesByDay.reduce((n, d) => n + d.notes.length, 0)
  const totalFacts = data.notesByDay.reduce((n, d) =>
    n + d.notes.reduce((m, note) => m + note.candidateFacts.length, 0), 0)
  const pendingItems = data.queue.sections.reduce((n, s) =>
    n + s.items.filter(i => i.status === 'draft').length, 0)

  return (
    <div className="insp-view">
      <div className="insp-summary-bar">
        <span>{totalNotes} notes</span>
        <span>{totalFacts} facts</span>
        <span>{data.memoryItems.length} memories</span>
        <span>{pendingItems} pending</span>
        <span className="insp-note-meta">Generated {formatTime(data.generatedAt)}</span>
      </div>

      <section className="insp-section">
        <h2 className="insp-section-heading">Notes</h2>
        {data.notesByDay.length === 0
          ? <p className="insp-empty-hint">No notes recorded yet.</p>
          : data.notesByDay.map(d => <DayBlock key={d.localDate} day={d} />)}
      </section>

      <section className="insp-section">
        <h2 className="insp-section-heading">Things to check now</h2>
        {data.queue.sections.every(s => s.items.length === 0)
          ? <p className="insp-empty-hint">Queue is empty.</p>
          : data.queue.sections.map(s => <QueueSection key={s.key} section={s} />)}
      </section>

      <section className="insp-section">
        <h2 className="insp-section-heading">Confirmed memory</h2>
        {data.memoryItems.length === 0
          ? <p className="insp-empty-hint">No confirmed memory yet.</p>
          : data.memoryItems.map(m => <MemoryRow key={m.id} item={m} />)}
      </section>

      {data.possibleMisses.length > 0 && (
        <section className="insp-section">
          <h2 className="insp-section-heading">Possible misses</h2>
          {data.possibleMisses.map((m, i) => <MissRow key={i} miss={m} />)}
        </section>
      )}
    </div>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function PilotInspectionPage() {
  const [inspectionKey, setInspectionKey] = useState(
    () => sessionStorage.getItem(INSPECTION_KEY_SESSION) ?? ''
  )
  const [keyDraft, setKeyDraft] = useState('')

  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsState, setJobsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [jobsError, setJobsError] = useState('')

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [data, setData] = useState<InspectionData | null>(null)
  const [dataState, setDataState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [dataError, setDataError] = useState('')

  // Load jobs once we have a key
  useEffect(() => {
    if (!inspectionKey) return
    setJobsState('loading')
    getJobs()
      .then(loaded => {
        setJobs(loaded)
        setJobsState('idle')
        if (loaded.length > 0) setSelectedJobId(loaded[0].id)
      })
      .catch((err: unknown) => {
        setJobsError(err instanceof Error ? err.message : 'Could not load jobs')
        setJobsState('error')
      })
  }, [inspectionKey])

  // Load inspection data when job changes
  useEffect(() => {
    if (!inspectionKey || !selectedJobId) return
    setDataState('loading')
    setData(null)
    setDataError('')
    getInspectionData(selectedJobId, inspectionKey)
      .then(d => { setData(d); setDataState('idle') })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          setDataError('Invalid inspection key. Clear it and try again.')
        } else {
          setDataError(err instanceof Error ? err.message : 'Could not load inspection data')
        }
        setDataState('error')
      })
  }, [inspectionKey, selectedJobId])

  function submitKey(e: React.FormEvent) {
    e.preventDefault()
    const key = keyDraft.trim()
    if (!key) return
    sessionStorage.setItem(INSPECTION_KEY_SESSION, key)
    setInspectionKey(key)
    setKeyDraft('')
  }

  function clearKey() {
    sessionStorage.removeItem(INSPECTION_KEY_SESSION)
    setInspectionKey('')
    setData(null)
    setDataState('idle')
  }

  return (
    <div className="insp-page">
      <header className="insp-header">
        <h1 className="insp-title">Pilot inspection</h1>
        {inspectionKey && (
          <button className="insp-clear-key" onClick={clearKey}>
            Clear key
          </button>
        )}
      </header>

      {/* Key prompt */}
      {!inspectionKey && (
        <form className="insp-key-form" aria-label="Inspection key" onSubmit={submitKey}>
          <label className="insp-key-label">
            <span>Inspection key</span>
            <input
              className="insp-key-input"
              type="password"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              placeholder="Enter inspection key"
              autoFocus
            />
          </label>
          <button type="submit" className="insp-key-submit" disabled={!keyDraft.trim()}>
            Continue
          </button>
        </form>
      )}

      {/* Job selector */}
      {inspectionKey && (
        <div className="insp-job-selector">
          {jobsState === 'loading' && <p className="insp-loading">Loading jobs…</p>}
          {jobsState === 'error' && (
            <p className="insp-error" role="alert">{jobsError}</p>
          )}
          {jobsState === 'idle' && jobs.length > 0 && (
            <select
              className="insp-job-select"
              value={selectedJobId ?? ''}
              onChange={e => setSelectedJobId(e.target.value)}
              aria-label="Select job"
            >
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          )}
          {jobsState === 'idle' && jobs.length === 0 && (
            <p className="insp-empty-hint">No jobs found.</p>
          )}
        </div>
      )}

      {/* Inspection data */}
      {inspectionKey && selectedJobId && (
        <>
          {dataState === 'loading' && <p className="insp-loading">Loading inspection data…</p>}
          {dataState === 'error' && (
            <div role="alert" className="insp-error">
              <p>{dataError}</p>
              <button
                className="insp-retry"
                onClick={() => {
                  setDataState('idle')
                  setDataError('')
                  setData(null)
                  // re-trigger the effect
                  const id = selectedJobId
                  setSelectedJobId(null)
                  setTimeout(() => setSelectedJobId(id), 0)
                }}
              >
                Retry
              </button>
            </div>
          )}
          {data && <InspectionView data={data} />}
        </>
      )}
    </div>
  )
}
