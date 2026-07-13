import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import type { Job, JobPhoto, MemoryViewResponse } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-photo-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(),
    uploadJobPhoto: vi.fn(),
    patchJobPhoto: vi.fn(),
  }
})

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockGetJobPhotos = vi.mocked(api.getJobPhotos)
const mockUploadJobPhoto = vi.mocked(api.uploadJobPhoto)
const mockPatchJobPhoto = vi.mocked(api.patchJobPhoto)

const JOB: Job = {
  id: 'job-photo-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-10T09:00:00Z',
}

function memoryView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [
      { key: 'ordered_materials', label: 'Ordered materials', items: [{
        id: 'mem-plasterboard', memoryType: 'ordered_material', summary: '12 sheets of plasterboard',
        materialName: 'plasterboard', quantity: '12', unit: 'sheets', supplierName: null, deliveryTiming: null,
        locationOrUse: null, costAmount: null, costCurrency: 'GBP', costQualifier: 'total', totalCostAmount: '600',
        uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
        createdAt: '2026-07-01T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z', source: null,
      }] },
      { key: 'general_notes', label: 'Notes', items: [] },
    ],
    stillToCheck: { count: 0, items: [] },
    costSummary: {
      orderedMaterials: { knownSpendAmount: '600', knownSpendCurrency: 'GBP', knownSpendLabel: '£600 known spend', includedMemoryItemIds: ['mem-plasterboard'], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [], excludedRows: [] },
      totalKnownCost: { knownSpendAmount: '600', knownSpendCurrency: 'GBP', knownSpendLabel: '£600 known spend', includedMemoryItemIds: ['mem-plasterboard'] },
    },
  }
}

function photo(over: Partial<JobPhoto> = {}): JobPhoto {
  return {
    id: 'photo-1', jobId: JOB.id, descriptor: null, mimeType: 'image/jpeg', sizeBytes: 1000,
    uploadedAt: '2026-07-08T09:00:00Z', createdAt: '2026-07-08T09:00:00Z', updatedAt: '2026-07-08T09:00:00Z',
    linkedNoteId: null, linkedMemoryItemId: null, linkedNote: null, linkedMemoryItem: null,
    imageUrl: '/api/jobs/job-photo-001/photos/photo-1/file',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMemoryView.mockResolvedValue(memoryView())
  mockGetBudgetSummary.mockResolvedValue({
    jobId: JOB.id, generatedAt: '', categories: [],
    uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
    totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: '600', knownSpendCurrency: 'GBP', remainingAmount: null, remainingLabel: null, overBudget: false },
  })
  mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [] })
  // happy-dom lacks a full object-URL implementation in some versions
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:preview')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}

// Photos now live in Job log → Photos (name kept so call sites read the same).
function openNotesTab() {
  const back = screen.queryByRole('button', { name: /job home/i })
  if (back) fireEvent.click(back)
  fireEvent.click(screen.getByRole('button', { name: 'Open Job log' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Photos' }))
}

async function photosSection() {
  return await screen.findByRole('region', { name: /job photos/i })
}

function pickFile(form: HTMLElement, name = 'site.jpg') {
  const file = new File(['img-bytes'], name, { type: 'image/jpeg' })
  const input = form.querySelector('input[type="file"]')!
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

describe('Job photos — section and upload', () => {
  it('shows the Job photos section with an Add photo action in job context', async () => {
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    expect(within(section).getByRole('button', { name: 'Add photo' })).toBeInTheDocument()
    expect(await within(section).findByText('No photos yet.')).toBeInTheDocument()
  })

  it('photo-only save works: no descriptor, no link, renders after upload', async () => {
    const saved = photo()
    mockUploadJobPhoto.mockResolvedValue(saved)
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }))
    const form = within(section).getByRole('form', { name: 'Add photo' })

    // save disabled until a file is picked
    expect(within(section).getByRole('button', { name: 'Save photo' })).toBeDisabled()
    const file = pickFile(form)
    mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [saved] })
    fireEvent.click(within(section).getByRole('button', { name: 'Save photo' }))

    await waitFor(() => expect(mockUploadJobPhoto).toHaveBeenCalledWith(JOB.id, {
      file, descriptor: null, linkedMemoryItemId: null,
    }))
    // photo appears only after backend success (via authoritative refetch)
    const img = await within(section).findByAltText('Job photo')
    expect(img).toBeInTheDocument()
  })

  it('uses the backend imageUrl for the image, never an object-storage URL', async () => {
    mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [photo()] })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    const img = await within(section).findByAltText('Job photo')
    expect(img.getAttribute('src')).toBe('/api/jobs/job-photo-001/photos/photo-1/file')
    expect(img.getAttribute('src')).not.toMatch(/r2\.|cloudflarestorage|amazonaws/)
  })

  it('optional descriptor is sent on upload and displayed on the card', async () => {
    mockUploadJobPhoto.mockResolvedValue(photo({ descriptor: 'Jewson receipt' }))
    mockGetJobPhotos
      .mockResolvedValueOnce({ jobId: JOB.id, photos: [] })
      .mockResolvedValue({ jobId: JOB.id, photos: [photo({ descriptor: 'Jewson receipt' })] })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }))
    const form = within(section).getByRole('form', { name: 'Add photo' })
    pickFile(form)
    fireEvent.change(form.querySelector('input[name="descriptor"]')!, { target: { value: 'Jewson receipt' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save photo' }))

    await waitFor(() => expect(mockUploadJobPhoto).toHaveBeenCalledWith(JOB.id, expect.objectContaining({ descriptor: 'Jewson receipt' })))
    expect(await within(section).findByText('Jewson receipt')).toBeInTheDocument()
  })

  it('an unlinked photo renders as a general job photo without a link label', async () => {
    mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [photo()] })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    await within(section).findByAltText('Job photo')
    expect(within(section).queryByText(/linked to/i)).toBeNull()
  })

  it('a trusted memory item can be selected as link target and is displayed', async () => {
    const linked = photo({
      id: 'photo-2',
      linkedMemoryItemId: 'mem-plasterboard',
      linkedMemoryItem: { id: 'mem-plasterboard', memoryType: 'ordered_material', summary: '12 sheets of plasterboard' },
    })
    mockUploadJobPhoto.mockResolvedValue(linked)
    mockGetJobPhotos
      .mockResolvedValueOnce({ jobId: JOB.id, photos: [] })
      .mockResolvedValue({ jobId: JOB.id, photos: [linked] })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }))
    const form = within(section).getByRole('form', { name: 'Add photo' })
    pickFile(form)
    fireEvent.change(within(section).getByLabelText('Link photo to'), { target: { value: 'mem-plasterboard' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save photo' }))

    await waitFor(() => expect(mockUploadJobPhoto).toHaveBeenCalledWith(JOB.id, expect.objectContaining({ linkedMemoryItemId: 'mem-plasterboard' })))
    expect(await within(section).findByText(/Linked to: 12 sheets plasterboard/)).toBeInTheDocument()
  })

  it('a failed upload keeps the form open with values and shows a retryable error', async () => {
    mockUploadJobPhoto.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(photo())
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }))
    const form = within(section).getByRole('form', { name: 'Add photo' })
    pickFile(form)
    fireEvent.change(form.querySelector('input[name="descriptor"]')!, { target: { value: 'Footings' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save photo' }))

    // error shown, form still open, values preserved
    expect(await within(section).findByRole('alert')).toHaveTextContent(/could not upload/i)
    expect((form.querySelector('input[name="descriptor"]') as HTMLInputElement).value).toBe('Footings')
    // retry succeeds without re-picking the file
    mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [photo()] })
    fireEvent.click(within(section).getByRole('button', { name: 'Save photo' }))
    await waitFor(() => expect(mockUploadJobPhoto).toHaveBeenCalledTimes(2))
    expect(await within(section).findByAltText('Job photo')).toBeInTheDocument()
  })

  it('uploading a receipt photo never changes known spend', async () => {
    mockUploadJobPhoto.mockResolvedValue(photo({ descriptor: 'Receipt' }))
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }))
    pickFile(within(section).getByRole('form', { name: 'Add photo' }), 'receipt.jpg')
    const budgetCallsBefore = mockGetBudgetSummary.mock.calls.length
    fireEvent.click(within(section).getByRole('button', { name: 'Save photo' }))
    await waitFor(() => expect(mockUploadJobPhoto).toHaveBeenCalled())

    // no spend/budget refresh is triggered — photos are evidence, not spend
    expect(mockGetBudgetSummary.mock.calls.length).toBe(budgetCallsBefore)
    fireEvent.click(screen.getByRole('button', { name: /job home/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Spend' }))
    const hero = await screen.findByRole('region', { name: /^known spend$/i })
    expect(within(hero).getByText(/£600/)).toBeInTheDocument()
  })

  it('edit details patches descriptor and link without re-upload', async () => {
    const existing = photo()
    mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [existing] })
    mockPatchJobPhoto.mockResolvedValue(photo({
      descriptor: 'Back wall',
      linkedMemoryItemId: 'mem-plasterboard',
      linkedMemoryItem: { id: 'mem-plasterboard', memoryType: 'ordered_material', summary: '12 sheets of plasterboard' },
    }))
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    await within(section).findByAltText('Job photo')
    fireEvent.click(within(section).getByRole('button', { name: 'Edit details' }))
    const form = within(section).getByRole('form', { name: 'Edit photo details' })
    fireEvent.change(form.querySelector('input[name="descriptor"]')!, { target: { value: 'Back wall' } })
    fireEvent.change(within(form).getByLabelText('Link photo to'), { target: { value: 'mem-plasterboard' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(mockPatchJobPhoto).toHaveBeenCalledWith(JOB.id, 'photo-1', {
      descriptor: 'Back wall', linkedMemoryItemId: 'mem-plasterboard', linkedNoteId: null,
    }))
    expect(await within(section).findByText('Back wall')).toBeInTheDocument()
    expect(within(section).getByText(/Linked to: 12 sheets plasterboard/)).toBeInTheDocument()
  })

  it('shows a safe fallback when the image cannot be loaded', async () => {
    mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [photo()] })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    const img = await within(section).findByAltText('Job photo')
    fireEvent.error(img)
    expect(within(section).getByText('Photo uploaded')).toBeInTheDocument()
  })
})

describe('Job photos — corrected items use current trusted labels', () => {
  // The item was corrected after extraction: the stored summary (original
  // source text) says OSB, but the current trusted fields say fire-rated
  // plasterboard. Picker and saved card must both show the corrected identity.
  const CORRECTED = {
    id: 'mem-corrected', memoryType: 'ordered_material', summary: 'Ordered a load of OSB boards',
    materialName: 'fire-rated plasterboard', quantity: '10', unit: 'sheets', supplierName: null, deliveryTiming: null,
    locationOrUse: null, costAmount: null, costCurrency: 'GBP', costQualifier: null, totalCostAmount: null,
    uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '2026-07-01T09:00:00Z', updatedAt: '2026-07-02T09:00:00Z', source: null,
  }

  beforeEach(() => {
    const view = memoryView()
    view.sections[0].items.push(CORRECTED)
    mockGetMemoryView.mockResolvedValue(view)
  })

  it('the picker shows the corrected identity, not the original source text', async () => {
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }))
    const select = within(section).getByLabelText('Link photo to')
    const labels = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
    expect(labels).toContain('10 sheets fire-rated plasterboard')
    expect(labels.join('|')).not.toMatch(/OSB/)
  })

  it('the saved card label uses the current trusted fields even when the backend echoes stale text', async () => {
    // backend echoes the stale original summary on the linked photo
    mockGetJobPhotos.mockResolvedValue({
      jobId: JOB.id,
      photos: [photo({
        id: 'photo-3',
        linkedMemoryItemId: 'mem-corrected',
        linkedMemoryItem: { id: 'mem-corrected', memoryType: 'ordered_material', summary: 'Ordered a load of OSB boards' },
      })],
    })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    expect(await within(section).findByText(/Linked to: 10 sheets fire-rated plasterboard/)).toBeInTheDocument()
    expect(within(section).queryByText(/OSB/)).toBeNull()
  })

  it('labour link targets use person/hours/task, not the source summary', async () => {
    const view = memoryView()
    view.sections.push({ key: 'labour', label: 'Labour', items: [{
      id: 'mem-lab', memoryType: 'labour', summary: 'Someone did some hours',
      materialName: null, quantity: null, unit: null, supplierName: null, deliveryTiming: null,
      locationOrUse: null, costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
      labourHours: '8', labourPerson: 'Tom', labourTask: 'electrics',
      uncertaintyFlags: [], sourceCandidateFactId: null, reviewDecisionId: null,
      createdAt: '2026-07-01T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z', source: null,
    }] })
    mockGetMemoryView.mockResolvedValue(view)
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add photo' }))
    const select = within(section).getByLabelText('Link photo to')
    const labels = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
    expect(labels).toContain('Tom · 8h · electrics')
    expect(labels.join('|')).not.toMatch(/Someone did some hours/)
  })
})

// ── Prod regression: relative imageUrl must resolve against VITE_API_BASE ────
// In prod the API lives on its own origin (api.thejobbook.app); the backend
// returns a relative imageUrl, and using it directly as <img src> loaded from
// the FRONTEND origin → 404 → permanent "Photo uploaded" fallback.

describe('Job photos — imageUrl resolves against VITE_API_BASE', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('resolveApiUrl handles edge shapes directly', () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test')
    expect(api.resolveApiUrl('/api/jobs/j1/photos/p1/file')).toBe('https://api.example.test/api/jobs/j1/photos/p1/file')
    // protocol-relative and non-path URLs pass through
    expect(api.resolveApiUrl('//cdn.example/x.jpg')).toBe('//cdn.example/x.jpg')
    expect(api.resolveApiUrl('blob:abc-123')).toBe('blob:abc-123')
    expect(api.resolveApiUrl('')).toBe('')
  })

  it('prefixes a relative imageUrl with the API base for the img src', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test')
    mockGetJobPhotos.mockResolvedValue({
      jobId: JOB.id,
      photos: [photo({ id: 'p1', imageUrl: '/api/jobs/j1/photos/p1/file' })],
    })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    const img = await within(section).findByAltText('Job photo')
    expect(img.getAttribute('src')).toBe('https://api.example.test/api/jobs/j1/photos/p1/file')
  })

  it('leaves the src unchanged when VITE_API_BASE is empty (dev proxy / mock)', async () => {
    vi.stubEnv('VITE_API_BASE', '')
    mockGetJobPhotos.mockResolvedValue({
      jobId: JOB.id,
      photos: [photo({ id: 'p1', imageUrl: '/api/jobs/j1/photos/p1/file' })],
    })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    const img = await within(section).findByAltText('Job photo')
    expect(img.getAttribute('src')).toBe('/api/jobs/j1/photos/p1/file')
  })

  it('passes absolute and data URLs through untouched', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test')
    mockGetJobPhotos.mockResolvedValue({
      jobId: JOB.id,
      photos: [
        photo({ id: 'p-abs', imageUrl: 'https://elsewhere.example/x.jpg' }),
        photo({ id: 'p-data', descriptor: 'inline', imageUrl: 'data:image/png;base64,AAAA' }),
      ],
    })
    renderWorkspace()
    openNotesTab()
    const section = await photosSection()
    const abs = await within(section).findByAltText('Job photo')
    expect(abs.getAttribute('src')).toBe('https://elsewhere.example/x.jpg')
    expect(within(section).getByAltText('inline').getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })
})
