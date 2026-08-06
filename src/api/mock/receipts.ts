import type { JobEvidenceFileKind, JobReceipt, JobReceiptsResponse, PatchJobReceiptRequest, UploadJobReceiptRequest } from '../../types'
import { ApiError } from '../client'

// Stateful per-job receipt/invoice store, mirroring the photo mock's shape.
// Module-level, so it resets on every full page load (each Playwright test
// starts with page.goto) — no cross-test leakage.
//
// Nothing in here touches memory sections, candidate facts, budget, or money:
// a receipt is evidence Mike can find again, not processed spend.

// A 1×1 PNG and a tiny valid PDF as data URLs, so thumbnails render and Open
// works with no network. The real backend serves bytes from an authenticated
// route; a data URL is the mock's stand-in for "a URL the browser can load".
const GREY_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg=='
const TINY_PDF = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+Cg=='

// Mirrors the backend's accepted MIME list. The picker's accept attribute is a
// hint only — the backend (and this mock) is the authority.
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_RECEIPT_BYTES = 20 * 1024 * 1024

const MOCK_RECEIPT_SEED_JOB = 'job-pilot-garden-room-001'
let mockReceiptsByJob: Map<string, JobReceipt[]> | null = null
let mockReceiptSeq = 0

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function buildSeedReceipts(jobId: string): JobReceipt[] {
  return [
    // Newest first. A described PDF invoice…
    {
      id: 'receipt-seed-1',
      jobId,
      kind: 'receipt',
      fileKind: 'pdf',
      descriptor: 'Travis Perkins invoice',
      originalFileName: 'invoice-88213.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 84_000,
      uploadedAt: daysAgoISO(0),
      createdAt: daysAgoISO(0),
      updatedAt: daysAgoISO(0),
      fileUrl: TINY_PDF,
      thumbnailUrl: null,
    },
    // …and a photographed paper receipt saved with no description, which falls
    // back to its original file name for identity.
    {
      id: 'receipt-seed-2',
      jobId,
      kind: 'receipt',
      fileKind: 'image',
      descriptor: null,
      originalFileName: 'IMG_4821.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 260_000,
      uploadedAt: daysAgoISO(2),
      createdAt: daysAgoISO(2),
      updatedAt: daysAgoISO(2),
      fileUrl: GREY_PX,
      thumbnailUrl: GREY_PX,
    },
  ]
}

function receiptsFor(jobId: string): JobReceipt[] {
  if (!mockReceiptsByJob) mockReceiptsByJob = new Map()
  if (!mockReceiptsByJob.has(jobId)) {
    mockReceiptsByJob.set(jobId, jobId === MOCK_RECEIPT_SEED_JOB ? buildSeedReceipts(jobId) : [])
  }
  return mockReceiptsByJob.get(jobId)!
}

export function mockGetJobReceipts(jobId: string): JobReceiptsResponse {
  return { jobId, receipts: receiptsFor(jobId).map(r => ({ ...r })) }
}

// Validate the way the backend does: MIME type and size, never file extension
// alone, and reject an empty file.
function classify(file: File): JobEvidenceFileKind {
  const type = (file.type || '').toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (ACCEPTED_IMAGE_TYPES.includes(type)) return 'image'
  const err = new ApiError('That file type is not supported', 415) as ApiError & { code?: string }
  err.code = 'RECEIPT_UNSUPPORTED_TYPE'
  throw err
}

export function mockUploadJobReceipt(jobId: string, req: UploadJobReceiptRequest): JobReceipt {
  if (!req.file) throw new ApiError('A file is required', 400)
  // Cheap failure path for tests: a file named fail.* rejects like a 500.
  if (req.file.name?.startsWith('fail.')) throw new ApiError('Upload failed', 500)
  if (req.file.size === 0) throw new ApiError('That file is empty', 400)
  if (req.file.size > MAX_RECEIPT_BYTES) {
    const err = new ApiError('That file is too big', 413) as ApiError & { code?: string }
    err.code = 'RECEIPT_TOO_LARGE'
    throw err
  }
  const fileKind = classify(req.file)
  const descriptor = req.descriptor?.trim() ? req.descriptor.trim().slice(0, 120) : null
  const now = new Date().toISOString()
  const receipt: JobReceipt = {
    id: `receipt-mock-${++mockReceiptSeq}`,
    jobId,
    kind: 'receipt',
    fileKind,
    descriptor,
    // Path components stripped, length bounded — recognition only.
    originalFileName: req.file.name ? req.file.name.split(/[\\/]/).pop()!.slice(0, 160) : null,
    mimeType: req.file.type,
    sizeBytes: req.file.size,
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
    fileUrl: fileKind === 'pdf' ? TINY_PDF : GREY_PX,
    thumbnailUrl: fileKind === 'pdf' ? null : GREY_PX,
  }
  receiptsFor(jobId).unshift(receipt)
  return { ...receipt }
}

// Soft removal: the receipt leaves the active list (and the file route it would
// have served), matching the backend rule that the stored object is retained
// rather than physically deleted.
export function mockRemoveJobReceipt(jobId: string, receiptId: string): void {
  const receipts = receiptsFor(jobId)
  const idx = receipts.findIndex(r => r.id === receiptId)
  if (idx === -1) throw new ApiError('Receipt not found', 404)
  receipts.splice(idx, 1)
}

export function mockPatchJobReceipt(jobId: string, receiptId: string, req: PatchJobReceiptRequest): JobReceipt {
  const receipt = receiptsFor(jobId).find(r => r.id === receiptId)
  if (!receipt) throw new ApiError('Receipt not found', 404)
  if ('descriptor' in req) {
    receipt.descriptor = req.descriptor?.trim() ? req.descriptor.trim().slice(0, 120) : null
  }
  receipt.updatedAt = new Date().toISOString()
  return { ...receipt }
}

export function _resetMockReceiptsForTesting(): void {
  mockReceiptsByJob = null
  mockReceiptSeq = 0
}
