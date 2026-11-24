import { isRecordingSupported, type UseRecorderReturn } from './useRecorder'
import { formatDuration } from './SourceHistory'
const MAX_DURATION_MS = 3 * 60 * 1000
export default function RecordingControls({
  recorder,
  onRecord,
  jobTitle,
}: {
  recorder: UseRecorderReturn
  onRecord: () => void
  jobTitle?: string | null
}) {
  return (
    <div className="ws-record-bar">
      {!isRecordingSupported ? (
        <p className="ws-record-unsupported">
          {!window.isSecureContext
            ? 'Open this page over https:// to enable the microphone.'
            : 'Recording is not supported in this browser. Try Chrome or Safari.'}
        </p>
      ) : recorder.state === 'idle' ? (
        <button
          className="ws-record-btn"
          onClick={onRecord}
          aria-label="Start recording"
        >
          <span className="ws-record-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
            </svg>
          </span>
          {/* The persistent Record bar names its destination job on every
                screen (not "Tap · say it · done", which narrated the control) so
                a recording can never quietly land on the wrong job. */}
          <span className="ws-record-text">
            <span className="ws-record-title">Record</span>
            <span className="ws-record-sub">
              {jobTitle ? `to ${jobTitle}` : 'Record on this phone'}
            </span>
          </span>
        </button>
      ) : (
        <div className="ws-recording-active">
          <div className="capture-recording-destination">
            <strong>Recording</strong>
            <span>{jobTitle ? `to ${jobTitle}` : 'Not filed yet'}</span>
          </div>
          <span className="ws-rec-dot" aria-hidden="true" />
          <span
            className="ws-rec-elapsed"
            aria-live="polite"
            aria-atomic="true"
          >
            {formatDuration(recorder.elapsedMs)}
            <span className="ws-rec-max">
              {' '}
              / {formatDuration(MAX_DURATION_MS)}
            </span>
          </span>
          <button
            className="ws-stop-btn"
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
  )
}
