import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { getJobLog, resolveApiUrl } from './api'
import DirectAddForm from './DirectAddForm'
import MemoryCard, { type MemoryCardProps } from './MemoryCard'
import { formatDuration, formatSavedStamp } from './SourceHistory'
import type { CreateMemoryItemRequest, JobLogEntry, MemoryViewItem } from './types'
export default function JobLog({
  jobId,
  photos,
  onAddNote,
  onEditNote,
  refreshKey,
}: {
  jobId: string
  photos?: ReactNode
  refreshKey?: unknown
  onAddNote?: (req: CreateMemoryItemRequest) => Promise<MemoryViewItem>
  onEditNote?: (item: MemoryViewItem) => Omit<MemoryCardProps, 'item'>
}) {
  const [filter, setFilter] = useState<'all' | 'notes' | 'photos'>('all')
  const [entries, setEntries] = useState<JobLogEntry[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [managePhotos, setManagePhotos] = useState(false)
  const current = useRef(jobId)
  current.current = jobId
  const version = useRef(0)
  const load = useCallback(() => {
    const requestVersion = ++version.current
    setState('loading')
    getJobLog(jobId)
      .then((res) => {
        if (current.current === jobId && requestVersion === version.current) {
          setEntries(res.entries)
          setState('ready')
        }
      })
      .catch(() => {
        if (current.current === jobId && requestVersion === version.current) setState('error')
      })
  }, [jobId])
  useEffect(() => {
    setEntries([])
    setFilter('all')
    setManagePhotos(false)
  }, [jobId])
  useEffect(() => {
    load()
  }, [refreshKey, load])
  const visible = entries.filter(
    (e) => filter === 'all' || (filter === 'photos' ? e.kind === 'photo' : e.kind !== 'photo'),
  )
  return (
    <div className="mem-tabpanel">
      <div className="ws-tabs ws-tabs--inner" role="tablist" aria-label="Job log filters">
        {(['all', 'notes', 'photos'] as const).map((key) => (
          <button
            key={key}
            className={`ws-tab${filter === key ? ' ws-tab--active' : ''}`}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
          >
            {key[0].toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>
      {filter !== 'photos' && onAddNote && (
        <DirectAddForm
          kind="note"
          label="Add note"
          onAdd={async (req) => {
            const item = await onAddNote(req)
            load()
            return item
          }}
        />
      )}
      {photos && (
        <>
          <button
            type="button"
            className="btn-lens-add-text"
            aria-expanded={managePhotos}
            onClick={() => {
              setManagePhotos((v) => !v)
              if (managePhotos) load()
            }}
          >
            {managePhotos ? 'Back to log' : 'Add or change photos'}
          </button>
          {managePhotos && photos}
        </>
      )}
      {!managePhotos && (
        <>
          {state === 'loading' && <p>Loading job log…</p>}
          {state === 'error' && (
            <p role="alert">
              Could not load the job log.{' '}
              <button type="button" onClick={load}>
                Try again
              </button>
            </p>
          )}
          {state === 'ready' && visible.length === 0 && <p className="mem-tab-empty">Nothing here yet.</p>}
          {state === 'ready' && (
            <ul className="job-log-entries" aria-label="Job log">
              {visible.map((entry) => (
                <li key={`${entry.kind}:${entry.id}`} className="mem-card job-log-entry">
                  <p className="mem-section-heading">
                    {entry.kind === 'voice_note'
                      ? 'Voice note'
                      : entry.kind === 'typed_note'
                        ? 'Note'
                        : entry.fileKind === 'PDF'
                          ? 'File'
                          : 'Photo'}{' '}
                    · {formatSavedStamp(entry.at)}
                  </p>
                  {entry.kind === 'voice_note' ? (
                    <>
                      {entry.transcriptStatus === 'completed' && entry.text !== null ? (
                        <blockquote data-builder-note>{entry.text}</blockquote>
                      ) : (
                        <p role="status">
                          {entry.transcriptStatus === 'failed'
                            ? 'Recording saved — could not be transcribed.'
                            : 'Recording saved — transcript pending.'}
                        </p>
                      )}
                      {entry.durationMs !== null && (
                        <p className="mem-row-tap-meta">{formatDuration(entry.durationMs)}</p>
                      )}
                    </>
                  ) : entry.kind === 'typed_note' ? (
                    <>
                      {onEditNote ? (
                        (() => {
                          const item: MemoryViewItem = {
                            id: entry.memoryItemId,
                            memoryType: 'general_note',
                            summary: entry.text,
                            materialName: null,
                            quantity: null,
                            unit: null,
                            supplierName: null,
                            locationOrUse: null,
                            deliveryTiming: null,
                            uncertaintyFlags: [],
                            sourceCandidateFactId: null,
                            reviewDecisionId: null,
                            createdAt: entry.at,
                            updatedAt: entry.at,
                            source: null,
                            isManual: true,
                          }
                          return <MemoryCard item={item} {...onEditNote(item)} />
                        })()
                      ) : (
                        <p data-builder-note>{entry.text}</p>
                      )}
                    </>
                  ) : (
                    <>
                      {entry.fileKind === 'IMAGE' && (
                        <a href={resolveApiUrl(entry.fileUrl)} target="_blank" rel="noreferrer">
                          <img
                            className="job-log-photo"
                            src={resolveApiUrl(entry.fileUrl)}
                            alt={entry.descriptor ?? 'Job photo'}
                          />
                        </a>
                      )}
                      {entry.descriptor && <p>{entry.descriptor}</p>}
                      <a href={resolveApiUrl(entry.fileUrl)} target="_blank" rel="noreferrer">
                        {entry.fileKind === 'PDF' ? 'Open file' : 'Open photo'}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
