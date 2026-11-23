import { claimUnmatchedNote } from './db'
import { getLocalOwnerId } from './localOwner'
import { useLocalCaptures } from './useLocalCaptures'
import { formatDuration, formatSavedStamp } from './SourceHistory'
import type { CaptureHome } from './captureTypes'
import type { AuthUser, Job } from './types'
export default function HomeScreen({
  jobs,
  home,
  known,
  online,
  onRecord,
  recording,
  recordingTitle,
  onPhoto,
  onOpenJob,
  onOpenAllJobs,
  onNewJob,
  onOpenUnfiled,
  onWorkshop,
  onLogout,
  user,
  localUnfiled,
  localUploadedUnfiled = 0,
  supported = true,
  permissionError = null,
}: {
  jobs: Job[]
  home: CaptureHome | null
  known: boolean
  online: boolean
  onRecord: () => void
  recording: boolean
  recordingTitle: string | null
  onPhoto: () => void
  onOpenJob: (id: string) => void
  onOpenAllJobs: () => void
  onNewJob: () => void
  onOpenUnfiled: () => void
  onWorkshop: () => void
  onLogout: () => void
  user: AuthUser | null
  localUnfiled: number
  localUploadedUnfiled?: number
  supported?: boolean
  permissionError?: string | null
}) {
  const { unmatched } = useLocalCaptures(),
    rows =
      home?.inProgressJobs ??
      jobs
        .filter((j) => j.status === 'started')
        .map((j) => ({
          id: j.id,
          title: j.title,
          lastActivityAt: j.updatedAt,
          toCheckCount: 0,
        })),
    count =
      Math.max(home?.unfiledCount ?? 0, localUploadedUnfiled) + localUnfiled
  return (
    <main className="capture-home">
      <header className="capture-home-header">
        <h1>The Job Book</h1>
        <button type="button" className="capture-link" onClick={onLogout}>
          Log out
        </button>
      </header>
      {user?.role === 'INTERNAL' && (
        <a className="btn-support-entry" href="/internal/support">
          Founder support ›
        </a>
      )}
      {!recording ? (
        <button
          type="button"
          className="capture-home-record"
          aria-label="Start recording"
          disabled={!supported}
          onClick={onRecord}
        >
          <span aria-hidden="true">●</span> Record
          <small>Tap · say it · done</small>
        </button>
      ) : (
        <div className="capture-home-recording" role="status">
          Recording ·{' '}
          {recordingTitle ? `to ${recordingTitle}` : 'Not filed yet'}
        </div>
      )}
      {!supported && (
        <p role="alert">
          Open this page over HTTPS in a browser that supports recording.
        </p>
      )}
      {permissionError && (
        <p role="alert">
          Microphone access denied. Check your browser settings and try again.
        </p>
      )}
      <button type="button" className="capture-photo-action" onClick={onPhoto}>
        Add photo
      </button>
      <section aria-label="In progress jobs" className="capture-home-jobs">
        <h2>In progress</h2>
        {!known && !home && !rows.length && (
          <p>
            {online
              ? 'Loading your jobs…'
              : 'Your jobs aren’t available yet. You can still record.'}
          </p>
        )}
        {rows.map((j) => (
          <button
            type="button"
            key={j.id}
            className="capture-home-job"
            onClick={() => onOpenJob(j.id)}
          >
            <span>
              <strong>{j.title}</strong>
              <small>{formatSavedStamp(j.lastActivityAt)}</small>
            </span>
            <span>
              {j.toCheckCount > 0 && <small>{j.toCheckCount} to check</small>}
              <span aria-hidden="true">›</span>
            </span>
          </button>
        ))}
      </section>
      {count > 0 && (
        <button
          type="button"
          className="capture-home-destination"
          onClick={onOpenUnfiled}
        >
          Not filed yet <span>{count} ›</span>
        </button>
      )}
      <button
        type="button"
        className="capture-home-destination"
        onClick={onWorkshop}
      >
        <span>
          Workshop
          {home && home.workshop.preview.length > 0 && (
            <small className="capture-workshop-preview">
              {home.workshop.preview.join(' · ')}
              {home.workshop.availableCount > home.workshop.preview.length
                ? ` · +${home.workshop.availableCount - home.workshop.preview.length} more`
                : ''}
            </small>
          )}
        </span>
        <span>
          {home && home.workshop.availableCount > 0
            ? `${home.workshop.availableCount} ${home.workshop.availableCount === 1 ? 'thing' : 'things'}`
            : ''}{' '}
          ›
        </span>
      </button>
      {known && (
        <div className="capture-home-other">
          <button
            type="button"
            className="capture-link"
            onClick={onOpenAllJobs}
          >
            Other jobs
          </button>
          <button type="button" className="capture-link" onClick={onNewJob}>
            New job
          </button>
        </div>
      )}
      {unmatched.length > 0 && (
        <section
          className="capture-unmatched"
          aria-label="Unmatched recordings"
        >
          <h2>Unmatched recordings</h2>
          <p>These recordings have not been matched to a person.</p>
          {unmatched.map((n) => (
            <article key={n.clientNoteId}>
              <p>
                {formatSavedStamp(n.capturedAt)} ·{' '}
                {formatDuration(n.durationMs)}
              </p>
              <button
                type="button"
                className="capture-link"
                disabled={!getLocalOwnerId()}
                onClick={() => {
                  void claimUnmatchedNote(n.clientNoteId)
                }}
              >
                This is mine
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
