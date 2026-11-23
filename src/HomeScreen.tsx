import { claimUnmatchedNote } from './db'
import { getLocalOwnerId } from './localOwner'
import { useLocalCaptures } from './useLocalCaptures'
import { formatDuration, formatJobDay, formatSavedStamp } from './SourceHistory'
import type { CaptureHome } from './captureTypes'
import type { AuthUser, Job } from './types'
function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
      <path d="M5 10.5a7 7 0 0 0 14 0" />
      <path d="M12 17.5v4" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 7.5h3.5l2-3h6l2 3h3.5v12h-17z" />
      <circle cx="12" cy="13.2" r="3.8" />
    </svg>
  )
}

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
      Math.max(home?.unfiledCount ?? 0, localUploadedUnfiled) + localUnfiled,
    workshopCount = home?.workshop.availableCount ?? 0,
    workshopCountLabel =
      workshopCount > 0
        ? `${workshopCount} ${workshopCount === 1 ? 'thing' : 'things'}`
        : '',
    workshopPreview = home?.workshop.preview.length
      ? home.workshop.preview.join(' · ') +
        (workshopCount > home.workshop.preview.length
          ? ` · +${workshopCount - home.workshop.preview.length} more`
          : '')
      : '',
    otherJobsSummary = home
      ? [
          home.otherJobs.planningCount > 0 &&
            `${home.otherJobs.planningCount} planning`,
          home.otherJobs.finishedCount > 0 &&
            `${home.otherJobs.finishedCount} finished`,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  return (
    <main className="capture-home">
      <header className="capture-home-header">
        <h1>The Job Book</h1>
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
          <span className="capture-home-mic">
            <MicIcon />
          </span>
          <span className="capture-home-record-text">
            Record
            <small>About any job</small>
          </span>
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
        <CameraIcon />
        Add photo
      </button>
      {count > 0 && (
        <button
          type="button"
          className="capture-home-unfiled"
          onClick={onOpenUnfiled}
        >
          <span>
            <strong>Not filed yet</strong>
            <small>
              {count === 1
                ? '1 waiting for a job'
                : `${count} waiting for a job`}
            </small>
          </span>
          <span className="capture-home-row-end">
            <b>{count}</b>
            <span className="capture-chevron" aria-hidden="true">
              ›
            </span>
          </span>
        </button>
      )}
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
              <small>{formatJobDay(j.lastActivityAt)}</small>
            </span>
            <span className="capture-home-row-end">
              {j.toCheckCount > 0 && (
                <span className="capture-home-tag">
                  {j.toCheckCount} to check
                </span>
              )}
              <span className="capture-chevron" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
        ))}
      </section>
      <section aria-label="Workshop" className="capture-home-section">
        <h2>Workshop</h2>
        <button
          type="button"
          className="capture-home-job"
          aria-label={[
            'Workshop, what’s in there',
            workshopCountLabel,
            workshopPreview,
          ]
            .filter(Boolean)
            .join(', ')}
          onClick={onWorkshop}
        >
          <span>
            <strong>What’s in there</strong>
            {workshopPreview && <small>{workshopPreview}</small>}
          </span>
          <span className="capture-home-row-end">
            {workshopCountLabel && (
              <span className="capture-home-count">{workshopCountLabel}</span>
            )}
            <span className="capture-chevron" aria-hidden="true">
              ›
            </span>
          </span>
        </button>
      </section>
      {known && (
        <section
          aria-label="Other jobs and new job"
          className="capture-home-section capture-home-more"
        >
          <button
            type="button"
            className="capture-home-job"
            onClick={onOpenAllJobs}
          >
            <span>
              <strong>Other jobs</strong>
              {otherJobsSummary && <small>{otherJobsSummary}</small>}
            </span>
            <span className="capture-home-row-end">
              <span className="capture-chevron" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          <button
            type="button"
            className="capture-home-job capture-home-new"
            onClick={onNewJob}
          >
            <span>
              <span aria-hidden="true">+ </span>New job
            </span>
          </button>
        </section>
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
      <footer className="capture-home-footer">
        <button type="button" className="capture-link" onClick={onLogout}>
          Log out
        </button>
      </footer>
    </main>
  )
}
