import { useCallback, useEffect, useRef, useState } from 'react'
import { getUnfiledCaptures, resolveApiUrl } from './api'
import { useCaptureContext } from './CaptureSyncProvider'
import { useLocalCaptures } from './useLocalCaptures'
import { useCaptureUpdates } from './captureEvents'
import { getCaptureSessionId } from './localOwner'
import LocalCaptureItem from './LocalCaptureItem'
import { formatDuration, formatSavedStamp } from './SourceHistory'
import type { UnfiledCaptures } from './captureTypes'
import type { LocalNote, TranscriptStatus } from './types'
export function unfiledTranscriptStatus(
  status: 'pending' | 'completed' | 'failed',
): TranscriptStatus {
  return status === 'completed'
    ? 'ready'
    : status === 'failed'
      ? 'failed'
      : 'waiting'
}
function withServerTranscript(
  note: LocalNote,
  remote: UnfiledCaptures['notes'][number] | undefined,
): LocalNote {
  return remote
    ? {
        ...note,
        transcriptStatus: unfiledTranscriptStatus(remote.transcriptStatus),
        transcriptText: remote.text,
      }
    : note
}
export default function UnfiledScreen({ onBack }: { onBack: () => void }) {
  const capture = useCaptureContext()!,
    { notes, photos } = useLocalCaptures(),
    revision = useCaptureUpdates(),
    [server, setServer] = useState<UnfiledCaptures>({ notes: [], photos: [] }),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false),
    loadVersion = useRef(0)
  const invalidateLoad = useCallback(() => {
    loadVersion.current++
  }, [])
  const load = useCallback(async () => {
    const boundary = getCaptureSessionId(),
      request = ++loadVersion.current
    const active = () =>
      boundary === getCaptureSessionId() && request === loadVersion.current
    try {
      const fresh = await getUnfiledCaptures()
      if (active()) {
        setServer(fresh)
        setLoaded(true)
        setError('')
      }
    } catch {
      if (active())
        setError(
          'Could not refresh. Recordings saved on this phone are still here.',
        )
    }
  }, [])
  useEffect(() => {
    void load()
    const refresh = () => {
      void load()
    }
    window.addEventListener('online', refresh)
    return () => {
      invalidateLoad()
      window.removeEventListener('online', refresh)
    }
  }, [load, revision, capture.revision, invalidateLoad])
  const localNotes = notes.filter((n) => n.jobId === null),
    localPhotos = photos.filter((p) => p.jobId === null)
  const rows = [
    ...localNotes.map((n) => ({
      key: 'local-note:' + n.clientNoteId,
      at: n.capturedAt,
      node: (
        <LocalCaptureItem
          note={withServerTranscript(
            n,
            server.notes.find((remote) => remote.noteId === n.serverNoteId),
          )}
          onFile={() =>
            capture.openFile({
              kind: 'note',
              localId: n.clientNoteId,
              serverId: n.serverNoteId ?? undefined,
              jobId: null,
              at: n.capturedAt,
              context: n.captureContext ?? 'home',
              method: 'later_list',
            })
          }
        />
      ),
    })),
    ...localPhotos.map((p) => ({
      key: 'local-photo:' + p.clientPhotoId,
      at: p.capturedAt,
      node: (
        <LocalCaptureItem
          photo={p}
          onFile={() =>
            capture.openFile({
              kind: 'photo',
              localId: p.clientPhotoId,
              serverId: p.serverPhotoId ?? undefined,
              jobId: null,
              at: p.capturedAt,
              context: p.captureContext ?? 'home',
              method: 'later_list',
            })
          }
        />
      ),
    })),
    ...server.notes
      .filter((n) => !notes.some((local) => local.serverNoteId === n.noteId))
      .map((n) => ({
        key: 'note:' + n.noteId,
        at: n.capturedAt,
        node: (
          <article>
            <p>
              Voice note · {formatSavedStamp(n.capturedAt)}
              {n.durationMs !== null
                ? ` · ${formatDuration(n.durationMs)}`
                : ''}
            </p>
            {unfiledTranscriptStatus(n.transcriptStatus) === 'ready' &&
            n.text ? (
              <blockquote data-builder-note>{n.text}</blockquote>
            ) : (
              <p>
                {n.transcriptStatus === 'failed'
                  ? 'Recording saved — could not be transcribed.'
                  : 'Recording saved.'}
              </p>
            )}
            <button
              type="button"
              className="capture-link"
              onClick={() =>
                capture.openFile({
                  kind: 'note',
                  serverId: n.noteId,
                  jobId: null,
                  at: n.capturedAt,
                  context: 'home',
                  method: 'later_list',
                })
              }
            >
              Choose job
            </button>
          </article>
        ),
      })),
    ...server.photos
      .filter((p) => !photos.some((local) => local.serverPhotoId === p.photoId))
      .map((p) => ({
        key: 'photo:' + p.photoId,
        at: p.uploadedAt,
        node: (
          <article>
            <p>Photo · {formatSavedStamp(p.uploadedAt)}</p>
            <img
              className="job-log-photo"
              src={resolveApiUrl(p.fileUrl)}
              alt="Not filed yet"
            />
            <button
              className="capture-link"
              type="button"
              onClick={() =>
                capture.openFile({
                  kind: 'photo',
                  serverId: p.photoId,
                  jobId: null,
                  at: p.uploadedAt,
                  context: 'home',
                  method: 'later_list',
                })
              }
            >
              Choose job
            </button>
          </article>
        ),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <main className="capture-page">
      <header>
        <button className="capture-link" type="button" onClick={onBack}>
          ‹ Home
        </button>
        <h1>Not filed yet</h1>
      </header>
      {error && (
        <p role="status">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              void load()
            }}
          >
            Try again
          </button>
        </p>
      )}
      <ul className="capture-unfiled-list">
        {rows.map((row) => (
          <li key={row.key}>{row.node}</li>
        ))}
      </ul>
      {!rows.length &&
        !error &&
        (loaded ? (
          <p>Nothing waiting to be filed.</p>
        ) : (
          <p>Loading recordings…</p>
        ))}
    </main>
  )
}
