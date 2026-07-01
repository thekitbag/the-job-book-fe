import { useState } from 'react'
import type { CandidateFact, LocalNote } from './types'

export function formatDuration(ms: number): string {
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

// Collapsible source-history region — the raw voice notes as evidence, kept
// secondary to the trusted job summary. No file size / MIME / pipeline language.
export default function SourceHistory({
  notes,
  online,
  onRetry,
  facts,
  factsLoadFailed,
  onRefresh,
  open,
  onToggle,
}: {
  notes: LocalNote[]
  online: boolean
  onRetry: (id: string) => void
  facts: CandidateFact[]
  factsLoadFailed: boolean
  onRefresh: () => void
  open: boolean
  onToggle: () => void
}) {
  const canRefresh = notes.some(n => n.localState === 'uploaded' && n.serverNoteId)
  return (
    <section className="source-history" aria-label="Source history">
      <div className="source-history-header">
        <button
          className="source-history-toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open
            ? 'Hide source history'
            : notes.length > 0
              ? `Source history (${notes.length})`
              : 'Source history'}
        </button>
        {open && canRefresh && (
          <button className="btn-refresh-transcripts" onClick={onRefresh}>
            Refresh
          </button>
        )}
      </div>
      {open && (
        notes.length === 0 ? (
          <p className="notes-empty">No notes yet. Tap Record to add one.</p>
        ) : (
          <ul className="notes-list">
            {notes.map(note => (
              <li key={note.clientNoteId}>
                <NoteCard note={note} online={online} onRetry={onRetry} facts={facts} factsLoadFailed={factsLoadFailed} />
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}
