import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useRecorder } from './useRecorder'
import { useSync } from './useSync'
import {
  captureIdentity,
  getCaptureSessionId,
  localOwnerSnapshot,
  subscribeLocalOwner,
} from './localOwner'
import {
  captureSaveSnapshot,
  createCapturedNote,
  dismissSavedCapture,
  getFailedCaptures,
  getLatestSavedCapture,
  persistCapturedNote,
  subscribeCaptureSaves,
} from './capturePersistence'
import { durationBucket, mimeTypeFamily, track } from './analytics'
import RecordingControls from './RecordingControls'

function useCaptureRoot() {
  const [syncEnabled, setSyncEnabled] = useState(true)
  const sync = useSync(
    useCallback(() => {}, []),
    syncEnabled,
  )
  const recorder = useRecorder()
  const ownerSnapshot = useSyncExternalStore(
    subscribeLocalOwner,
    localOwnerSnapshot,
  )
  useSyncExternalStore(subscribeCaptureSaves, captureSaveSnapshot)
  const recordingSession = useRef<string | null>(null),
    starting = useRef(false)
  const [recordingTitle, setRecordingTitle] = useState<string | null>(null)
  useEffect(() => {
    if (
      recordingSession.current &&
      recordingSession.current !== getCaptureSessionId() &&
      recorder.state === 'recording'
    )
      recorder.stop()
  }, [ownerSnapshot, recorder])
  const record = useCallback(
    async ({
      jobId,
      title,
    }: {
      jobId: string | null
      title: string | null
    }) => {
      if (starting.current || recorder.state !== 'idle') return
      starting.current = true
      const identity = captureIdentity()
      recordingSession.current = identity.captureSessionId
      setRecordingTitle(title)
      try {
        const started = await recorder.start(async (result) => {
          track('record_completed', {
            ...(jobId ? { job_id: jobId } : {}),
            duration_bucket: durationBucket(result.durationMs),
            mime_type_family: mimeTypeFamily(result.mimeType),
          })
          recordingSession.current = null
          const note = createCapturedNote(result, jobId, identity)
          if (await persistCapturedNote(note)) void sync.syncAll()
        })
        if (started) {
          track('record_started', jobId ? { job_id: jobId } : {})
          if (identity.captureSessionId !== getCaptureSessionId())
            recorder.stop()
        } else
          track('record_cancelled', {
            ...(jobId ? { job_id: jobId } : {}),
            error_kind: 'PERMISSION_DENIED',
          })
      } finally {
        starting.current = false
      }
    },
    [recorder, sync],
  )
  return {
    ...sync,
    recorder,
    record,
    recordingTitle,
    setSyncEnabled,
    lastSavedNote: getLatestSavedCapture(),
  }
}
type CaptureContextValue = ReturnType<typeof useCaptureRoot>
const Context = createContext<CaptureContextValue | null>(null)
export function useCaptureContext() {
  return useContext(Context)
}
export function CaptureSyncProvider({ children }: { children: ReactNode }) {
  const value = useCaptureRoot()
  return (
    <Context.Provider value={value}>
      {children}
      <CaptureSaveNotice />
    </Context.Provider>
  )
}
function CaptureSaveNotice() {
  useSyncExternalStore(subscribeCaptureSaves, captureSaveSnapshot)
  useSyncExternalStore(subscribeLocalOwner, localOwnerSnapshot)
  const failures = getFailedCaptures(),
    saved = getLatestSavedCapture()
  if (!failures.length && saved?.jobId !== null) return null
  return (
    <div className="capture-save-notice">
      {failures.map(({ note, error, saving }) => (
        <div
          className="capture-save-failure"
          role="alert"
          key={note.clientNoteId}
        >
          <p>
            This recording wasn’t saved. Keep this page open and try saving
            again.
          </p>
          {(error as { code?: string })?.code === 'STORAGE_BLOCKED' && (
            <p>Close other open Job Book pages, then try again.</p>
          )}
          <button
            type="button"
            className="btn-queue-save"
            disabled={saving}
            onClick={() => {
              void persistCapturedNote(note)
            }}
          >
            {saving ? 'Trying to save…' : 'Try saving again'}
          </button>
        </div>
      ))}
      {saved?.jobId === null && (
        <div role="status">
          <p>Recording saved on this phone.</p>
          <button type="button" onClick={dismissSavedCapture}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
/** Existing empty/error job views can record without inventing a job. Active
 * recording controls also survive navigation away from a job workspace. */
export function AuxiliaryCaptureControls({
  workspaceVisible,
  allowIdle,
}: {
  workspaceVisible: boolean
  allowIdle: boolean
}) {
  const capture = useCaptureContext()!
  if (workspaceVisible || (!allowIdle && capture.recorder.state === 'idle'))
    return null
  return (
    <RecordingControls
      recorder={capture.recorder}
      jobTitle={
        capture.recorder.state === 'idle' ? null : capture.recordingTitle
      }
      onRecord={() => {
        void capture.record({ jobId: null, title: null })
      }}
    />
  )
}
