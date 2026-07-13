import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SupportModePage from '../SupportModePage'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import type { AuthUser, InspectionData, Job, MemoryViewResponse, SupportUser } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    getSupportUsers: vi.fn(),
    getSupportUserJobs: vi.fn(),
    getSupportJobInspection: vi.fn(),
    getSupportMemoryView: vi.fn(),
    getSupportBudgetSummary: vi.fn(),
    getSupportReviewQueue: vi.fn(),
    getSupportPhotos: vi.fn(),
    getSupportJobPayments: vi.fn(() => Promise.reject(new Error('none'))),
    // workspace deps for the entry-point test
    getMemoryView: vi.fn(() => Promise.resolve({ job: JOB, generatedAt: '', sections: [], stillToCheck: { count: 0, items: [] } })),
    getBudgetSummary: vi.fn(() => Promise.reject(new Error('none'))),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-1', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-1', photos: [] })),
  }
})
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetCurrentUser = vi.mocked(api.getCurrentUser)
const mockGetSupportUsers = vi.mocked(api.getSupportUsers)
const mockGetSupportUserJobs = vi.mocked(api.getSupportUserJobs)
const mockGetSupportJobInspection = vi.mocked(api.getSupportJobInspection)
const mockGetSupportMemoryView = vi.mocked(api.getSupportMemoryView)
const mockGetSupportBudgetSummary = vi.mocked(api.getSupportBudgetSummary)
const mockGetSupportReviewQueue = vi.mocked(api.getSupportReviewQueue)
const mockGetSupportPhotos = vi.mocked(api.getSupportPhotos)

const INTERNAL: AuthUser = { id: 'u-founder', email: 'founder@test', name: 'Founder', role: 'INTERNAL' }
const PILOT: AuthUser = { id: 'u-mike', email: 'mike@test', name: 'Mike', role: 'PILOT' }

const JOB: Job = { id: 'job-1', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null, status: 'started', createdAt: '', updatedAt: '' }

const SUPPORT_MIKE: SupportUser = {
  id: 'u-mike', email: 'mike@test', name: 'Mike', role: 'PILOT',
  createdAt: '', updatedAt: '', jobCount: 1, lastActivityAt: '2026-07-09T08:00:00Z',
}
const SUPPORT_JOB = { id: 'job-1', ownerUserId: 'u-mike', title: 'Garden Room', jobType: 'garden_room', status: 'started', roughLocationOrLabel: null, createdAt: '', updatedAt: '' }

function memoryView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [{
        id: 'm1', memoryType: 'ordered_material', summary: '8 bags hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags',
        supplierName: null, deliveryTiming: null, locationOrUse: null, costAmount: null, costCurrency: 'GBP', costQualifier: 'total',
        totalCostAmount: '40', uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null, createdAt: '', updatedAt: '', source: null,
      }] },
      { key: 'labour', label: 'Labour', items: [{
        id: 'l1', memoryType: 'labour', summary: 'Tom 8h electrics', materialName: null, quantity: null, unit: null,
        supplierName: null, deliveryTiming: null, locationOrUse: null, costAmount: '35', costCurrency: 'GBP', costQualifier: 'per_hour',
        totalCostAmount: '280', labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics', happenedAt: '2026-07-09T12:00:00',
        uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null, createdAt: '', updatedAt: '', source: null,
      }] },
      { key: 'general_notes', label: 'Notes', items: [] },
    ],
    stillToCheck: { count: 0, items: [] },
  }
}

const BUDGET = {
  jobId: 'job-1', generatedAt: '', categories: [],
  uncategorized: { knownSpendAmount: '40', knownSpendCurrency: 'GBP', knownSpendLabel: '£40 known spend', rows: [
    { memoryItemId: 'm1', memoryType: 'ordered_material', itemLabel: 'hardcore', materialName: 'hardcore', quantity: '8', unit: 'bags', lineTotalAmount: '40', lineTotalCurrency: 'GBP', lineTotalLabel: '£40 total' },
  ] },
  totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: '320', knownSpendCurrency: 'GBP', remainingAmount: null, remainingLabel: null, overBudget: false },
}

const QUEUE = {
  jobId: 'job-1', generatedAt: '',
  sections: [{ key: 'labour', label: 'Labour', items: [{
    id: 'q1', kind: 'single' as const, status: 'draft' as const, reviewLabel: '', summary: 'Kurt worked 6 hours',
    proposedMemory: { memoryType: 'labour' as const, summary: 'Kurt worked 6 hours', materialName: null, quantity: null, unit: null, supplierName: null, deliveryTiming: null, locationOrUse: null, costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null, labourHours: '6', labourPerson: 'Kurt', labourTask: null },
    confidenceLabel: 'high' as const, uncertaintyFlags: [], sourceCandidateFactIds: [], sourceContext: [],
  }] }],
  alreadyRemembered: [],
}

const PHOTO = {
  id: 'p1', jobId: 'job-1', descriptor: 'Receipt', mimeType: 'image/jpeg', sizeBytes: 100,
  uploadedAt: '2026-07-09T09:00:00Z', createdAt: '', updatedAt: '', linkedNoteId: null, linkedMemoryItemId: null,
  linkedNote: null, linkedMemoryItem: null, imageUrl: '/api/internal/support/jobs/job-1/photos/p1/file',
}

const INSPECTION: InspectionData = {
  job: JOB, generatedAt: '',
  notesByDay: [{ localDate: '2026-07-08', notes: [{
    id: 'n1', clientNoteId: 'c1', capturedAt: '2026-07-08T09:00:00Z', uploadedAt: '2026-07-08T09:00:05Z', serverStatus: 'transcribed',
    mimeType: 'audio/webm', durationMs: 9000, sizeBytes: 1000, audioStored: true,
    transcript: { id: 't1', status: 'ready', text: 'Kurt did six hours', language: 'en', provider: 'x', model: 'y', errorCode: null, extractionStatus: 'ready', extractionErrorCode: null },
    candidateFacts: [{ id: 'f1', factType: 'labour', status: 'draft', summary: 'Kurt worked 6 hours', materialName: null, quantity: null, unit: null, supplierName: null, deliveryTiming: null, locationOrUse: null, confidenceLabel: 'high', uncertaintyFlags: [], reviewState: 'waiting', reviewDecisionIds: [], memoryItemIds: [] }],
  }] }],
  queue: { sections: [{ key: 'labour', label: 'Labour', items: [{ id: 'q1', kind: 'single', status: 'draft', reviewLabel: '', summary: 'Kurt worked 6 hours' }] }] },
  reviewDecisions: [], memoryItems: [{ id: 'm1', memoryType: 'ordered_material', summary: '8 bags hardcore', sourceCandidateFactId: null, reviewDecisionId: null, createdAt: '' }],
  possibleMisses: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockGetSupportUsers.mockResolvedValue({ users: [SUPPORT_MIKE] })
  mockGetSupportUserJobs.mockResolvedValue({ user: SUPPORT_MIKE, jobs: [SUPPORT_JOB] })
  mockGetSupportJobInspection.mockResolvedValue(INSPECTION)
  mockGetSupportMemoryView.mockResolvedValue(memoryView())
  mockGetSupportBudgetSummary.mockResolvedValue(BUDGET)
  mockGetSupportReviewQueue.mockResolvedValue(QUEUE)
  mockGetSupportPhotos.mockResolvedValue({ jobId: 'job-1', photos: [PHOTO] })
})

afterEach(() => vi.unstubAllEnvs())

// Drive the page into view-as mode for Mike's job.
async function enterViewAs() {
  mockGetCurrentUser.mockResolvedValue(INTERNAL)
  render(<SupportModePage />)
  fireEvent.click(await screen.findByRole('button', { name: /Mike/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'View as user' }))
  await screen.findByText(/Support mode:/)
}

describe('Support mode — gating', () => {
  it('a normal user sees no Support entry in the workspace header', async () => {
    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} user={PILOT} />)
    expect(screen.queryByRole('link', { name: 'Support' })).toBeNull()
  })

  it('an internal user sees the Support entry', async () => {
    render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} user={INTERNAL} />)
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menuitem', { name: 'Support' })).toHaveAttribute('href', '/internal/support')
  })

  it('a normal user on the direct route gets Not authorised and no support data is fetched', async () => {
    mockGetCurrentUser.mockResolvedValue(PILOT)
    render(<SupportModePage />)
    expect(await screen.findByText('Not authorised.')).toBeInTheDocument()
    expect(mockGetSupportUsers).not.toHaveBeenCalled()
    expect(screen.queryByText(/mike@test/)).toBeNull()
  })

  it('an unauthenticated visitor gets the auth screen, not support data', async () => {
    mockGetCurrentUser.mockRejectedValue(new api.ApiError('Unauthorized', 401))
    render(<SupportModePage />)
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    expect(mockGetSupportUsers).not.toHaveBeenCalled()
  })
})

describe('Support mode — surface', () => {
  beforeEach(() => mockGetCurrentUser.mockResolvedValue(INTERNAL))

  it('lists users with role and activity, then the selected user’s jobs', async () => {
    render(<SupportModePage />)
    const row = await screen.findByRole('button', { name: /Mike/ })
    expect(within(row).getByText('PILOT')).toBeInTheDocument()
    fireEvent.click(row)
    expect(await screen.findByText('Garden Room')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View as user' })).toBeInTheDocument()
  })

  it('opens job inspection with the capture → review → memory trail', async () => {
    render(<SupportModePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Mike/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect' }))
    expect(await screen.findByText('Kurt did six hours')).toBeInTheDocument() // transcript
    expect(screen.getAllByText(/Kurt worked 6 hours/).length).toBeGreaterThan(0) // candidate fact + queue
    expect(screen.getByText(/8 bags hardcore/)).toBeInTheDocument()          // trusted memory
  })
})

describe('Support mode — read-only view-as', () => {
  it('shows a persistent banner with target identity across every tab', async () => {
    await enterViewAs()
    for (const t of ['Labour', 'Used', 'Notes', /To check/]) {
      fireEvent.click(screen.getByRole('tab', { name: t }))
      expect(screen.getByRole('status')).toHaveTextContent('viewing as Mike (mike@test) — Garden Room · read-only')
    }
  })

  it('shows payments read-only with no add/edit/delete/set-total controls', async () => {
    vi.mocked(api.getSupportJobPayments).mockResolvedValue({
      jobId: 'job-1', generatedAt: '',
      customerTotalAmount: '4200', customerTotalCurrency: 'GBP', customerTotalLabel: '£4200',
      totalPaidAmount: '1500', totalPaidCurrency: 'GBP', totalPaidLabel: '£1500 paid',
      stillOwedAmount: '2700', stillOwedCurrency: 'GBP', stillOwedLabel: '£2700 still owed',
      overpaid: false, overpaidAmount: null, overpaidLabel: null,
      payments: [{
        id: 'sp-1', jobId: 'job-1', amount: '1500', currency: 'GBP', amountLabel: '£1500',
        paidAt: '2026-07-06T12:00:00.000Z', note: 'Deposit', reference: 'INV-1',
        createdAt: '', updatedAt: '',
      }],
    })
    await enterViewAs()
    fireEvent.click(screen.getByRole('tab', { name: 'Payments' }))
    expect(await screen.findByText('£4200')).toBeInTheDocument()
    expect(screen.getByText('£2700')).toBeInTheDocument()
    expect(screen.getByText(/Deposit/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add payment/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit|delete|set customer total|clear total/i })).toBeNull()
  })

  it('renders target data with no Record/Add/Fix/review/photo-upload controls on any tab', async () => {
    await enterViewAs()
    expect(await screen.findByText(/£320/)).toBeInTheDocument()
    for (const t of ['Spend', 'Payments', 'Labour', 'Used', 'Notes', /To check/]) {
      fireEvent.click(screen.getByRole('tab', { name: t }))
      expect(screen.queryByRole('button', { name: /record/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /^add /i })).toBeNull()
      expect(screen.queryByRole('button', { name: /fix memory/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /remember this|dismiss|save|upload|edit details/i })).toBeNull()
      expect(document.querySelector('input, textarea, select')).toBeNull()
      // no job status edit surface — support/view-as never mutates target data
      expect(screen.queryByRole('button', { name: /change (job )?status/i })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: /change (job )?status/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /more actions/i })).toBeNull()
    }
    // the data itself is there: labour entry, review draft, photo
    fireEvent.click(screen.getByRole('tab', { name: 'Labour' }))
    expect(screen.getByText('Tom')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /To check/ }))
    expect(screen.getByText(/Kurt/)).toBeInTheDocument()
  })

  it('resolves relative support photo imageUrls against the API base', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test')
    await enterViewAs()
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    const img = await screen.findByAltText('Receipt')
    expect(img.getAttribute('src')).toBe('https://api.example.test/api/internal/support/jobs/job-1/photos/p1/file')
  })

  it('exit clears target state back to the support surface, and never touches the normal job cache', async () => {
    localStorage.setItem('job-book-selected-job-id', 'my-own-job')
    localStorage.setItem('job-book-cached-jobs', '[]')
    await enterViewAs()
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(screen.queryByText(/Support mode:/)).toBeNull()
    expect(screen.queryByText('Tom')).toBeNull()
    expect(await screen.findByText('Garden Room')).toBeInTheDocument() // back on the jobs list
    // the internal user's own workspace cache is untouched
    expect(localStorage.getItem('job-book-selected-job-id')).toBe('my-own-job')
    expect(localStorage.getItem('job-book-cached-jobs')).toBe('[]')
  })

  it('a failed support load clears target data and offers retry', async () => {
    mockGetSupportMemoryView.mockRejectedValueOnce(new Error('boom'))
    await enterViewAs()
    expect(await screen.findByText(/Could not load this user’s job data/)).toBeInTheDocument()
    expect(screen.queryByText('Tom')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mockGetSupportMemoryView).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('tab', { name: 'Labour' }))
    expect(await screen.findByText('Tom')).toBeInTheDocument()
  })
})

// ── Tech-lead acceptance: no support data before/without access; 401 AND 403
//    from support APIs both resolve to no-access states ───────────────────────

describe('Support mode — no-access guarantees', () => {
  it('renders nothing but a loading state while the auth gate resolves (no flash of support data)', async () => {
    // hold getCurrentUser pending: whatever renders now is what an
    // unauthenticated visitor could ever see before the gate resolves
    let resolveAuth!: (u: AuthUser) => void
    mockGetCurrentUser.mockReturnValue(new Promise(r => { resolveAuth = r }))
    render(<SupportModePage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText(/mike@test/)).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(mockGetSupportUsers).not.toHaveBeenCalled()
    // resolving as INTERNAL is the only path that mounts support data
    resolveAuth(INTERNAL)
    expect(await screen.findByRole('button', { name: /Mike/ })).toBeInTheDocument()
  })

  it('a 401 from a support API mid-use clears support data and returns to the auth screen', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(INTERNAL)
    render(<SupportModePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Mike/ }))
    await screen.findByText('Garden Room')
    // session expires: the next support call 401s, and so does the re-check
    mockGetSupportJobInspection.mockRejectedValueOnce(new api.ApiError('Unauthorized', 401))
    mockGetCurrentUser.mockRejectedValue(new api.ApiError('Unauthorized', 401))
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }))
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.queryByText('Garden Room')).toBeNull()
    expect(screen.queryByText(/Try again/)).toBeNull()
  })

  it('a 403 from a support API mid-use clears support data and shows Not authorised', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(INTERNAL)
    render(<SupportModePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Mike/ }))
    await screen.findByText('Garden Room')
    // role revoked: the next support call 403s; the re-check sees a PILOT
    mockGetSupportMemoryView.mockRejectedValue(new api.ApiError('Forbidden', 403))
    mockGetSupportBudgetSummary.mockRejectedValue(new api.ApiError('Forbidden', 403))
    mockGetSupportReviewQueue.mockRejectedValue(new api.ApiError('Forbidden', 403))
    mockGetSupportPhotos.mockRejectedValue(new api.ApiError('Forbidden', 403))
    mockGetCurrentUser.mockResolvedValue(PILOT)
    fireEvent.click(screen.getByRole('button', { name: 'View as user' }))
    expect(await screen.findByText('Not authorised.')).toBeInTheDocument()
    expect(screen.queryByText(/Support mode:/)).toBeNull()
    expect(screen.queryByText('Tom')).toBeNull()
    expect(screen.queryByText(/Try again/)).toBeNull()
  })
})
