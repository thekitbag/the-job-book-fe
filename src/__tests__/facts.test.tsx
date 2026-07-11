import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import { saveNote } from '../db'
import { getJobNoteStatuses, getDraftFacts, getReviewQueue } from '../api'
import { makeNote, makeFact } from './helpers'
import type { UseRecorderReturn } from '../useRecorder'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn(),
  getReviewQueue: vi.fn(),
  getMemoryView: vi.fn(() => Promise.resolve({ job: { id: 'job-test-001' }, generatedAt: '', sections: [], stillToCheck: { count: 0, items: [] } })),
  getBudgetSummary: vi.fn(() => Promise.reject(new Error('no budget'))),
  getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-test-001', photos: [] })),
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

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))

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
const mockGetDraftFacts = vi.mocked(getDraftFacts)

describe('draft facts visibility', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue({ jobId: 'job-test-001', generatedAt: '', sections: [], alreadyRemembered: [] })
  })

  it('shows "Looking for job facts…" when transcript is ready but extraction is pending', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-001',
      transcriptStatus: 'ready',
      transcriptText: 'Some text.',
      extractionStatus: 'waiting',
    })
    await saveNote(note)

    // No status change — extraction still waiting, so no poll needed
    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/looking for job facts/i)).toBeInTheDocument()
    })
  })

  it('shows "Looking for job facts…" when extraction status is extracting', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-002',
      transcriptStatus: 'ready',
      transcriptText: 'Some text.',
      extractionStatus: 'extracting',
    })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/looking for job facts/i)).toBeInTheDocument()
    })
  })

  it('shows draft facts with "Draft facts" label when extraction is ready', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-003',
      transcriptStatus: 'ready',
      transcriptText: 'Ordered 10 bags of sand.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    const fact = makeFact({
      sourceNoteIds: ['srv-003'],
      summary: 'Ordered 10 bags of sand',
      confidenceLabel: 'high',
      uncertaintyFlags: [],
    })

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([fact])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/draft facts/i)).toBeInTheDocument()
      expect(screen.getByText('Ordered 10 bags of sand')).toBeInTheDocument()
    })
  })

  it('shows "From what the system heard" source label on each fact', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-004',
      transcriptStatus: 'ready',
      transcriptText: 'Used some gravel.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    const fact = makeFact({
      sourceNoteIds: ['srv-004'],
      summary: 'Used 2 tonnes of gravel',
    })

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([fact])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/from what the system heard/i)).toBeInTheDocument()
    })
  })

  it('shows "Unclear" badge for unclear facts', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-005',
      transcriptStatus: 'ready',
      transcriptText: 'Something happened.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    const fact = makeFact({
      sourceNoteIds: ['srv-005'],
      factType: 'unclear',
      status: 'unclear',
      summary: 'Unclear mention of a supplier',
      confidenceLabel: 'low',
      uncertaintyFlags: ['ambiguous_quantity'],
    })

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([fact])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      // Badge text is the standalone word "Unclear" — the summary also contains the word,
      // so check by the badge's specific class.
      const badges = screen.getAllByText(/^unclear$/i)
      expect(badges.length).toBeGreaterThan(0)
    })
  })

  it('shows "Low confidence" badge for low-confidence non-unclear facts', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-006',
      transcriptStatus: 'ready',
      transcriptText: 'Maybe 5 bags.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    const fact = makeFact({
      sourceNoteIds: ['srv-006'],
      factType: 'used_material',
      status: 'draft',
      summary: 'Possibly 5 bags of aggregate',
      confidenceLabel: 'low',
      uncertaintyFlags: [],
    })

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([fact])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/low confidence/i)).toBeInTheDocument()
    })
  })

  it('shows "Needs checking" badge for medium-confidence facts', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-007',
      transcriptStatus: 'ready',
      transcriptText: 'About three rolls of felt.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    const fact = makeFact({
      sourceNoteIds: ['srv-007'],
      factType: 'used_material',
      status: 'draft',
      summary: 'Three rolls of roofing felt',
      confidenceLabel: 'medium',
      uncertaintyFlags: [],
    })

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([fact])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/needs checking/i)).toBeInTheDocument()
    })
  })

  it('shows "No facts found" message when extraction succeeded but returned empty', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-008',
      transcriptStatus: 'ready',
      transcriptText: 'Just chatting.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/no facts found/i)).toBeInTheDocument()
    })
  })

  it('shows extraction failure without implying the recording or transcript was lost', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-009',
      transcriptStatus: 'ready',
      transcriptText: 'Delivered 20 slabs.',
      extractionStatus: 'failed',
    })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/could not extract draft facts/i)).toBeInTheDocument()
      expect(screen.getByText(/recording and transcript are still saved/i)).toBeInTheDocument()
    })
  })

  it('does not show draft facts section when transcript is not yet ready', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-010',
      transcriptStatus: 'transcribing',
      transcriptText: null,
      extractionStatus: null,
    })
    await saveNote(note)

    // BE shape: extractionStatus nested inside transcript
    mockGetStatuses.mockResolvedValue([{
      id: 'srv-010',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'transcribing', extractionStatus: null },
    }])
    mockGetDraftFacts.mockResolvedValue([])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/transcribing/i)).toBeInTheDocument()
    })

    expect(screen.queryByText(/draft facts/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/looking for job facts/i)).not.toBeInTheDocument()
  })

  it('polls extraction status via the note list endpoint using BE shape', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-011',
      transcriptStatus: 'ready',
      transcriptText: 'Installed 4 joists.',
      extractionStatus: 'extracting',
    })
    await saveNote(note)

    // BE shape: extractionStatus is nested inside transcript, not a separate extraction key
    mockGetStatuses.mockResolvedValue([{
      id: 'srv-011',
      clientNoteId: note.clientNoteId,
      transcript: { status: 'ready', extractionStatus: 'ready' },
    }])
    mockGetDraftFacts.mockResolvedValue([
      makeFact({ sourceNoteIds: ['srv-011'], summary: 'Installed 4 floor joists' }),
    ])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Installed 4 floor joists')).toBeInTheDocument()
    })

    expect(mockGetStatuses).toHaveBeenCalledWith(JOB.id)
    expect(mockGetDraftFacts).toHaveBeenCalledWith(JOB.id)
  })

  it('shows fetch error message rather than "No facts found" when the facts endpoint fails', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-012',
      transcriptStatus: 'ready',
      transcriptText: 'Ordered timber.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockRejectedValue(new Error('GET /api/jobs/job-test-001/facts → 404'))

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/could not load facts/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/no facts found/i)).not.toBeInTheDocument()
  })

  it('shows "Needs checking" badge for a high-confidence fact with uncertainty flags', async () => {
    const note = makeNote({
      jobId: JOB.id,
      localState: 'uploaded',
      serverNoteId: 'srv-013',
      transcriptStatus: 'ready',
      transcriptText: 'Roughly 10 bags.',
      extractionStatus: 'ready',
    })
    await saveNote(note)

    const fact = makeFact({
      sourceNoteIds: ['srv-013'],
      factType: 'used_material',
      status: 'draft',
      summary: 'Roughly 10 bags of sand',
      confidenceLabel: 'high',
      uncertaintyFlags: ['approximate_quantity'],
    })

    mockGetStatuses.mockResolvedValue([])
    mockGetDraftFacts.mockResolvedValue([fact])

    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/needs checking/i)).toBeInTheDocument()
    })
    // High-confidence + flags should NOT show "Low confidence" or "Unclear"
    expect(screen.queryByText(/low confidence/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^unclear$/i)).not.toBeInTheDocument()
  })
})
