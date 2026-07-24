import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import { saveNote, getNotesForJob } from '../db'
import { makeNote } from './helpers'
import type { RecordingResult, UseRecorderReturn } from '../useRecorder'
import type { UploadNoteResponse } from '../api'
import type { Job, JobPhoto, MemoryViewResponse, ReviewQueue } from '../types'
import { getBudgetSummary, getJobPhotos, getMemoryView, getReviewQueue, patchJob } from '../api'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-x', photos: [] })),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn(() => Promise.resolve([])),
  getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-test-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
  getMemoryView: vi.fn(() => Promise.resolve({ job: { id: 'job-test-001', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' }, generatedAt: '', sections: [], stillToCheck: { count: 0, items: [] }, costSummary: undefined })),
  getBudgetSummary: vi.fn(() => Promise.reject(new Error('no budget'))),
  patchJob: vi.fn(),
  getJobPayments: vi.fn(() => Promise.resolve({
    jobId: 'job-test-001', generatedAt: '',
    customerTotalAmount: null, customerTotalCurrency: null, customerTotalLabel: null,
    totalPaidAmount: null, totalPaidCurrency: null, totalPaidLabel: null,
    stillOwedAmount: null, stillOwedCurrency: null, stillOwedLabel: null,
    overpaid: false, overpaidAmount: null, overpaidLabel: null,
    payments: [],
  })),
  patchCustomerTotal: vi.fn(),
  createJobPayment: vi.fn(),
  patchJobPayment: vi.fn(),
  deleteJobPayment: vi.fn(),
  resolveApiUrl: (url: string) => url,
}))

// Track through the analytics wrapper so the status events can be asserted;
// the real bucket helpers are kept.
vi.mock('../analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../analytics')>()
  return { ...actual, track: vi.fn(), identifyAnalyticsUser: vi.fn(), resetAnalyticsUser: vi.fn() }
})

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
  status: 'started' as const,
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

  it('opens on job home with the stable section cards and no global tab strip', () => {
    renderWorkspace()
    // the old Overview | Spend | Labour | Used | Notes strip is gone
    expect(screen.queryByRole('tablist', { name: /job lenses/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument()
    for (const card of ['Open Budget', 'Open Payments', 'Open Labour', 'Open Materials', 'Open Job log']) {
      expect(screen.getByRole('button', { name: card })).toBeInTheDocument()
    }
  })

  it('shows no Variations anywhere', () => {
    renderWorkspace()
    expect(screen.queryByText(/variations?/i)).not.toBeInTheDocument()
  })

  it('Switch is always available', () => {
    renderWorkspace()
    expect(screen.getByRole('button', { name: /switch/i })).toBeInTheDocument()
  })

  it('Record is visible on home and every section workspace, and is the ONLY voice action', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    for (const card of ['Open Budget', 'Open Payments', 'Open Labour', 'Open Materials', 'Open Job log']) {
      await user.click(screen.getByRole('button', { name: card }))
      expect(screen.getAllByRole('button', { name: /record/i })).toHaveLength(1)
      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /job home/i }))
    }
  })

  it('each section card opens its workspace with a back affordance to job home', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    for (const [card, heading] of [
      ['Open Budget', 'Budget'], ['Open Payments', 'Payments'], ['Open Labour', 'Labour'],
      ['Open Materials', 'Materials'], ['Open Job log', 'Job log'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: card }))
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
      // the job title stays visible as workspace context
      expect(screen.getByText('Garden Room')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /job home/i }))
      expect(screen.getByRole('button', { name: 'Open Budget' })).toBeInTheDocument()
    }
  })

  it('has no category picker on the job home', () => {
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

  it('shows nothing at all when the queue is empty — no "Nothing to check" block', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
    renderWorkspace()
    await waitFor(() => expect(screen.queryByText(/still looking/i)).not.toBeInTheDocument())
    expect(screen.queryByText(/nothing to check/i)).not.toBeInTheDocument()
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

// ── Job front page: status, Job so far, latest activity ─────────────────────

function memItem(overrides: Partial<MemoryViewResponse['sections'][number]['items'][number]>) {
  return {
    id: Math.random().toString(36).slice(2),
    memoryType: 'ordered_material',
    summary: '',
    materialName: null, quantity: null, unit: null, supplierName: null,
    deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    uncertaintyFlags: [],
    sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '', updatedAt: '', source: null,
    ...overrides,
  }
}

function memoryViewWith(overrides: Partial<MemoryViewResponse>): MemoryViewResponse {
  return {
    job: { id: JOB.id, title: JOB.title, jobType: JOB.jobType, roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' },
    generatedAt: '',
    sections: [],
    stillToCheck: { count: 0, items: [] },
    ...overrides,
  }
}

function photo(overrides: Partial<JobPhoto>): JobPhoto {
  return {
    id: 'photo-1', jobId: JOB.id, descriptor: null, mimeType: 'image/jpeg', sizeBytes: 100,
    uploadedAt: '2026-07-08T09:00:00.000Z', createdAt: '2026-07-08T09:00:00.000Z', updatedAt: '2026-07-08T09:00:00.000Z',
    linkedNoteId: null, linkedMemoryItemId: null, linkedNote: null, linkedMemoryItem: null,
    imageUrl: 'https://example.com/p.jpg',
    ...overrides,
  }
}

describe('CurrentJobWorkspace — job status', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  it('renders API status "started" as "In progress" near the title', () => {
    renderWorkspace()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.queryByText('Started')).not.toBeInTheDocument()
  })

  it('shows an uppercase STATUS label above the chip', () => {
    renderWorkspace()
    expect(screen.getByText('Status')).toHaveClass('ws-status-label')
  })

  it('shows "Planning" with the amber planning chip class', () => {
    const job: Job = { ...JOB, status: 'planning' }
    renderWorkspace({ job })
    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change job status/i })).toHaveClass('ws-status-chip--planning')
  })

  it('shows "In progress" with the green started chip class', () => {
    renderWorkspace()
    expect(screen.getByRole('button', { name: /change job status/i })).toHaveClass('ws-status-chip--started')
  })

  it('shows "Finished" with the quiet finished chip class', () => {
    const job: Job = { ...JOB, status: 'finished' }
    renderWorkspace({ job })
    expect(screen.getByText('Finished')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change job status/i })).toHaveClass('ws-status-chip--finished')
  })

  it('shows "Archived" for an archived job', () => {
    const job: Job = { ...JOB, status: 'archived' }
    renderWorkspace({ job })
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('title-cases an unknown status as a fallback', () => {
    const job = { ...JOB, status: 'on_hold' } as unknown as Job
    renderWorkspace({ job })
    expect(screen.getByText('On hold')).toBeInTheDocument()
  })
})

describe('CurrentJobWorkspace — home card context', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  it('the Spend card shows known spend (bought + labour) against total budget', async () => {
    vi.mocked(getMemoryView).mockResolvedValue(memoryViewWith({
      costSummary: {
        orderedMaterials: { knownSpendAmount: '336', knownSpendCurrency: 'GBP', knownSpendLabel: null, includedMemoryItemIds: [], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [] },
        totalKnownCost: { knownSpendAmount: '2270', knownSpendCurrency: 'GBP', knownSpendLabel: null, includedMemoryItemIds: [] },
      },
    }))
    vi.mocked(getBudgetSummary).mockResolvedValue({
      jobId: JOB.id, generatedAt: '', categories: [], uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
      totals: { budgetAmount: '5000', budgetCurrency: 'GBP', knownSpendAmount: '2270', knownSpendCurrency: 'GBP', remainingAmount: '2730', remainingLabel: null, overBudget: false },
    })
    renderWorkspace()
    const card = screen.getByRole('button', { name: 'Open Budget' })
    await waitFor(() => expect(card).toHaveTextContent(/£2270/))
    expect(card).toHaveTextContent(/£5000/)
  })

  it('the Labour card shows the job-total labour hours, not just today', async () => {
    vi.mocked(getMemoryView).mockResolvedValue(memoryViewWith({
      labourHoursSummary: { totalHours: '24', totalLabel: '24h job total', days: [] },
    }))
    renderWorkspace()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Labour' })).toHaveTextContent(/24h/))
  })
})

describe('CurrentJobWorkspace — Materials workspace', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
    vi.mocked(getMemoryView).mockResolvedValue(memoryViewWith({
      sections: [
        { key: 'ordered_materials', label: 'Ordered materials', items: [memItem({ id: 'b1', memoryType: 'ordered_material', summary: '12× OSB sheet' })] },
        { key: 'used_materials', label: 'Used materials', items: [memItem({ id: 'u1', memoryType: 'used_material', summary: '1× Hardcore' })] },
        { key: 'leftovers', label: 'Leftovers', items: [memItem({ id: 'l1', memoryType: 'leftover_material', summary: 'Half bag of cement' })] },
      ],
    }))
  })

  async function openMaterials(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Open Materials' }))
  }

  it('contains Bought / Used / Left over inner tabs with Bought first', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openMaterials(user)
    for (const t of ['Bought', 'Used', 'Left over']) {
      expect(screen.getByRole('tab', { name: t })).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: 'Bought' })).toHaveAttribute('aria-selected', 'true')
  })

  it('bought, used, and leftover data all remain reachable', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openMaterials(user)
    await waitFor(() => expect(screen.getByText('12× OSB sheet')).toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: 'Used' }))
    expect(screen.getByText('1× Hardcore')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Left over' }))
    expect(screen.getByText('Half bag of cement')).toBeInTheDocument()
  })

  it('used and leftover items stay addable from their tabs', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openMaterials(user)
    await user.click(screen.getByRole('tab', { name: 'Used' }))
    expect(screen.getByRole('button', { name: /add used item/i })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Left over' }))
    expect(screen.getByRole('button', { name: /add leftover/i })).toBeInTheDocument()
  })
})

describe('CurrentJobWorkspace — Job log workspace', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
    vi.mocked(getMemoryView).mockResolvedValue(memoryViewWith({
      sections: [
        { key: 'general_notes', label: 'Notes', items: [memItem({ id: 'n1', memoryType: 'general_note', summary: 'Customer wants 3× more spots', createdAt: '2026-07-08T10:00:00.000Z' })] },
      ],
    }))
    vi.mocked(getJobPhotos).mockResolvedValue({
      jobId: JOB.id,
      photos: [
        photo({ id: 'ph-receipt', descriptor: 'Sydenhams receipt', linkedMemoryItemId: 'b1', linkedMemoryItem: { id: 'b1', memoryType: 'ordered_material', summary: '12× OSB sheet' } }),
        photo({ id: 'ph-fence', descriptor: 'Back fence before ripping out' }),
      ],
    })
  })

  async function openJobLog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Open Job log' }))
  }

  it('contains All / Notes / Photos filters with All first — no Receipts or Variations until supported', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openJobLog(user)
    for (const f of ['All', 'Notes', 'Photos']) {
      expect(screen.getByRole('tab', { name: f })).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /receipts/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /variations/i })).not.toBeInTheDocument()
  })

  it('All shows notes and photos together', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openJobLog(user)
    await waitFor(() => expect(screen.getByText(/customer wants 3× more spots/i)).toBeInTheDocument())
    expect(screen.getByText(/back fence before ripping out/i)).toBeInTheDocument()
  })

  it('existing notes remain reachable and addable under Notes', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openJobLog(user)
    await user.click(screen.getByRole('tab', { name: 'Notes' }))
    await waitFor(() => expect(screen.getByText(/customer wants 3× more spots/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /add note/i })).toBeInTheDocument()
  })

  it('existing photos remain reachable under Photos', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openJobLog(user)
    await user.click(screen.getByRole('tab', { name: 'Photos' }))
    await waitFor(() => expect(screen.getByText('Sydenhams receipt')).toBeInTheDocument())
    expect(screen.getByText('Back fence before ripping out')).toBeInTheDocument()
  })

})

describe('CurrentJobWorkspace — latest activity', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  it('includes a photo row when photos exist, with date and time', async () => {
    vi.mocked(getJobPhotos).mockResolvedValue({
      jobId: JOB.id,
      photos: [photo({ id: 'photo-9', descriptor: 'Jewson receipt', uploadedAt: '2026-07-08T09:15:00.000Z' })],
    })
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('Jewson receipt')).toBeInTheDocument())
    expect(screen.getByText('Photo')).toBeInTheDocument()
  })

  it('tapping a labour activity row opens the Labour workspace', async () => {
    vi.mocked(getMemoryView).mockResolvedValue(memoryViewWith({
      sections: [{
        key: 'labour', label: 'Labour',
        items: [memItem({ id: 'lab-1', memoryType: 'labour', labourHours: '4', labourTask: 'Footings', createdAt: '2026-07-08T09:00:00.000Z' })],
      }],
    }))
    const user = userEvent.setup()
    renderWorkspace()
    const row = await screen.findByRole('button', { name: /labour.*footings/i })
    await user.click(row)
    expect(screen.getByRole('heading', { name: 'Labour' })).toBeInTheDocument()
  })

  it('tapping a photo activity row opens Job log on the Photos filter', async () => {
    vi.mocked(getJobPhotos).mockResolvedValue({
      jobId: JOB.id,
      photos: [photo({ id: 'photo-9', descriptor: 'Jewson receipt', uploadedAt: '2026-07-08T09:15:00.000Z' })],
    })
    const user = userEvent.setup()
    renderWorkspace()
    const row = await screen.findByRole('button', { name: /photo.*jewson receipt/i })
    await user.click(row)
    expect(screen.getByRole('heading', { name: 'Job log' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Photos' })).toHaveAttribute('aria-selected', 'true')
  })

  it('tapping a used-material activity row opens Materials on the Used tab', async () => {
    vi.mocked(getMemoryView).mockResolvedValue(memoryViewWith({
      sections: [{
        key: 'used_materials', label: 'Used materials',
        items: [memItem({ id: 'u1', memoryType: 'used_material', summary: '1× Hardcore', createdAt: '2026-07-08T09:00:00.000Z' })],
      }],
    }))
    const user = userEvent.setup()
    renderWorkspace()
    const row = await screen.findByRole('button', { name: /used.*hardcore/i })
    await user.click(row)
    expect(screen.getByRole('heading', { name: 'Materials' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Used' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('CurrentJobWorkspace — Record resilience', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  it('Record stays visible when review, memory, budget, and photo loads all fail', async () => {
    vi.mocked(getReviewQueue).mockRejectedValue(new Error('queue down'))
    vi.mocked(getMemoryView).mockRejectedValue(new Error('memory down'))
    vi.mocked(getBudgetSummary).mockRejectedValue(new Error('budget down'))
    vi.mocked(getJobPhotos).mockRejectedValue(new Error('photos down'))
    renderWorkspace()
    await waitFor(() => expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument())
  })
})

// ── Job status editing ───────────────────────────────────────────────────────

describe('CurrentJobWorkspace — status editing', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue(EMPTY_QUEUE)
  })

  async function openStatusSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /change job status/i }))
  }

  it('the chip announces the current status in its accessible name', () => {
    renderWorkspace()
    expect(
      screen.getByRole('button', { name: 'Change job status, current status In progress' }),
    ).toBeInTheDocument()
  })

  it('tapping the chip opens a Change status bottom sheet with the three statuses and a separated archive action', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    const sheet = screen.getByRole('dialog', { name: /change status/i })
    expect(sheet).toBeInTheDocument()
    for (const label of ['Planning', 'In progress', 'Finished']) {
      expect(within(sheet).getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
    // Archive is not a normal status row — it sits apart as a danger action.
    const archive = within(sheet).getByRole('button', { name: /archive job/i })
    expect(archive).toHaveClass('status-sheet-archive')
  })

  it('the selected status is conveyed accessibly, not only by colour', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    const sheet = screen.getByRole('dialog', { name: /change status/i })
    expect(within(sheet).getByRole('button', { name: /in progress/i })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: /planning/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('choosing Planning PATCHes the API value "planning" and adopts the returned job', async () => {
    const onJobUpdated = vi.fn()
    vi.mocked(patchJob).mockResolvedValue({ ...JOB, status: 'planning' })
    const user = userEvent.setup()
    renderWorkspace({ onJobUpdated })
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /planning/i }))
    await waitFor(() => expect(patchJob).toHaveBeenCalledWith(JOB.id, { status: 'planning' }))
    expect(onJobUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'planning' }))
    // sheet closes on success
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /change status/i })).not.toBeInTheDocument())
  })

  it('choosing In progress PATCHes the API value "started", not the display label', async () => {
    const onJobUpdated = vi.fn()
    vi.mocked(patchJob).mockResolvedValue({ ...JOB, status: 'started' })
    const user = userEvent.setup()
    renderWorkspace({ job: { ...JOB, status: 'planning' }, onJobUpdated })
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /in progress/i }))
    await waitFor(() => expect(patchJob).toHaveBeenCalledWith(JOB.id, { status: 'started' }))
    expect(onJobUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'started' }))
  })

  it('choosing Finished PATCHes "finished" and keeps Record visible', async () => {
    vi.mocked(patchJob).mockResolvedValue({ ...JOB, status: 'finished' })
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /finished/i }))
    await waitFor(() => expect(patchJob).toHaveBeenCalledWith(JOB.id, { status: 'finished' }))
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
  })

  it('PATCH failure keeps the previous status visible, keeps the sheet open with retryable copy', async () => {
    vi.mocked(patchJob).mockRejectedValue(new Error('boom'))
    const onJobUpdated = vi.fn()
    const user = userEvent.setup()
    renderWorkspace({ onJobUpdated })
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /planning/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not update status/i)
    expect(onJobUpdated).not.toHaveBeenCalled()
    // sheet stays open so the tap can be retried; current status unchanged
    const sheet = screen.getByRole('dialog', { name: /change status/i })
    expect(within(sheet).getByRole('button', { name: /in progress/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('closing the sheet with × saves nothing and restores the chip', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /^close$/i }))
    expect(screen.queryByRole('dialog', { name: /change status/i })).not.toBeInTheDocument()
    expect(patchJob).not.toHaveBeenCalled()
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('Escape dismisses the sheet without saving', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /change status/i })).not.toBeInTheDocument()
    expect(patchJob).not.toHaveBeenCalled()
  })

  it('Archive job… shows an explicit confirmation first and sends no PATCH yet', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /archive job…/i }))
    expect(patchJob).not.toHaveBeenCalled()
    // confirmation copy: removed from the normal list, data kept
    const sheet = screen.getByRole('dialog', { name: /change status/i })
    expect(within(sheet).getByText(/removed from your normal job list/i)).toBeInTheDocument()
    expect(within(sheet).getByText(/kept/i)).toBeInTheDocument()
  })

  it('cancelling the archive confirmation sends no request and leaves the job unchanged', async () => {
    const onJobUpdated = vi.fn()
    const user = userEvent.setup()
    renderWorkspace({ onJobUpdated })
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /archive job…/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(patchJob).not.toHaveBeenCalled()
    expect(onJobUpdated).not.toHaveBeenCalled()
    // back on the normal picker view
    const sheet = screen.getByRole('dialog', { name: /change status/i })
    expect(within(sheet).getByRole('button', { name: /in progress/i })).toBeInTheDocument()
  })

  it('a successful status change tracks job_status_changed with API enum values only', async () => {
    const { track } = await import('../analytics')
    vi.mocked(patchJob).mockResolvedValue({ ...JOB, status: 'planning' })
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /planning/i }))
    await waitFor(() => expect(track).toHaveBeenCalledWith('job_status_changed', {
      job_id: JOB.id, from_status: 'started', to_status: 'planning',
    }))
    // no payload ever carries the job title or location
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toMatch(/Garden Room|Oakfield/)
  })

  it('a failed status change tracks nothing', async () => {
    const { track } = await import('../analytics')
    vi.mocked(track).mockClear()
    vi.mocked(patchJob).mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /planning/i }))
    await screen.findByRole('alert')
    expect(track).not.toHaveBeenCalled()
  })

  it('confirming archive tracks job_archived with the job id only', async () => {
    const { track } = await import('../analytics')
    vi.mocked(patchJob).mockResolvedValue({ ...JOB, status: 'archived' })
    const user = userEvent.setup()
    renderWorkspace()
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /archive job…/i }))
    await user.click(screen.getByRole('button', { name: /^archive job$/i }))
    await waitFor(() => expect(track).toHaveBeenCalledWith('job_archived', { job_id: JOB.id }))
  })

  it('confirming archive PATCHes status "archived" and adopts the returned job', async () => {
    const onJobUpdated = vi.fn()
    vi.mocked(patchJob).mockResolvedValue({ ...JOB, status: 'archived' })
    const user = userEvent.setup()
    renderWorkspace({ onJobUpdated })
    await openStatusSheet(user)
    await user.click(screen.getByRole('button', { name: /archive job…/i }))
    await user.click(screen.getByRole('button', { name: /^archive job$/i }))
    await waitFor(() => expect(patchJob).toHaveBeenCalledWith(JOB.id, { status: 'archived' }))
    expect(onJobUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }))
  })
})
