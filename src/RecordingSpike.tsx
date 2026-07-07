import { useCallback, useEffect, useRef, useState } from 'react'

type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported'
type RecordingState = 'idle' | 'recording' | 'stopped'

interface RecordingResult {
  blob: Blob
  mimeType: string
  durationMs: number
  url: string
  downloadName: string
}

const MAX_DURATION_MS = 3 * 60 * 1000 // 3 minutes per spec

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function RecordingSpike() {
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [result, setResult] = useState<RecordingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [supportedMimeType] = useState(getSupportedMimeType)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isSecureContext = window.isSecureContext
  // mediaDevices is hidden by browsers on non-HTTPS non-localhost pages
  const isSupported = isSecureContext && typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // Revoke blob URL when component unmounts or result changes
  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url)
    }
  }, [result])

  useEffect(() => {
    return () => {
      stopTimer()
      stopStream()
    }
  }, [stopTimer, stopStream])

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      setPermissionState('unsupported')
      return
    }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Permission granted — keep stream for recording
      streamRef.current = stream
      setPermissionState('granted')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('denied') || msg.includes('Permission') || msg.includes('NotAllowed')) {
        setPermissionState('denied')
        setError('Microphone access was denied. Please allow microphone access in your browser settings.')
      } else {
        setPermissionState('denied')
        setError(`Could not access microphone: ${msg}`)
      }
    }
  }, [isSupported])

  const startRecording = useCallback(async () => {
    setError(null)
    setResult(null)
    chunksRef.current = []

    // Acquire stream if we don't already have one
    if (!streamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        setPermissionState('granted')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setPermissionState('denied')
        setError(`Could not access microphone: ${msg}`)
        return
      }
    }

    const options: MediaRecorderOptions = supportedMimeType ? { mimeType: supportedMimeType } : {}
    const recorder = new MediaRecorder(streamRef.current, options)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      stopTimer()
      const durationMs = Date.now() - startTimeRef.current
      const mimeType = recorder.mimeType || supportedMimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'webm'
      const downloadName = `spike-recording-${Date.now()}.${ext}`
      setResult({ blob, mimeType, durationMs, url, downloadName })
      setRecordingState('stopped')
      stopStream()
    }

    recorder.start(250) // collect chunks every 250 ms
    startTimeRef.current = Date.now()
    setElapsedMs(0)
    setRecordingState('recording')

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      setElapsedMs(elapsed)
      // Auto-stop at max duration
      if (elapsed >= MAX_DURATION_MS && mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }, 250)
  }, [supportedMimeType, stopTimer, stopStream])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const resetSpike = useCallback(() => {
    stopTimer()
    stopStream()
    setRecordingState('idle')
    setElapsedMs(0)
    setResult(null)
    setError(null)
  }, [stopTimer, stopStream])

  if (!isSupported) {
    return (
      <div className="spike-page">
        <h1>Recording Spike</h1>
        {!isSecureContext ? (
          <div className="status-box status-error">
            Page must be served over HTTPS to access the microphone. Make sure you are using the <strong>https://</strong> address, not http://.
          </div>
        ) : (
          <div className="status-box status-error">
            Browser recording not supported. Try Chrome or Safari on a recent OS.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="spike-page">
      <h1>Recording Spike</h1>
      <p className="subtitle">Story 1 – Phone recording proof of concept</p>

      {/* Permission section */}
      <section className="card">
        <h2>Microphone permission</h2>
        <div className={`status-box ${permissionState === 'granted' ? 'status-ok' : permissionState === 'denied' ? 'status-error' : 'status-neutral'}`}>
          {permissionState === 'unknown' && 'Not yet requested'}
          {permissionState === 'granted' && 'Granted'}
          {permissionState === 'denied' && 'Denied'}
          {permissionState === 'unsupported' && 'Unsupported browser'}
        </div>
        {permissionState === 'unknown' && (
          <button className="btn btn-secondary" onClick={requestPermission}>
            Request microphone access
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>

      {/* Recording controls */}
      <section className="card">
        <h2>Recording</h2>

        <div className="mime-info">
          Supported MIME type: <code>{supportedMimeType || 'none detected'}</code>
        </div>

        {recordingState === 'idle' && (
          <button
            className="btn btn-record"
            onClick={startRecording}
            disabled={permissionState === 'denied' || permissionState === 'unsupported'}
          >
            Start recording
          </button>
        )}

        {recordingState === 'recording' && (
          <div className="recording-controls">
            <div className="recording-indicator" aria-label="Recording in progress">
              <span className="dot" />
              Recording
            </div>
            <div className="elapsed" aria-live="polite">
              {formatDuration(elapsedMs)} / {formatDuration(MAX_DURATION_MS)}
            </div>
            <button className="btn btn-stop" onClick={stopRecording}>
              Stop
            </button>
          </div>
        )}

        {recordingState === 'stopped' && (
          <button className="btn btn-secondary" onClick={resetSpike}>
            Record another
          </button>
        )}
      </section>

      {/* Result section */}
      {result && (
        <section className="card">
          <h2>Recording result</h2>
          <dl className="result-meta">
            <dt>MIME type</dt>
            <dd><code>{result.mimeType}</code></dd>
            <dt>Duration</dt>
            <dd>{formatDuration(result.durationMs)} ({result.durationMs} ms)</dd>
            <dt>Blob size</dt>
            <dd>{formatBytes(result.blob.size)} ({result.blob.size.toLocaleString()} bytes)</dd>
          </dl>

          <h3>Playback</h3>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={result.url} className="audio-player" />

          <h3>Download / inspect</h3>
          <a
            className="btn btn-download"
            href={result.url}
            download={result.downloadName}
          >
            Download recording
          </a>
        </section>
      )}

      {/* Browser/device info for the test report */}
      <section className="card card-info">
        <h2>Device info (for test report)</h2>
        <dl className="result-meta">
          <dt>User agent</dt>
          <dd><code>{navigator.userAgent}</code></dd>
          <dt>Platform</dt>
          <dd><code>{navigator.platform}</code></dd>
          <dt>MediaRecorder supported</dt>
          <dd>{typeof MediaRecorder !== 'undefined' ? 'Yes' : 'No'}</dd>
          <dt>getUserMedia supported</dt>
          <dd>{typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'Yes' : 'No'}</dd>
        </dl>
      </section>
    </div>
  )
}
