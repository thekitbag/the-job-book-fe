import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import * as api from '../api'
import type { Job, JobPhoto, JobReceipt, MemoryViewResponse } from '../types'

// Receipts and invoices in Job log: storage and recall of job evidence.
// The rules under test are (1) classification follows Mike's intent at upload
// time — a receipt image lives in Receipts and All, never in Photos — and
// (2) uploading or removing evidence never moves Budget or Money.

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-receipt-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(),
    getJobReceipts: vi.fn(),
    uploadJobReceipt: vi.fn(),
    patchJobReceipt: vi.fn(),
    removeJobReceipt: vi.fn(),
  }
})

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockGetJobPhotos = vi.mocked(api.getJobPhotos)
const mockGetJobReceipts = vi.mocked(api.getJobReceipts)
const mockUploadJobReceipt = vi.mocked(api.uploadJobReceipt)
const mockPatchJobReceipt = vi.mocked(api.patchJobReceipt)
const mockRemoveJobReceipt = vi.mocked(api.removeJobReceipt)

const JOB: Job = {
  id: 'job-receipt-001', title: 'Garden Room', jobType: 'garden_room',
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

function receipt(over: Partial<JobReceipt> = {}): JobReceipt {
  return {
    id: 'receipt-1', jobId: JOB.id, kind: 'receipt', fileKind: 'image',
    descriptor: null, originalFileName: 'IMG_4821.jpg', mimeType: 'image/jpeg', sizeBytes: 1000,
    uploadedAt: '2026-07-08T09:00:00Z', createdAt: '2026-07-08T09:00:00Z', updatedAt: '2026-07-08T09:00:00Z',
    fileUrl: '/api/jobs/job-receipt-001/receipts/receipt-1/file',
    thumbnailUrl: '/api/jobs/job-receipt-001/receipts/receipt-1/file',
    ...over,
  }
}

function photo(over: Partial<JobPhoto> = {}): JobPhoto {
  return {
    id: 'photo-1', jobId: JOB.id, descriptor: 'Footings before pour', mimeType: 'image/jpeg', sizeBytes: 1000,
    uploadedAt: '2026-07-07T09:00:00Z', createdAt: '2026-07-07T09:00:00Z', updatedAt: '2026-07-07T09:00:00Z',
    linkedNoteId: null, linkedMemoryItemId: null, linkedNote: null, linkedMemoryItem: null,
    imageUrl: '/api/jobs/job-receipt-001/photos/photo-1/file',
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
  mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [] })
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}

function openJobLog(tab: 'All' | 'Notes' | 'Photos' | 'Receipts') {
  const back = screen.queryByRole('button', { name: /job home/i })
  if (back) fireEvent.click(back)
  fireEvent.click(screen.getByRole('button', { name: 'Open Job log' }))
  fireEvent.click(screen.getByRole('tab', { name: tab }))
}

async function receiptsSection() {
  return await screen.findByRole('region', { name: /receipts and invoices/i })
}

function pickFile(form: HTMLElement, name: string, type: string, content: string[] = ['bytes']) {
  const file = new File(content, name, { type })
  fireEvent.change(form.querySelector('input[type="file"]')!, { target: { files: [file] } })
  return file
}

describe('Job log — Receipts view and add flow', () => {
  it('Job log has a Receipts filter with an Add receipt or invoice action', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    expect(within(section).getByRole('button', { name: 'Add receipt or invoice' })).toBeInTheDocument()
    expect(await within(section).findByText('No receipts or invoices yet.')).toBeInTheDocument()
  })

  it('file-only save works: no description typed, appears after the backend confirms', async () => {
    const saved = receipt()
    mockUploadJobReceipt.mockResolvedValue(saved)
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })

    // Save is unavailable until a file is chosen; nothing else is required.
    expect(within(section).getByRole('button', { name: 'Save receipt' })).toBeDisabled()
    const file = pickFile(form, 'IMG_4821.jpg', 'image/jpeg')
    // The list only ever shows what the backend returns: the row appears via
    // the refetch after a successful upload, never optimistically.
    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [saved] })
    expect(within(section).queryByRole('button', { name: /IMG_4821.jpg — receipt actions/ })).toBeNull()
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))
    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalled())
    // The bytes are read before the request, so what's posted is an in-memory
    // copy of the selection, not the picker's (possibly lazy) handle.
    const [, sent] = mockUploadJobReceipt.mock.calls[0]
    expect(sent.descriptor).toBeNull()
    expect(sent.file.name).toBe(file.name)
    expect(sent.file.size).toBe(file.size)
    expect(await within(section).findByRole('button', { name: /IMG_4821.jpg — receipt actions/ })).toBeInTheDocument()
  })

  it('the add form asks for nothing beyond the file and an optional description', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    const fields = Array.from(form.querySelectorAll('input, select, textarea')).map(el => el.getAttribute('name'))
    expect(fields).toEqual(['receipt', 'descriptor'])
    expect(within(form).queryByText(/supplier|amount|category|paid/i)).toBeNull()
  })

  // A strict MIME accept list greys PDFs out in the iOS Files picker and in
  // Android's Drive picker, so the file can never be selected and no upload is
  // ever attempted. The extension form is what makes those pickers usable.
  it('the picker uses a mobile-friendly accept value, not a strict MIME list', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const input = within(section).getByRole('form', { name: 'Add receipt or invoice' }).querySelector('input[type="file"]')!
    expect(input.getAttribute('accept')).toBe('image/*,.pdf,application/pdf')
  })

  it('an optional description is sent and shown as the receipt identity', async () => {
    const saved = receipt({ descriptor: 'Jewson receipt' })
    mockUploadJobReceipt.mockResolvedValue(saved)
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'IMG_4821.jpg', 'image/jpeg')
    fireEvent.change(form.querySelector('input[name="descriptor"]')!, { target: { value: 'Jewson receipt' } })
    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [saved] })
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalledWith(JOB.id, expect.objectContaining({ descriptor: 'Jewson receipt' })))
    expect(await within(section).findByText('Jewson receipt')).toBeInTheDocument()
  })

  it('a PDF invoice is saved and cued as a PDF rather than a broken image', async () => {
    const pdf = receipt({
      id: 'receipt-pdf', fileKind: 'pdf', mimeType: 'application/pdf',
      descriptor: 'Travis Perkins invoice', originalFileName: 'invoice-88213.pdf', thumbnailUrl: null,
      fileUrl: '/api/jobs/job-receipt-001/receipts/receipt-pdf/file',
    })
    mockUploadJobReceipt.mockResolvedValue(pdf)
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'invoice-88213.pdf', 'application/pdf')
    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [pdf] })
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalled())
    const row = await within(section).findByRole('button', { name: /Travis Perkins invoice — receipt actions/ })
    expect(row.querySelector('.receipt-row-meta')!.textContent).toMatch(/PDF/)
    // No <img> to break: the PDF gets a file-type tile instead.
    expect(row.querySelector('img')).toBeNull()
    expect(row.querySelector('.receipt-thumb--file')!.textContent).toBe('PDF')
  })

  it('falls back to the original file name, then to generic copy, for identity', async () => {
    mockGetJobReceipts.mockResolvedValue({
      jobId: JOB.id,
      receipts: [receipt(), receipt({ id: 'receipt-2', originalFileName: null })],
    })
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    expect(await within(section).findByText('IMG_4821.jpg')).toBeInTheDocument()
    expect(within(section).getByText('Receipt uploaded')).toBeInTheDocument()
  })

  // The backend has the last word on file type: an ambiguous selection is sent,
  // and a 415 comes back as the same plain-English message.
  it('a backend-rejected file type shows a clear message and the form stays recoverable', async () => {
    const rejected = Object.assign(new Error('bad type'), { status: 415, code: 'RECEIPT_UNSUPPORTED_TYPE' })
    mockUploadJobReceipt.mockRejectedValueOnce(rejected).mockResolvedValue(receipt())
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'scan-0012', 'application/octet-stream')
    fireEvent.change(form.querySelector('input[name="descriptor"]')!, { target: { value: 'Jewson receipt' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(/file type isn’t supported/i)
    // Description preserved, so a retry with another file is one tap.
    expect((form.querySelector('input[name="descriptor"]') as HTMLInputElement).value).toBe('Jewson receipt')
    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [receipt()] })
    pickFile(form, 'IMG_4821.jpg', 'image/jpeg')
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))
    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalledTimes(2))
    expect(await within(section).findByText('IMG_4821.jpg')).toBeInTheDocument()
  })

  it('a failed upload is retryable without re-picking the file', async () => {
    mockUploadJobReceipt.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(receipt())
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'IMG_4821.jpg', 'image/jpeg')
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent(/could not upload/i)

    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [receipt()] })
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))
    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalledTimes(2))
    expect(await within(section).findByText('IMG_4821.jpg')).toBeInTheDocument()
  })
})

// ── Phone pickers: the file's declared type is a hint, not proof ─────────────
// A PDF chosen from iOS Files or Android's Google Drive picker arrives with an
// unreliable MIME type. Anything that rejects on `file.type` alone blocks Mike's
// real receipts on the only device he uses, with no request to show for it, so
// these cases must all reach the backend.

describe('Job log — receipts from phone file pickers', () => {
  const IOS_PDF_SHAPES: [string, string][] = [
    ['no type at all', ''],
    ['application/octet-stream', 'application/octet-stream'],
    ['application/x-pdf', 'application/x-pdf'],
    ['text/plain', 'text/plain'],
  ]

  it.each(IOS_PDF_SHAPES)('uploads a .pdf declared as %s', async (_label, type) => {
    mockUploadJobReceipt.mockResolvedValue(receipt({ id: 'receipt-ios', fileKind: 'pdf', originalFileName: 'receipt.pdf' }))
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    const file = pickFile(form, 'receipt.pdf', type)
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    // The upload is attempted, with the file's bytes intact and its type
    // normalised to application/pdf whatever the picker claimed.
    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalled())
    const sent = mockUploadJobReceipt.mock.calls[0][1].file
    expect({ name: sent.name, type: sent.type, size: sent.size })
      .toEqual({ name: 'receipt.pdf', type: 'application/pdf', size: file.size })
    expect(sent.size).toBeGreaterThan(0)
    expect(within(section).queryByRole('alert')).toBeNull()
  })

  it('uploads an uppercase .PDF from a cloud picker', async () => {
    mockUploadJobReceipt.mockResolvedValue(receipt({ fileKind: 'pdf' }))
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'Invoice 88213.PDF', 'application/octet-stream')
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))
    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalled())
  })

  it('logs the selected file metadata so a phone failure can be diagnosed', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    mockUploadJobReceipt.mockResolvedValue(receipt({ fileKind: 'pdf' }))
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    const file = pickFile(form, 'receipt.pdf', '')
    expect(log).toHaveBeenCalledWith('[receipt] file selected', { name: 'receipt.pdf', type: '', size: file.size })
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))
    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalled())
    expect(log).toHaveBeenCalledWith('[receipt] upload attempt', { name: 'receipt.pdf', type: '', size: file.size })
    log.mockRestore()
  })

  // Google Drive can hand over a placeholder with no bytes. There is nothing to
  // POST, so this is neither an upload success nor an upload failure — the copy
  // has to name the actual fix.
  it('a zero-byte cloud file is not uploaded and says how to fix it', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'drive-invoice.pdf', 'application/pdf', [])
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    const alert = await within(section).findByRole('alert')
    expect(alert).toHaveTextContent(/download it to your phone and try again/i)
    expect(alert).not.toHaveTextContent(/check your connection/i)
    expect(mockUploadJobReceipt).not.toHaveBeenCalled()
    // Still recoverable: the form stays open with the description intact.
    expect(within(section).getByRole('button', { name: 'Save receipt' })).toBeEnabled()
  })

  // The reported Android failure: Drive hands over a File that looks fine —
  // real name, real type, non-zero size — but whose bytes can't actually be
  // read. If that read happens inside fetch's multipart streaming, fetch
  // rejects with a bare TypeError: no status, no code, nothing sent, and the
  // only copy left is "check your connection". Reading first makes it
  // explainable.
  it('a Drive file whose bytes cannot be read says so instead of blaming the connection', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    const file = pickFile(form, 'drive-invoice.pdf', 'application/pdf')
    // A lazily-backed content:// handle that fails when something reads it.
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(
      Object.assign(new Error('Could not read file'), { name: 'NotReadableError' }),
    )
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    const alert = await within(section).findByRole('alert')
    expect(alert).toHaveTextContent(/download it to your phone and try again/i)
    expect(alert).not.toHaveTextContent(/check your connection/i)
    expect(mockUploadJobReceipt).not.toHaveBeenCalled()
    // The console line says which stage failed, so the next report is diagnosable.
    expect(log).toHaveBeenCalledWith('[receipt] upload failed', expect.objectContaining({
      stage: 'read', name: 'drive-invoice.pdf', error: 'ReceiptFileReadError',
    }))
    log.mockRestore()
  })

  it('a file that reads as zero bytes is treated the same way', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    const file = pickFile(form, 'drive-invoice.pdf', 'application/pdf')
    // Non-zero size up front, nothing behind it — the placeholder only reveals
    // itself on read, so the pre-check can't catch this one.
    vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(0))
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(/download it to your phone and try again/i)
    expect(mockUploadJobReceipt).not.toHaveBeenCalled()
  })

  it('a genuine network failure still says to check the connection', async () => {
    mockUploadJobReceipt.mockRejectedValue(new TypeError('Failed to fetch'))
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'receipt.pdf', 'application/pdf')
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    // The file read fine, so this one really is retryable.
    expect(await within(section).findByRole('alert')).toHaveTextContent(/check your connection/i)
    expect(mockUploadJobReceipt).toHaveBeenCalled()
  })

  it('an obvious non-image, non-PDF file is refused before any request', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    const form = within(section).getByRole('form', { name: 'Add receipt or invoice' })
    pickFile(form, 'notes.docx', 'application/msword')
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(/file type isn’t supported/i)
    expect(mockUploadJobReceipt).not.toHaveBeenCalled()
  })
})

describe('Job log — receipts are separated from photos', () => {
  beforeEach(() => {
    mockGetJobPhotos.mockResolvedValue({ jobId: JOB.id, photos: [photo()] })
    mockGetJobReceipts.mockResolvedValue({
      jobId: JOB.id,
      receipts: [
        receipt({ descriptor: 'Jewson receipt' }),
        receipt({ id: 'receipt-pdf', fileKind: 'pdf', mimeType: 'application/pdf', descriptor: 'Travis Perkins invoice', originalFileName: 'invoice-88213.pdf', thumbnailUrl: null }),
      ],
    })
  })

  it('an image receipt and a PDF invoice both appear in Receipts', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    expect(await within(section).findByText('Jewson receipt')).toBeInTheDocument()
    expect(within(section).getByText('Travis Perkins invoice')).toBeInTheDocument()
  })

  it('both appear in All, tagged as receipts', async () => {
    renderWorkspace()
    openJobLog('All')
    const feed = await screen.findByRole('list', { name: 'Job log' })
    expect(await within(feed).findByText('Jewson receipt')).toBeInTheDocument()
    expect(within(feed).getByText('Travis Perkins invoice')).toBeInTheDocument()
    expect(within(feed).getAllByText('Receipt')).toHaveLength(2)
    // Photos still belong to All too — receipts are added, not substituted.
    expect(within(feed).getByText('Footings before pour')).toBeInTheDocument()
  })

  it('neither appears under Photos — a receipt image is not a job photo', async () => {
    renderWorkspace()
    openJobLog('Photos')
    const photos = await screen.findByRole('region', { name: /job photos/i })
    expect(await within(photos).findByText('Footings before pour')).toBeInTheDocument()
    expect(within(photos).queryByText('Jewson receipt')).toBeNull()
    expect(within(photos).queryByText('Travis Perkins invoice')).toBeNull()
    // Photos are read from the photos route only; receipts never feed it.
    expect(mockGetJobPhotos).toHaveBeenCalledWith(JOB.id)
  })
})

describe('Job log — receipt actions', () => {
  async function openRowActions(name: RegExp) {
    const section = await receiptsSection()
    fireEvent.click(await within(section).findByRole('button', { name }))
    return screen.getByRole('dialog')
  }

  it('opening a receipt uses the authenticated backend file route, not object storage', async () => {
    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [receipt({ descriptor: 'Jewson receipt' })] })
    renderWorkspace()
    openJobLog('Receipts')
    const drawer = await openRowActions(/Jewson receipt — receipt actions/)
    const open = within(drawer).getByRole('link', { name: /open file/i })
    expect(open).toHaveAttribute('href', '/api/jobs/job-receipt-001/receipts/receipt-1/file')
    expect(open.getAttribute('href')).not.toMatch(/r2\.|cloudflarestorage|amazonaws/)
    expect(open).toHaveAttribute('target', '_blank')
  })

  it('the description can be edited from the drawer without re-uploading', async () => {
    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [receipt()] })
    mockPatchJobReceipt.mockResolvedValue(receipt({ descriptor: 'Jewson receipt' }))
    renderWorkspace()
    openJobLog('Receipts')
    const drawer = await openRowActions(/IMG_4821.jpg — receipt actions/)
    fireEvent.click(within(drawer).getByRole('button', { name: /edit description/i }))
    const form = within(drawer).getByRole('form', { name: 'Edit receipt description' })
    fireEvent.change(form.querySelector('input[name="descriptor"]')!, { target: { value: 'Jewson receipt' } })
    fireEvent.click(within(form).getByRole('button', { name: /save description/i }))

    await waitFor(() => expect(mockPatchJobReceipt).toHaveBeenCalledWith(JOB.id, 'receipt-1', { descriptor: 'Jewson receipt' }))
    const section = await receiptsSection()
    expect(await within(section).findByText('Jewson receipt')).toBeInTheDocument()
  })

  it('removal needs confirmation, states what is not deleted, then the receipt disappears', async () => {
    let store: JobReceipt[] = [receipt({ descriptor: 'Jewson receipt' })]
    mockGetJobReceipts.mockImplementation(() => Promise.resolve({ jobId: JOB.id, receipts: store.map(r => ({ ...r })) }))
    mockRemoveJobReceipt.mockImplementation((_jobId, id) => { store = store.filter(r => r.id !== id); return Promise.resolve() })
    renderWorkspace()
    openJobLog('Receipts')
    const drawer = await openRowActions(/Jewson receipt — receipt actions/)
    fireEvent.click(within(drawer).getByRole('button', { name: /remove receipt/i }))
    expect(mockRemoveJobReceipt).not.toHaveBeenCalled()
    expect(within(drawer).getByText(/remove this receipt\?/i)).toBeInTheDocument()
    expect(within(drawer).getByText(/Budget, Money, notes, and photos are not changed/i)).toBeInTheDocument()

    fireEvent.click(within(drawer).getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(mockRemoveJobReceipt).toHaveBeenCalledWith(JOB.id, 'receipt-1'))
    const section = await receiptsSection()
    await waitFor(() => expect(within(section).queryByText('Jewson receipt')).not.toBeInTheDocument())
  })

  it('a failed removal keeps the receipt with retryable copy', async () => {
    mockGetJobReceipts.mockResolvedValue({ jobId: JOB.id, receipts: [receipt({ descriptor: 'Jewson receipt' })] })
    mockRemoveJobReceipt.mockRejectedValue(new Error('boom'))
    renderWorkspace()
    openJobLog('Receipts')
    const drawer = await openRowActions(/Jewson receipt — receipt actions/)
    fireEvent.click(within(drawer).getByRole('button', { name: /remove receipt/i }))
    fireEvent.click(within(drawer).getByRole('button', { name: /^remove$/i }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent(/could not remove/i)
    const section = await receiptsSection()
    expect(within(section).getByText('Jewson receipt')).toBeInTheDocument()
  })
})

describe('Job log — receipts never move money', () => {
  it('uploading a receipt does not refresh or change Budget', async () => {
    mockUploadJobReceipt.mockResolvedValue(receipt({ descriptor: 'Jewson receipt' }))
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    pickFile(within(section).getByRole('form', { name: 'Add receipt or invoice' }), 'IMG_4821.jpg', 'image/jpeg')
    const budgetCallsBefore = mockGetBudgetSummary.mock.calls.length
    fireEvent.click(within(section).getByRole('button', { name: 'Save receipt' }))
    await waitFor(() => expect(mockUploadJobReceipt).toHaveBeenCalled())

    // No budget/memory refetch is triggered: a receipt is evidence, not spend.
    expect(mockGetBudgetSummary.mock.calls.length).toBe(budgetCallsBefore)
    fireEvent.click(screen.getByRole('button', { name: /job home/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Budget' }))
    const hero = await screen.findByRole('region', { name: /^budget$/i })
    expect(within(hero).getByText(/£600/)).toBeInTheDocument()
  })

  it('removing a receipt does not change Budget', async () => {
    let store: JobReceipt[] = [receipt({ descriptor: 'Jewson receipt' })]
    mockGetJobReceipts.mockImplementation(() => Promise.resolve({ jobId: JOB.id, receipts: store.map(r => ({ ...r })) }))
    mockRemoveJobReceipt.mockImplementation((_jobId, id) => { store = store.filter(r => r.id !== id); return Promise.resolve() })
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(await within(section).findByRole('button', { name: /Jewson receipt — receipt actions/ }))
    const drawer = screen.getByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: /remove receipt/i }))
    const budgetCallsBefore = mockGetBudgetSummary.mock.calls.length
    fireEvent.click(within(drawer).getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(mockRemoveJobReceipt).toHaveBeenCalled())

    expect(mockGetBudgetSummary.mock.calls.length).toBe(budgetCallsBefore)
    fireEvent.click(screen.getByRole('button', { name: /job home/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Budget' }))
    const hero = await screen.findByRole('region', { name: /^budget$/i })
    expect(within(hero).getByText(/£600/)).toBeInTheDocument()
  })

  it('the add form says plainly that saving does not change Budget or Money', async () => {
    renderWorkspace()
    openJobLog('Receipts')
    const section = await receiptsSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Add receipt or invoice' }))
    expect(within(section).getByText(/doesn’t change your Budget or Money/i)).toBeInTheDocument()
  })
})
