import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { getJobLog, resolveApiUrl } from './api'
import { useLocalCaptures } from './useLocalCaptures'
import { useCaptureContext } from './CaptureSyncProvider'
import { getCaptureSessionId } from './localOwner'
import LocalCaptureItem from './LocalCaptureItem'
import BottomSheet from './BottomSheet'
import DirectAddForm from './DirectAddForm'
import MemoryCard, { type MemoryCardProps } from './MemoryCard'
import { formatDuration, formatSavedStamp } from './SourceHistory'
import type {
  CreateMemoryItemRequest,
  JobLogEntry,
  MemoryViewItem,
} from './types'
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
  const capture = useCaptureContext(),
    local = useLocalCaptures()
  const [actions, setActions] = useState<JobLogEntry | null>(null)
  const [filter, setFilter] = useState<'all' | 'notes' | 'photos'>('all')
  const [entries, setEntries] = useState<JobLogEntry[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [managePhotos, setManagePhotos] = useState(false)
  const current = useRef(jobId)
  current.current = jobId
  const version = useRef(0)
  const load = useCallback(() => {
    const requestVersion = ++version.current
    const boundary = getCaptureSessionId()
    setState((previous) => (previous === 'ready' ? 'ready' : 'loading'))
    getJobLog(jobId)
      .then((res) => {
        if (
          current.current === jobId &&
          requestVersion === version.current &&
          boundary === getCaptureSessionId()
        ) {
          setEntries(res.entries)
          setState('ready')
        }
      })
      .catch(() => {
        if (
          current.current === jobId &&
          requestVersion === version.current &&
          boundary === getCaptureSessionId()
        )
          setState('error')
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
  const localNotes = local.notes.filter(
    (n) =>
      n.jobId === jobId &&
      !entries.some(
        (e) => e.kind === 'voice_note' && e.noteId === n.serverNoteId,
      ),
  )
  const localPhotos = local.photos.filter(
    (p) =>
      p.jobId === jobId &&
      !entries.some((e) => e.kind === 'photo' && e.photoId === p.serverPhotoId),
  )
  useEffect(() => {
    const pending =
      entries.some(
        (e) => e.kind === 'voice_note' && e.transcriptStatus === 'pending',
      ) ||
      localNotes.length > 0 ||
      localPhotos.length > 0
    if (!pending) return
    const poll = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine) load()
    }
    const timer = setInterval(poll, 3000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [entries, localNotes.length, localPhotos.length, load])
  const visible = entries.filter(
    (e) =>
      filter === 'all' ||
      (filter === 'photos' ? e.kind === 'photo' : e.kind !== 'photo'),
  )
  return (
    <div className="mem-tabpanel">
      <div
        className="ws-tabs ws-tabs--inner"
        role="tablist"
        aria-label="Job log filters"
      >
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
          {state === 'ready' &&
            visible.length === 0 &&
            !localNotes.length &&
            !localPhotos.length && (
              <p className="mem-tab-empty">Nothing here yet.</p>
            )}
          {
            <ul className="job-log-entries" aria-label="Job log">
              {filter !== 'photos' &&
                localNotes.map((note) => (
                  <li key={'local-note:' + note.clientNoteId}>
                    <LocalCaptureItem note={note} />
                  </li>
                ))}
              {filter !== 'notes' &&
                localPhotos.map((photo) => (
                  <li key={'local-photo:' + photo.clientPhotoId}>
                    <LocalCaptureItem photo={photo} />
                  </li>
                ))}
              {visible.map((entry) => (
                <li
                  key={`${entry.kind}:${entry.id}`}
                  className="mem-card job-log-entry"
                >
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
                      {entry.transcriptStatus === 'completed' &&
                      entry.text !== null ? (
                        <blockquote data-builder-note>{entry.text}</blockquote>
                      ) : (
                        <p role="status">
                          {entry.transcriptStatus === 'failed'
                            ? 'Recording saved — could not be transcribed.'
                            : 'Recording saved — transcript pending.'}
                        </p>
                      )}
                      {entry.durationMs !== null && (
                        <p className="mem-row-tap-meta">
                          {formatDuration(entry.durationMs)}
                        </p>
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
                          return (
                            <MemoryCard item={item} {...onEditNote(item)} />
                          )
                        })()
                      ) : (
                        <p data-builder-note>{entry.text}</p>
                      )}
                    </>
                  ) : (
                    <>
                      {entry.fileKind === 'IMAGE' && (
                        <a
                          href={resolveApiUrl(entry.fileUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            className="job-log-photo"
                            src={resolveApiUrl(entry.fileUrl)}
                            alt={entry.descriptor ?? 'Job photo'}
                          />
                        </a>
                      )}
                      {entry.descriptor && <p>{entry.descriptor}</p>}
                      <a
                        href={resolveApiUrl(entry.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {entry.fileKind === 'PDF' ? 'Open file' : 'Open photo'}
                      </a>
                    </>
                  )}
                  {capture &&
                    entry.kind !== 'typed_note' &&
                    (entry.kind === 'voice_note' ||
                      entry.fileKind === 'IMAGE') && (
                      <button
                        type="button"
                        className="capture-link"
                        onClick={() => setActions(entry)}
                        aria-label={
                          entry.kind === 'voice_note'
                            ? 'Voice note actions'
                            : 'Photo actions'
                        }
                      >
                        More
                      </button>
                    )}
                </li>
              ))}
            </ul>
          }
        </>
      )}
      {actions && (
        <BottomSheet
          title={actions.kind === 'voice_note' ? 'Voice note' : 'Photo'}
          onClose={() => setActions(null)}
        >
          <button
            className="capture-job-choice"
            type="button"
            onClick={() => {
              if (actions.kind === 'voice_note' || actions.kind === 'photo') {
                capture?.openMove({
                  kind: actions.kind === 'voice_note' ? 'note' : 'photo',
                  serverId:
                    actions.kind === 'voice_note'
                      ? actions.noteId
                      : actions.photoId,
                  localId:
                    actions.kind === 'voice_note'
                      ? local.notes.find(
                          (n) => n.serverNoteId === actions.noteId,
                        )?.clientNoteId
                      : local.photos.find(
                          (p) => p.serverPhotoId === actions.photoId,
                        )?.clientPhotoId,
                  jobId,
                  at: actions.at,
                  context: 'job',
                })
                setActions(null)
              }
            }}
          >
            Move to another job
          </button>
        </BottomSheet>
      )}
    </div>
  )
}
