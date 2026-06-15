import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
  jobType: 'garden_room' as const,
  roughLocationOrLabel: 'Test site',
  status: 'active' as const,
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
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

  it('shows Show transcript toggle when transcript is ready, hides text by default', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-001',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'ready', extractionStatus: null },
    }])
    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-001',
      status: 'ready',
      text: 'Two bags of sand and one tonne of gravel.',
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /show transcript/i })).toBeInTheDocument()
    })
    expect(screen.queryByText('Two bags of sand and one tonne of gravel.')).not.toBeInTheDocument()
  })

  it('reveals transcript text on Show transcript click', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001b' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-001b',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'ready', extractionStatus: null },
    }])
    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-001b',
      status: 'ready',
      text: 'Two bags of sand and one tonne of gravel.',
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => screen.getByRole('button', { name: /show transcript/i }))
    fireEvent.click(screen.getByRole('button', { name: /show transcript/i }))
    expect(screen.getByText('Two bags of sand and one tonne of gravel.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide transcript/i })).toBeInTheDocument()
  })

  it('collapses transcript again on Hide transcript click', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001c' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-001c',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'ready', extractionStatus: null },
    }])
    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-001c',
      status: 'ready',
      text: 'Two bags of sand and one tonne of gravel.',
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => screen.getByRole('button', { name: /show transcript/i }))
    fireEvent.click(screen.getByRole('button', { name: /show transcript/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide transcript/i }))
    expect(screen.queryByText('Two bags of sand and one tonne of gravel.')).not.toBeInTheDocument()
  })

  it('fetches text via the individual endpoint only for ready/failed, not for waiting', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-002' })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-002',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'waiting', extractionStatus: null },
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
      transcript: { status: 'transcribing', extractionStatus: null },
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
      transcript: { status: 'failed', extractionStatus: null },
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
      expect(screen.getByRole('button', { name: /show transcript/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/confirmed memory/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/trusted memory/i)).not.toBeInTheDocument()
  })

  it('renders cached ready transcript toggle without any API call, text hidden by default', async () => {
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
      expect(screen.getByRole('button', { name: /show transcript/i })).toBeInTheDocument()
    })
    expect(screen.queryByText('Cached transcript text.')).not.toBeInTheDocument()
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

    // Both notes have final status; failed note always shows its message without a toggle
    await waitFor(() => {
      expect(screen.getByText(/transcription failed/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /show transcript/i })).toBeInTheDocument()
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

    mockGetStatuses.mockResolvedValue([{
      id: 'srv-010',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'ready', extractionStatus: null },
    }])
    mockGetTranscript.mockResolvedValue({
      noteId: 'srv-010',
      status: 'ready',
      text: 'Matched by id.',
      errorCode: null,
    })

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => screen.getByRole('button', { name: /show transcript/i }))
    fireEvent.click(screen.getByRole('button', { name: /show transcript/i }))
    expect(screen.getByText('Matched by id.')).toBeInTheDocument()
  })
})
