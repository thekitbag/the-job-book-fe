import type { JobPhoto, JobPhotosResponse, PatchJobPhotoRequest, UploadJobPhotoRequest } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import { mockGetJobPhotos, mockPatchJobPhoto, mockRemoveJobPhoto, mockUploadJobPhoto } from './mock/photos'

// GET /api/jobs/:jobId/photos — all photos for the job, newest first.
export async function getJobPhotos(jobId: string): Promise<JobPhotosResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetJobPhotos(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/photos`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/photos → ${res.status}`, res.status)
  return res.json() as Promise<JobPhotosResponse>
}

// POST /api/jobs/:jobId/photos — multipart upload. Photo-only save is valid:
// descriptor and link are optional, and at most one link target may be set.
export async function uploadJobPhoto(jobId: string, req: UploadJobPhotoRequest): Promise<JobPhoto> {
  if (USE_MOCK) {
    await delay(600)
    return mockUploadJobPhoto(jobId, req)
  }
  const form = new FormData()
  form.append('photo', req.file, req.file.name || 'photo')
  const descriptor = req.descriptor?.trim()
  if (descriptor) form.append('descriptor', descriptor)
  if (req.linkedNoteId) form.append('linkedNoteId', req.linkedNoteId)
  if (req.linkedMemoryItemId) form.append('linkedMemoryItemId', req.linkedMemoryItemId)
  const res = await apiFetch(`/api/jobs/${jobId}/photos`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: string; message?: string }
    const err = new ApiError(body.message ?? `Photo upload failed (${res.status})`, res.status) as ApiError & { code?: string }
    err.code = body.code
    throw err
  }
  return res.json() as Promise<JobPhoto>
}

// PATCH /api/jobs/:jobId/photos/:photoId — metadata only (descriptor/link).
// Omitted fields preserve existing values; null clears.
export async function patchJobPhoto(jobId: string, photoId: string, req: PatchJobPhotoRequest): Promise<JobPhoto> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchJobPhoto(jobId, photoId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/photos/${photoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new ApiError(`PATCH photo → ${res.status}`, res.status)
  return res.json() as Promise<JobPhoto>
}

// DELETE /api/jobs/:jobId/photos/:photoId — remove a photo from the job.
// Soft-delete server-side: the object is kept but hidden from the active list
// and the file route. Repeat delete → 404, matching memory-item removal.
export async function removeJobPhoto(jobId: string, photoId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    mockRemoveJobPhoto(jobId, photoId)
    return
  }
  const res = await apiFetch(`/api/jobs/${jobId}/photos/${photoId}`, { method: 'DELETE' })
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Photo not found', 404)
  if (!res.ok && res.status !== 204) throw new ApiError(`DELETE photo → ${res.status}`, res.status)
}
