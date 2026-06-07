import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CaptureScreen from '../CaptureScreen'
import { saveNote } from '../db'
import { getNoteTranscript } from '../api'
import { makeNote } from './helpers'
import type { UseRecorderReturn } from '../useRecorder'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getNoteTranscript: vi.fn(),
}))

vi.mock('../useRecorder', () => {
  const mockRecorder: UseRecorderReturn = {
    state: 'idle',
    elapsedMs: 0,
    mimeType: 'audio/webm;codecs=opus',
    permissionError: null,
    start: vi.fn(),
    stop: vi.fn(),
  }
  return {
    isRecordingSupported: true,
    getSupportedMimeType: () => 'audio/webm;codecs=opus',
    useRecorder: () => mockRecorder,
  }
})

const JOB = {
  id: 'job-test-001',
  title: 'Garden Room',
  roughLocationOrLabel: 'Test site',
  status: 'active' as const,
}

const mockGetTranscript = vi.mocked(getNoteTranscript)

describe('transcript visibility', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  it('shows ready transcript text with "what the system heard" label', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)

    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-001',
      status: 'ready',
      text: 'Two bags of sand and one tonne of gravel.',
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/what the system heard/i)).toBeInTheDocument()
      expect(screen.getByText('Two bags of sand and one tonne of gravel.')).toBeInTheDocument()
    })
  })

  it('does not present transcript as confirmed job memory', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-001a',
      transcriptStatus: 'ready',
      transcriptText: 'Replace the guttering on the north side.',
    })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/what the system heard/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/confirmed memory/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/trusted memory/i)).not.toBeInTheDocument()
  })

  it('shows transcription failed without implying the recording was lost', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-002' })
    await saveNote(note)

    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-002',
      status: 'failed',
      text: null,
      errorCode: 'PROVIDER_ERROR',
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/transcription failed/i)).toBeInTheDocument()
      expect(screen.getByText(/recording is still saved/i)).toBeInTheDocument()
    })
  })

  it('shows waiting state while transcript is pending', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-003',
      transcriptStatus: 'waiting',
    })
    await saveNote(note)

    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-003',
      status: 'waiting',
      text: null,
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/waiting for transcript/i)).toBeInTheDocument()
    })
  })

  it('renders cached ready transcript without an API call', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-004',
      transcriptStatus: 'ready',
      transcriptText: 'Cached transcript text.',
    })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/what the system heard/i)).toBeInTheDocument()
      expect(screen.getByText('Cached transcript text.')).toBeInTheDocument()
    })
    // No pollable notes (status already final) — getNoteTranscript must not be called
    expect(mockGetTranscript).not.toHaveBeenCalled()
  })

  it('does not show a transcript section for notes not yet uploaded', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'saved_local', serverNoteId: null })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/saved on phone/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/what the system heard/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/waiting for transcript/i)).not.toBeInTheDocument()
  })

  it('does not poll notes that already have a final transcript status', async () => {
    const ready = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-005',
      transcriptStatus: 'ready',
      transcriptText: 'Done.',
    })
    const failed = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-006',
      transcriptStatus: 'failed',
    })
    await saveNote(ready)
    await saveNote(failed)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText('Done.')).toBeInTheDocument()
    })
    expect(mockGetTranscript).not.toHaveBeenCalled()
  })

  it('polls using the job-scoped transcript endpoint', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-007' })
    await saveNote(note)

    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-007',
      status: 'waiting',
      text: null,
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(mockGetTranscript).toHaveBeenCalledWith(JOB.id, 'srv-007')
    })
  })
})
