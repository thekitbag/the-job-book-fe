import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CaptureScreen from '../CaptureScreen'
import { saveNote, getNotesForJob } from '../db'
import { makeNote } from './helpers'
import type { RecordingResult, UseRecorderReturn } from '../useRecorder'
import type { UploadNoteResponse } from '../api'
import { getDraftFacts, getReviewQueue } from '../api'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn().mockResolvedValue([]),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn().mockResolvedValue([]),
  getReviewQueue: vi.fn().mockResolvedValue({ jobId: 'job-test-001', generatedAt: '', sections: [], alreadyRemembered: [] }),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB = {
  id: 'job-test-001',
  title: 'Garden Room',
  jobType: 'garden_room' as const,
  roughLocationOrLabel: 'Test site',
  status: 'active' as const,
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const EMPTY_QUEUE = { jobId: JOB.id, generatedAt: '', sections: [], alreadyRemembered: [] }

async function getRecorderMock() {
  const mod = await import('../useRecorder')
  return mod.useRecorder() as UseRecorderReturn & {
    start: ReturnType<typeof vi.fn>
  }
}

async function getUploadMock() {
  const mod = await import('../api')
  return vi.mocked(mod.uploadNote)
}

function mockUploadSuccess(noteId = 'srv-001'): (n: Parameters<typeof import('../api').uploadNote>[0]) => Promise<UploadNoteResponse> {
  return (n) => Promise.resolve({ noteId, clientNoteId: n.clientNoteId, status: 'uploaded', isDuplicate: false })
}

/** Simulate the recorder calling its onComplete callback */
async function simulateRecordingComplete(result: RecordingResult) {
  const recorder = await getRecorderMock()
  const calls = recorder.start.mock.calls
  const onComplete: (r: RecordingResult) => void = calls[calls.length - 1]?.[0]
  await act(async () => { onComplete(result) })
}

const FAKE_RESULT: RecordingResult = {
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm;codecs=opus',
  durationMs: 8_000,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CaptureScreen', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getDraftFacts).mockResolvedValue([])
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  it('shows the current job title', async () => {
    render(<CaptureScreen job={JOB} />)
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
    expect(screen.getByText(/current job/i)).toBeInTheDocument()
  })

  it('has no category picker on the capture screen', () => {
    render(<CaptureScreen job={JOB} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/categor/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/material type/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/classify/i)).not.toBeInTheDocument()
  })

  it('shows the storage explainer on first visit and hides it after dismissal', async () => {
    const user = userEvent.setup()
    render(<CaptureScreen job={JOB} />)
    expect(screen.getByText(/save the recording during the pilot/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByRole('button', { name: /got it/i })).not.toBeInTheDocument()
  })

  it('saves note to IndexedDB before upload completes', async () => {
    // Upload hangs — never resolves during this test
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(() => new Promise(() => {}))

    const user = userEvent.setup()
    render(<CaptureScreen job={JOB} />)

    await user.click(screen.getByRole('button', { name: /record/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    // Note must be in IndexedDB before the pending upload resolves
    const notes = await getNotesForJob(JOB.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].localState).toBe('saved_local')
  })

  it('offline capture survives page reload (note persists in IndexedDB)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const user = userEvent.setup()
    const { unmount } = render(<CaptureScreen job={JOB} />)

    await user.click(screen.getByRole('button', { name: /record/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    // Simulate page reload by unmounting
    unmount()

    // Note must still be in IndexedDB
    const notes = await getNotesForJob(JOB.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].mimeType).toBe('audio/webm;codecs=opus')
  })

  it('mocked successful upload shows note as voice note saved', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const user = userEvent.setup()
    render(<CaptureScreen job={JOB} />)

    await user.click(screen.getByRole('button', { name: /record/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    // Initially shows local state
    await waitFor(() => {
      expect(screen.getByText(/saved on phone/i)).toBeInTheDocument()
    })

    // After upload completes shows voice note saved
    await waitFor(() => {
      expect(screen.getByText(/voice note saved/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('retrying a failed note does not create a duplicate in the list', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    // Pre-populate IndexedDB with a note that needs attention
    const note = makeNote({ jobId: JOB.id, localState: 'upload_needs_attention', uploadAttemptCount: 5 })
    await saveNote(note)

    const user = userEvent.setup()
    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    })

    // Verify no duplication via IndexedDB count
    const allNotes = await getNotesForJob(JOB.id)
    expect(allNotes).toHaveLength(1)
  })

  it('online retry queues and uploads notes saved while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const user = userEvent.setup()
    render(<CaptureScreen job={JOB} />)

    // Record while offline
    await user.click(screen.getByRole('button', { name: /record/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    // Note is saved locally offline — shows "Saved on this phone"
    await waitFor(() => {
      expect(screen.getByText(/saved on this phone/i)).toBeInTheDocument()
    })
    expect(mockUpload).not.toHaveBeenCalled()

    // Come back online
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })

    await waitFor(() => {
      expect(screen.getByText(/voice note saved/i)).toBeInTheDocument()
    }, { timeout: 3000 })

    expect(mockUpload).toHaveBeenCalledOnce()
  })

  it('recording saves local note with the selected job id', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(() => new Promise(() => {}))

    const user = userEvent.setup()
    render(<CaptureScreen job={JOB} />)

    await user.click(screen.getByRole('button', { name: /record/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    const notes = await getNotesForJob(JOB.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].jobId).toBe(JOB.id)
  })

  it('Switch job button is visible when onSwitchJob prop is provided', () => {
    const onSwitchJob = vi.fn()
    render(<CaptureScreen job={JOB} onSwitchJob={onSwitchJob} />)
    expect(screen.getByRole('button', { name: /switch job/i })).toBeInTheDocument()
  })

  it('Switch job is not shown when onSwitchJob prop is omitted', () => {
    render(<CaptureScreen job={JOB} />)
    expect(screen.queryByRole('button', { name: /switch job/i })).not.toBeInTheDocument()
  })

  it('Things to check shows draft count when queue has items', async () => {
    const draftItem = (id: string, summary: string) => ({
      id,
      status: 'draft' as const,
      summary,
      kind: 'single' as const,
      reviewLabel: '',
      confidenceLabel: 'high' as const,
      uncertaintyFlags: [],
      sourceCandidateFactIds: [],
      sourceContext: [],
      proposedMemory: {
        memoryType: 'used_material' as const,
        summary,
        materialName: null,
        quantity: null,
        unit: null,
        supplierName: null,
        deliveryTiming: null,
        locationOrUse: null,
      },
    })
    vi.mocked(getReviewQueue).mockResolvedValue({
      jobId: JOB.id,
      generatedAt: '',
      sections: [{
        key: 'materials',
        label: 'Materials',
        items: [draftItem('i1', 'Item 1'), draftItem('i2', 'Item 2'), draftItem('i3', 'Item 3')],
      }],
      alreadyRemembered: [],
    })

    render(<CaptureScreen job={JOB} onOpenReviewQueue={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('3 things to check')).toBeInTheDocument()
    })
  })

  it('Things to check shows singular when one draft item', async () => {
    const draftItem = {
      id: 'i1',
      status: 'draft' as const,
      summary: 'Item 1',
      kind: 'single' as const,
      reviewLabel: '',
      confidenceLabel: 'high' as const,
      uncertaintyFlags: [],
      sourceCandidateFactIds: [],
      sourceContext: [],
      proposedMemory: {
        memoryType: 'used_material' as const,
        summary: 'Item 1',
        materialName: null,
        quantity: null,
        unit: null,
        supplierName: null,
        deliveryTiming: null,
        locationOrUse: null,
      },
    }
    vi.mocked(getReviewQueue).mockResolvedValue({
      jobId: JOB.id,
      generatedAt: '',
      sections: [{ key: 'materials', label: 'Materials', items: [draftItem] }],
      alreadyRemembered: [],
    })

    render(<CaptureScreen job={JOB} onOpenReviewQueue={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('1 thing to check')).toBeInTheDocument()
    })
  })

  it('Things to check shows Nothing to check when queue is empty', async () => {
    render(<CaptureScreen job={JOB} onOpenReviewQueue={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Nothing to check')).toBeInTheDocument()
    })
  })

  it('file size is not shown on note cards', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => screen.getByText(/voice note saved/i))
    // No byte/KB/MB size text in any note card
    expect(screen.queryByText(/\d+\s*(B|KB|MB|bytes)/i)).not.toBeInTheDocument()
  })

  it('source history section is visible by default', () => {
    render(<CaptureScreen job={JOB} />)
    expect(screen.getByRole('region', { name: /source history/i })).toBeInTheDocument()
  })

  it('does not show Synced as uploaded label — uses Voice note saved', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => screen.getByText(/voice note saved/i))
    expect(screen.queryByText(/^synced$/i)).not.toBeInTheDocument()
  })

  it('offline locally-saved note shows Saved on this phone', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const note = makeNote({ jobId: JOB.id, localState: 'saved_local', serverNoteId: null })
    await saveNote(note)

    render(<CaptureScreen job={JOB} />)

    await waitFor(() => {
      expect(screen.getByText('Saved on this phone')).toBeInTheDocument()
    })
  })

  it('Job memory button is shown when onOpenJobMemory prop is provided', () => {
    render(<CaptureScreen job={JOB} onOpenJobMemory={() => {}} />)
    expect(screen.getByRole('button', { name: /job memory/i })).toBeInTheDocument()
  })

  it('Things to check button calls onOpenReviewQueue', async () => {
    const onOpenReviewQueue = vi.fn()
    render(<CaptureScreen job={JOB} onOpenReviewQueue={onOpenReviewQueue} />)
    const btn = screen.getByRole('button', { name: /things to check/i })
    btn.click()
    expect(onOpenReviewQueue).toHaveBeenCalledTimes(1)
  })
})
