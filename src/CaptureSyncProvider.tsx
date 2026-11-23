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
import type { CaptureFlowState, CaptureTarget } from './captureTypes'
import { useRecorder, isRecordingSupported } from './useRecorder'
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
  getLatestSavedPhoto,
  createCapturedPhoto,
  persistCapturedPhoto,
  getFailedPhotos,
} from './capturePersistence'
import { durationBucket, mimeTypeFamily, track } from './analytics'
import RecordingControls from './RecordingControls'

function useCaptureRoot() {
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [revision, setRevision] = useState(0),
    [flowState, setFlowState] = useState<
      (CaptureFlowState & { boundary: string }) | null
    >(null),
    [photoError, setPhotoError] = useState(''),
    [message, setMessage] = useState('')
  const sync = useSync(
    useCallback(() => {
      setRevision((v) => v + 1)
    }, []),
    syncEnabled,
  )
  const setFlow = useCallback(
    (flow: CaptureFlowState | null) =>
      setFlowState(flow ? { ...flow, boundary: getCaptureSessionId() } : null),
    [],
  )
  const flow = flowState?.boundary === getCaptureSessionId() ? flowState : null
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
  const latestNote = getLatestSavedCapture(),
    latestPhoto = getLatestSavedPhoto()
  useEffect(() => {
    const saved = latestNote ?? latestPhoto
    if (!saved) return
    if (saved.captureSessionId === getCaptureSessionId()) {
      const target: CaptureTarget =
        'clientNoteId' in saved
          ? {
              kind: 'note',
              localId: saved.clientNoteId,
              jobId: saved.jobId,
              at: saved.capturedAt,
              context: saved.captureContext ?? 'job',
            }
          : {
              kind: 'photo',
              localId: saved.clientPhotoId,
              jobId: saved.jobId,
              at: saved.capturedAt,
              context: saved.captureContext ?? 'home',
            }
      setFlow({ mode: saved.jobId ? 'saved' : 'picker', target })
    }
    dismissSavedCapture()
  }, [latestNote, latestPhoto, setFlow])
  const previousBoundary = useRef(getCaptureSessionId())
  useEffect(() => {
    const boundary = getCaptureSessionId()
    if (previousBoundary.current !== boundary) {
      previousBoundary.current = boundary
      setFlow(null)
      setMessage('')
      setPhotoError('')
    }
  }, [ownerSnapshot, setFlow])
  const pickPhoto = useCallback(
    async (file: File, jobId: string | null = null) => {
      setPhotoError('')
      try {
        const photo = await createCapturedPhoto(file, jobId)
        return await persistCapturedPhoto(photo)
      } catch (e) {
        setPhotoError(
          e instanceof Error
            ? e.message
            : 'Could not save that photo. Try again.',
        )
        return false
      }
    },
    [],
  )
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
            context: jobId ? 'job' : 'home',
            duration_bucket: durationBucket(result.durationMs),
            mime_type_family: mimeTypeFamily(result.mimeType),
          })
          recordingSession.current = null
          const note = createCapturedNote(result, jobId, identity)
          if (await persistCapturedNote(note)) void sync.syncAll()
        })
        if (started) {
          track('record_started', {
            context: jobId ? 'job' : 'home',
            ...(jobId ? { job_id: jobId } : {}),
          })
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
    supported: isRecordingSupported,
    revision,
    flow,
    setFlow,
    message,
    setMessage,
    pickPhoto,
    photoError,
    clearPhotoError: () => setPhotoError(''),
    openFile: (target: CaptureTarget) => setFlow({ mode: 'picker', target }),
    openMove: (target: CaptureTarget) => setFlow({ mode: 'move', target }),
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
  const failures = getFailedCaptures()
  const photos = getFailedPhotos()
  if (!failures.length && !photos.length) return null
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
      {photos.map(({ photo, saving }) => (
        <div
          className="capture-save-failure"
          role="alert"
          key={photo.clientPhotoId}
        >
          <p>
            This photo wasn’t saved. Keep this page open and try saving again.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void persistCapturedPhoto(photo)
            }}
          >
            {saving ? 'Trying to save…' : 'Try saving photo again'}
          </button>
        </div>
      ))}
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
