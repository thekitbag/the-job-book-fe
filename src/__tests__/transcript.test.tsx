import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CaptureScreen from '../CaptureScreen'
import { saveNote } from '../db'
import { getJobNoteStatuses, getNoteTranscript, getDraftFacts } from '../api'
import { makeNote } from './helpers'
import type { UseRecorderReturn } from '../useRecorder'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn().mockResolvedValue([]),
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

const mockGetStatuses = vi.mocked(getJobNoteStatuses)
const mockGetTranscript = vi.mocked(getNoteTranscript)
const mockGetDraftFacts = vi.mocked(getDraftFacts)

describe('transcript visibility', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    // getDraftFacts is called whenever any note has extractionStatus === 'ready'.
    // Provide a default to avoid unhandled "undefined.then" errors after vi.resetAllMocks().
    mockGetDraftFacts.mockResolvedValue([])
  })

  it('shows ready transcript text with "what the system heard" label', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)

    // List poll returns status only (BE shape: id not noteId)
    mockGetStatuses.mockResolvedValue([{
      id: 'srv-001',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'ready' },
      extraction: null,
    }])
    // Text fetched separately because status is final
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

  it('fetches text via the individual endpoint only for ready/failed, not for waiting', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-002' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-002',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'waiting' },
      extraction: null,
    }])

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/waiting for transcript/i)).toBeInTheDocument()
    })

    // Individual transcript endpoint must NOT be called for waiting state
    expect(mockGetTranscript).not.toHaveBeenCalled()
  })

  it('fetches text via the individual endpoint only for ready/failed, not for transcribing', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-003' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-003',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'transcribing' },
      extraction: null,
    }])

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/transcribing/i)).toBeInTheDocument()
    })

    expect(mockGetTranscript).not.toHaveBeenCalled()
  })

  it('shows transcription failed without implying the recording was lost', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-004' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-004',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'failed' },
      extraction: null,
    }])
    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-004',
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

  it('does not present transcript as confirmed job memory', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-005',
      transcriptStatus: 'ready',
      transcriptText: 'Replace the guttering on the north side.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText(/what the system heard/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/confirmed memory/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/trusted memory/i)).not.toBeInTheDocument()
  })

  it('renders cached ready transcript without any API call', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-006',
      transcriptStatus: 'ready',
      transcriptText: 'Cached transcript text.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText('Cached transcript text.')).toBeInTheDocument()
    })
    expect(mockGetStatuses).not.toHaveBeenCalled()
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

  it('does not poll when all notes already have a final transcript status', async () => {
    const ready = makeNote({
      jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-007',
      transcriptStatus: 'ready', transcriptText: 'Done.', extractionStatus: 'ready',
    })
    const failed = makeNote({
      jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-008',
      transcriptStatus: 'failed', extractionStatus: null,
    })
    await saveNote(ready)
    await saveNote(failed)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText('Done.')).toBeInTheDocument()
    })
    expect(mockGetStatuses).not.toHaveBeenCalled()
    expect(mockGetTranscript).not.toHaveBeenCalled()
  })

  it('polls the list endpoint with the correct jobId', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-009' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([])

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(mockGetStatuses).toHaveBeenCalledWith(JOB.id)
    })
    // No final-status notes returned — individual endpoint should not be called
    expect(mockGetTranscript).not.toHaveBeenCalled()
  })

  it('matches server rows by id, not noteId', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-010' })
    await saveNote(note)

    // Row uses `id` field (BE contract), no `noteId` field
    mockGetStatuses.mockResolvedValue([{
      id: 'srv-010',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'ready' },
      extraction: null,
    }])
    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-010',
      status: 'ready',
      text: 'Matched by id.',
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText('Matched by id.')).toBeInTheDocument()
    })
  })
})
