import type { JobPhoto, JobPhotosResponse, PatchJobPhotoRequest, UploadJobPhotoRequest } from '../../types'
import { ApiError } from '../client'
import { findMockItem, mockSectionsFor } from './state'

// Tiny valid PNGs (1×1) as data URLs so previews render without any network.
// The real backend serves bytes from an authenticated route; a data URL is the
// mock's stand-in for "a URL the <img> tag can load with credentials intact".
const GREY_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg=='
const GREEN_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkkPz/HwADLwHZBv/EWAAAAABJRU5ErkJggg=='

// Stateful per-job photo store. Module-level, so it resets on every full page
// load (each Playwright test starts with page.goto) — no cross-test leakage.
const MOCK_PHOTO_SEED_JOB = 'job-pilot-garden-room-001'
let mockPhotosByJob: Map<string, JobPhoto[]> | null = null
let mockPhotoSeq = 0

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function buildSeedPhotos(jobId: string): JobPhoto[] {
  const linkedItem = findMockItem(mockSectionsFor(jobId), 'mem-view-004')
  return [
    // Newest first: a receipt photo with a descriptor, evidence only — it must
    // never appear as processed spend.
    {
      id: 'photo-seed-1',
      jobId,
      descriptor: 'Jewson receipt',
      mimeType: 'image/jpeg',
      sizeBytes: 245_000,
      uploadedAt: daysAgoISO(0),
      createdAt: daysAgoISO(0),
      updatedAt: daysAgoISO(0),
      linkedNoteId: null,
      linkedMemoryItemId: null,
      linkedNote: null,
      linkedMemoryItem: null,
      imageUrl: GREY_PX,
    },
    // Linked to a trusted memory item (the plasterboard order).
    {
      id: 'photo-seed-2',
      jobId,
      descriptor: null,
      mimeType: 'image/png',
      sizeBytes: 180_000,
      uploadedAt: daysAgoISO(1),
      createdAt: daysAgoISO(1),
      updatedAt: daysAgoISO(1),
      linkedNoteId: null,
      linkedMemoryItemId: linkedItem ? linkedItem.id : null,
      linkedNote: null,
      linkedMemoryItem: linkedItem
        ? { id: linkedItem.id, memoryType: linkedItem.memoryType, summary: linkedItem.summary }
        : null,
      imageUrl: GREEN_PX,
    },
    // Unlinked, no descriptor: a general job photo.
    {
      id: 'photo-seed-3',
      jobId,
      descriptor: null,
      mimeType: 'image/jpeg',
      sizeBytes: 310_000,
      uploadedAt: daysAgoISO(3),
      createdAt: daysAgoISO(3),
      updatedAt: daysAgoISO(3),
      linkedNoteId: null,
      linkedMemoryItemId: null,
      linkedNote: null,
      linkedMemoryItem: null,
      imageUrl: GREY_PX,
    },
  ]
}

function photosFor(jobId: string): JobPhoto[] {
  if (!mockPhotosByJob) mockPhotosByJob = new Map()
  if (!mockPhotosByJob.has(jobId)) {
    mockPhotosByJob.set(jobId, jobId === MOCK_PHOTO_SEED_JOB ? buildSeedPhotos(jobId) : [])
  }
  return mockPhotosByJob.get(jobId)!
}

export function mockGetJobPhotos(jobId: string): JobPhotosResponse {
  return { jobId, photos: photosFor(jobId).map(p => ({ ...p })) }
}

// Resolve + validate a link target pair the way the backend would.
function resolveLinks(jobId: string, linkedNoteId: string | null, linkedMemoryItemId: string | null): Pick<JobPhoto, 'linkedNoteId' | 'linkedMemoryItemId' | 'linkedNote' | 'linkedMemoryItem'> {
  if (linkedNoteId && linkedMemoryItemId) throw new ApiError('At most one link target', 400)
  if (linkedMemoryItemId) {
    const item = findMockItem(mockSectionsFor(jobId), linkedMemoryItemId)
    if (!item) throw new ApiError('Link target not found', 404)
    return {
      linkedNoteId: null,
      linkedMemoryItemId: item.id,
      linkedNote: null,
      linkedMemoryItem: { id: item.id, memoryType: item.memoryType, summary: item.summary },
    }
  }
  if (linkedNoteId) {
    // The mock keeps no server-note store; accept the id and echo a same-day note.
    return {
      linkedNoteId,
      linkedMemoryItemId: null,
      linkedNote: { id: linkedNoteId, capturedAt: new Date().toISOString() },
      linkedMemoryItem: null,
    }
  }
  return { linkedNoteId: null, linkedMemoryItemId: null, linkedNote: null, linkedMemoryItem: null }
}

// Uploading a photo mutates ONLY the photo store — never memory sections,
// candidate facts, or budget state. Receipt photos are evidence, not spend.
export function mockUploadJobPhoto(jobId: string, req: UploadJobPhotoRequest): JobPhoto {
  if (!req.file) throw new ApiError('Photo file is required', 400)
  // Cheap failure path for tests: a file named fail.* rejects like a 500.
  if (req.file.name?.startsWith('fail.')) throw new ApiError('Upload failed', 500)
  if (req.file.type && !req.file.type.startsWith('image/')) throw new ApiError('Unsupported photo type', 415)
  const descriptor = req.descriptor?.trim() ? req.descriptor.trim().slice(0, 120) : null
  const now = new Date().toISOString()
  const photo: JobPhoto = {
    id: `photo-mock-${++mockPhotoSeq}`,
    jobId,
    descriptor,
    mimeType: req.file.type || 'image/jpeg',
    sizeBytes: req.file.size,
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
    ...resolveLinks(jobId, req.linkedNoteId ?? null, req.linkedMemoryItemId ?? null),
    imageUrl: GREEN_PX,
  }
  photosFor(jobId).unshift(photo)
  return { ...photo }
}

export function mockPatchJobPhoto(jobId: string, photoId: string, req: PatchJobPhotoRequest): JobPhoto {
  const photo = photosFor(jobId).find(p => p.id === photoId)
  if (!photo) throw new ApiError('Photo not found', 404)
  if ('descriptor' in req) {
    photo.descriptor = req.descriptor?.trim() ? req.descriptor.trim().slice(0, 120) : null
  }
  // Link fields: omitted preserves; null clears. Ending up with both set is
  // rejected — the caller clears one side explicitly when switching targets.
  if ('linkedNoteId' in req || 'linkedMemoryItemId' in req) {
    const nextNote = 'linkedNoteId' in req ? (req.linkedNoteId ?? null) : photo.linkedNoteId
    const nextItem = 'linkedMemoryItemId' in req ? (req.linkedMemoryItemId ?? null) : photo.linkedMemoryItemId
    Object.assign(photo, resolveLinks(jobId, nextNote, nextItem))
  }
  photo.updatedAt = new Date().toISOString()
  return { ...photo }
}
