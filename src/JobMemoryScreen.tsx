import { useEffect, useState } from 'react'
import { getMemoryView } from './api'
import type { Job, MemoryViewItem, MemoryViewResponse, MemoryViewSection } from './types'

const SECTION_SHORT_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered',
  used_materials: 'Used',
  leftovers: 'Leftover',
  supplier_delivery_notes: 'Supplier',
  customer_changes: 'Customer',
  watch_outs: 'Watch out',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StructuredFields({ item }: { item: MemoryViewItem }) {
  const parts = [
    item.quantity && item.unit ? `${item.quantity} ${item.unit}` : item.quantity,
    item.materialName,
    item.supplierName,
    item.deliveryTiming,
    item.locationOrUse,
  ].filter((v): v is string => Boolean(v))

  if (parts.length === 0) return null
  return <p className="mem-item-detail">{parts.join(' · ')}</p>
}

function SourceContext({ item }: { item: MemoryViewItem }) {
  const [open, setOpen] = useState(false)

  if (!item.source) return null

  return (
    <div className="mem-source">
      <button
        className="mem-source-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? 'Hide source' : 'Show source'}
      </button>
      {open && (
        <div className="mem-source-body">
          <p className="mem-source-label">This came from your note</p>
          <p className="mem-source-time">{formatTime(item.source.capturedAt)}</p>
          {item.source.transcriptText && (
            <>
              <p className="mem-source-label">What the system heard</p>
              <blockquote className="mem-source-quote">{item.source.transcriptText}</blockquote>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryCard({ item }: { item: MemoryViewItem }) {
  return (
    <div className="mem-card">
      <p className="mem-card-summary">{item.summary}</p>
      <StructuredFields item={item} />
      <SourceContext item={item} />
    </div>
  )
}

function MemSection({ section }: { section: MemoryViewSection }) {
  if (section.items.length === 0) return null
  const shortLabel = SECTION_SHORT_LABELS[section.key] ?? section.label
  return (
    <section className="mem-section">
      <h2 className="mem-section-heading">{shortLabel}</h2>
      {section.items.map(item => <MemoryCard key={item.id} item={item} />)}
    </section>
  )
}

export default function JobMemoryScreen({
  job,
  onClose,
  onOpenReviewQueue,
}: {
  job: Job
  onClose: () => void
  onOpenReviewQueue: () => void
}) {
  const [data, setData] = useState<MemoryViewResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  function load() {
    setLoadState('loading')
    setErrorMsg('')
    getMemoryView(job.id)
      .then(d => { setData(d); setLoadState('ready') })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job memory')
        setLoadState('error')
      })
  }

  useEffect(() => { load() }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasMemory = data
    ? data.sections.some(s => s.items.length > 0)
    : false

  return (
    <div className="mem-page">
      <header className="mem-header">
        <button className="mem-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <div className="mem-header-titles">
          <h1 className="mem-title">Job memory</h1>
          <p className="mem-job-label">{job.title}</p>
        </div>
      </header>

      {loadState === 'loading' && (
        <p className="mem-loading">Loading…</p>
      )}

      {loadState === 'error' && (
        <div className="mem-error" role="alert">
          <p>{errorMsg}</p>
          <button className="mem-retry" onClick={load}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && data && (
        <>
          {/* Still to check — shown above trusted memory, visually distinct */}
          {data.stillToCheck.count > 0 && (
            <div className="mem-still-to-check">
              <div className="mem-stc-row">
                <span className="mem-stc-count">{data.stillToCheck.count} still to check</span>
                <button
                  className="mem-stc-link"
                  onClick={onOpenReviewQueue}
                >
                  Review Things to check
                </button>
              </div>
              {data.stillToCheck.items.map(item => (
                <p key={item.id} className="mem-stc-item">
                  {item.timeLabel && <span className="mem-stc-time">{item.timeLabel}</span>}
                  {item.summary}
                </p>
              ))}
            </div>
          )}

          {/* Trusted memory sections */}
          {hasMemory
            ? data.sections.map(s => <MemSection key={s.key} section={s} />)
            : (
              <div className="mem-empty">
                <p>No trusted memory yet. Review Things to check to save useful job details here.</p>
                <button className="mem-stc-link" onClick={onOpenReviewQueue}>
                  Go to Things to check
                </button>
              </div>
            )}
        </>
      )}
    </div>
  )
}
