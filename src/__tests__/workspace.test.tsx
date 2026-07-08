import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import { saveNote, getNotesForJob } from '../db'
import { makeNote } from './helpers'
import type { RecordingResult, UseRecorderReturn } from '../useRecorder'
import type { UploadNoteResponse } from '../api'
import type { ReviewQueue } from '../types'
import { getReviewQueue } from '../api'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-x', photos: [] })),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn(() => Promise.resolve([])),
  getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-test-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
  getMemoryView: vi.fn(() => Promise.resolve({ job: { id: 'job-test-001', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'active', createdAt: '', updatedAt: '' }, generatedAt: '', sections: [], stillToCheck: { count: 0, items: [] }, costSummary: undefined })),
  getBudgetSummary: vi.fn(() => Promise.reject(new Error('no budget'))),
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
  roughLocationOrLabel: '14 Oakfield Rd',
  status: 'active' as const,
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

const EMPTY_QUEUE: ReviewQueue = { jobId: JOB.id, generatedAt: '', sections: [], alreadyRemembered: [] }

const noop = () => {}
function renderWorkspace(props: Partial<React.ComponentProps<typeof CurrentJobWorkspace>> = {}) {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={noop} onSwitchJob={noop} onLogout={noop} {...props} />)
}

async function getRecorderMock() {
  const mod = await import('../useRecorder')
  return mod.useRecorder() as UseRecorderReturn & { start: ReturnType<typeof vi.fn> }
}

async function getUploadMock() {
  const mod = await import('../api')
  return vi.mocked(mod.uploadNote)
}

function mockUploadSuccess(noteId = 'srv-001'): (n: Parameters<typeof import('../api').uploadNote>[0]) => Promise<UploadNoteResponse> {
  return (n) => Promise.resolve({ noteId, clientNoteId: n.clientNoteId, status: 'uploaded', isDuplicate: false })
}

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

function draftItem(id: string, summary: string) {
  return {
    id, status: 'draft' as const, summary, kind: 'single' as const, reviewLabel: '',
    confidenceLabel: 'high' as const, uncertaintyFlags: [], sourceCandidateFactIds: [], sourceContext: [],
    proposedMemory: {
      memoryType: 'used_material' as const, summary, materialName: null, quantity: null, unit: null,
      supplierName: null, deliveryTiming: null, locationOrUse: null,
      costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    },
  }
}
function queueWith(...items: ReturnType<typeof draftItem>[]): ReviewQueue {
  return { jobId: JOB.id, generatedAt: '', sections: [{ key: 'materials', label: 'Materials', items }], alreadyRemembered: [] }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CurrentJobWorkspace — shell', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  it('shows the current job title and location', () => {
    renderWorkspace()
    expect(screen.getByRole('heading', { name: 'Garden Room' })).toBeInTheDocument()
    expect(screen.getByText('14 Oakfield Rd')).toBeInTheDocument()
  })

  it('opens on Overview and exposes the five lens tabs', () => {
    renderWorkspace()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    for (const t of ['Overview', 'Spend', 'Labour', 'Used', 'Notes']) {
      expect(screen.getByRole('tab', { name: t })).toBeInTheDocument()
    }
  })

  it('Switch is always available', () => {
    renderWorkspace()
    expect(screen.getByRole('button', { name: /switch/i })).toBeInTheDocument()
  })

  it('Record is visible from every tab', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    for (const t of ['Overview', 'Spend', 'Labour', 'Used', 'Notes']) {
      await user.click(screen.getByRole('tab', { name: t }))
      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    }
  })

  it('has no category picker on the Overview', () => {
    renderWorkspace()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows the storage explainer on first visit and hides it after dismissal', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    expect(screen.getByText(/save the recording during the pilot/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByRole('button', { name: /got it/i })).not.toBeInTheDocument()
  })
})

describe('CurrentJobWorkspace — Things to check', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  it('shows the draft count when the queue has items', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue(queueWith(draftItem('i1', 'a'), draftItem('i2', 'b'), draftItem('i3', 'c')))
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('3 things to check')).toBeInTheDocument())
  })

  it('shows the singular form for one item', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue(queueWith(draftItem('i1', 'a')))
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('1 thing to check')).toBeInTheDocument())
  })

  it('shows a quiet Nothing to check when empty', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('Nothing to check')).toBeInTheDocument())
  })

  it('the urgent banner opens the review queue', async () => {
    const onOpenReviewQueue = vi.fn()
    vi.mocked(getReviewQueue).mockResolvedValue(queueWith(draftItem('i1', 'a'), draftItem('i2', 'b')))
    renderWorkspace({ onOpenReviewQueue })
    const banner = await screen.findByRole('button', { name: /things to check/i })
    banner.click()
    expect(onOpenReviewQueue).toHaveBeenCalledTimes(1)
  })
})

describe('CurrentJobWorkspace — capture', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  it('saves note to IndexedDB before upload completes', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(() => new Promise(() => {}))

    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    const notes = await getNotesForJob(JOB.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].localState).toBe('saved_local')
  })

  it('offline capture survives page reload (note persists in IndexedDB)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const user = userEvent.setup()
    const { unmount } = renderWorkspace()

    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await simulateRecordingComplete(FAKE_RESULT)
    unmount()

    const notes = await getNotesForJob(JOB.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].mimeType).toBe('audio/webm;codecs=opus')
  })

  it('successful upload shows note as voice note saved', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    // Scope to source history — the capture confirmation overlay also reflects state.
    const history = () => within(screen.getByRole('region', { name: /source history/i }))
    await waitFor(() => expect(history().getByText(/saved on phone/i)).toBeInTheDocument())
    await waitFor(() => expect(history().getByText(/voice note saved/i)).toBeInTheDocument(), { timeout: 3000 })
  })

  it('retrying a failed note does not create a duplicate', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const note = makeNote({ jobId: JOB.id, localState: 'upload_needs_attention', uploadAttemptCount: 5 })
    await saveNote(note)

    const user = userEvent.setup()
    renderWorkspace()

    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument())

    const allNotes = await getNotesForJob(JOB.id)
    expect(allNotes).toHaveLength(1)
  })

  it('online retry uploads notes saved while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    const history = () => within(screen.getByRole('region', { name: /source history/i }))
    await waitFor(() => expect(history().getByText(/saved on this phone/i)).toBeInTheDocument())
    expect(mockUpload).not.toHaveBeenCalled()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })

    await waitFor(() => expect(history().getByText(/voice note saved/i)).toBeInTheDocument(), { timeout: 3000 })
    expect(mockUpload).toHaveBeenCalledOnce()
  })

  it('shows a capture confirmation after recording that can be dismissed', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(mockUploadSuccess())

    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    const dialog = await screen.findByRole('dialog', { name: /recording saved/i })
    expect(within(dialog).getByText(/voice note saved|saving your note/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /done/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('recording saves local note with the selected job id', async () => {
    const mockUpload = await getUploadMock()
    mockUpload.mockImplementation(() => new Promise(() => {}))

    const user = userEvent.setup()
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: /start recording/i }))
    await simulateRecordingComplete(FAKE_RESULT)

    const notes = await getNotesForJob(JOB.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].jobId).toBe(JOB.id)
  })
})

describe('CurrentJobWorkspace — source history / no pipeline language', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  it('source history region is present', () => {
    renderWorkspace()
    expect(screen.getByRole('region', { name: /source history/i })).toBeInTheDocument()
  })

  it('does not show file size on note cards', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)
    renderWorkspace()
    await waitFor(() => screen.getByText(/voice note saved/i))
    expect(screen.queryByText(/\d+\s*(B|KB|MB|bytes)/i)).not.toBeInTheDocument()
  })

  it('does not use Synced as the uploaded label', async () => {
    const note = makeNote({ jobId: JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)
    renderWorkspace()
    await waitFor(() => screen.getByText(/voice note saved/i))
    expect(screen.queryByText(/^synced$/i)).not.toBeInTheDocument()
  })

  it('offline locally-saved note shows Saved on this phone', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const note = makeNote({ jobId: JOB.id, localState: 'saved_local', serverNoteId: null })
    await saveNote(note)
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('Saved on this phone')).toBeInTheDocument())
  })
})
