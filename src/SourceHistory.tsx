import { useState } from 'react'
import type { LocalNote } from './types'

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Notes span days and jobs, so a saved stamp needs the date, not time only:
// "today, 08:41" / "10 Jul, 08:41" / "10 Jul 2025, 08:41".
export function formatSavedStamp(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Pinned to en-GB (pilot locale) so the stamp is 24h and deterministic
  // across environments (CI runners default to en-US 12h).
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return `today, ${time}`
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
  return `${date}, ${time}`
}

// A job row only needs roughly when it was last touched, in the builder's terms.
export function formatJobDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  const daysAgo = Math.round((day(now) - day(d)) / 86_400_000)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo > 1 && daysAgo < 7)
    return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

export function TranscriptSection({ note }: { note: LocalNote }) {
  const [open, setOpen] = useState(false)
  const { transcriptStatus, transcriptText } = note
  if (transcriptStatus === 'ready' && transcriptText) {
    return (
      <div className="transcript-section">
        <button
          type="button"
          className="transcript-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide transcript' : 'Show transcript'}
        </button>
        {open && (
          <p className="transcript-text" data-builder-note>
            {transcriptText}
          </p>
        )}
      </div>
    )
  }
  if (transcriptStatus === 'ready') return null
  if (transcriptStatus === 'failed') {
    return (
      <p className="transcript-failed">
        Transcription failed — recording is still saved
      </p>
    )
  }
  if (transcriptStatus === 'transcribing') {
    return <p className="transcript-pending">Transcribing…</p>
  }
  return <p className="transcript-pending">Waiting for transcript</p>
}
