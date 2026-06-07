import { useCallback, useRef, useState } from 'react'

const MAX_DURATION_MS = 3 * 60 * 1000

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export const isRecordingSupported =
  window.isSecureContext &&
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function'

export type RecorderState = 'idle' | 'recording' | 'stopping'

export interface RecordingResult {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface UseRecorderReturn {
  state: RecorderState
  elapsedMs: number
  mimeType: string
  permissionError: string | null
  start: (onComplete: (result: RecordingResult) => void) => Promise<void>
  stop: () => void
}

export function useRecorder(): UseRecorderReturn {
  const mimeType = getSupportedMimeType()
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef<((r: RecordingResult) => void) | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const start = useCallback(async (onComplete: (r: RecordingResult) => void) => {
    setPermissionError(null)
    chunksRef.current = []
    onCompleteRef.current = onComplete

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied'
      setPermissionError(msg)
      return
    }

    const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
    const recorder = new MediaRecorder(stream, options)
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      clearTimer()
      stream.getTracks().forEach(t => t.stop())
      const durationMs = Date.now() - startTimeRef.current
      const type = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type })
      setState('idle')
      setElapsedMs(0)
      const cb = onCompleteRef.current
      onCompleteRef.current = null
      cb?.({ blob, mimeType: type, durationMs })
    }

    recorder.start(250)
    startTimeRef.current = Date.now()
    setElapsedMs(0)
    setState('recording')

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      setElapsedMs(elapsed)
      if (elapsed >= MAX_DURATION_MS && recorder.state === 'recording') {
        recorder.stop()
        setState('stopping')
        clearTimer()
      }
    }, 250)
  }, [mimeType, clearTimer])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
      setState('stopping')
      clearTimer()
    }
  }, [clearTimer])

  return { state, elapsedMs, mimeType, permissionError, start, stop }
}
