import type { CreateJobContactRequest, JobContact, JobDetailsResponse, PatchJobContactRequest, PatchJobDetailsRequest } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import {
  mockCreateJobContact, mockGetJobDetails, mockPatchJobContact, mockPatchJobDetails, mockRemoveJobContact,
} from './mock/jobDetails'

// Job details = one site address plus job-local contacts. Deliberately its own
// read: contacts are reference context Mike opens occasionally, so they must
// never be fetched (or fail) on the job-home path that carries Record.

// GET /api/jobs/:jobId/details
export async function getJobDetails(jobId: string): Promise<JobDetailsResponse> {
  if (USE_MOCK) {
    await delay(250)
    return mockGetJobDetails(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/details`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/details → ${res.status}`, res.status)
  return res.json() as Promise<JobDetailsResponse>
}

// PATCH /api/jobs/:jobId/details — omitted preserves, null clears. The backend
// trims and bounds the value; this is the authoritative response we adopt.
export async function patchJobDetails(jobId: string, req: PatchJobDetailsRequest): Promise<JobDetailsResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchJobDetails(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/details`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new ApiError(`PATCH /api/jobs/${jobId}/details → ${res.status}`, res.status)
  return res.json() as Promise<JobDetailsResponse>
}

// POST /api/jobs/:jobId/contacts — name only is a valid contact.
export async function createJobContact(jobId: string, req: CreateJobContactRequest): Promise<JobContact> {
  if (USE_MOCK) {
    await delay(300)
    return mockCreateJobContact(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new ApiError(`POST /api/jobs/${jobId}/contacts → ${res.status}`, res.status)
  return res.json() as Promise<JobContact>
}

// PATCH /api/jobs/:jobId/contacts/:contactId
export async function patchJobContact(jobId: string, contactId: string, req: PatchJobContactRequest): Promise<JobContact> {
  if (USE_MOCK) {
    await delay(300)
    return mockPatchJobContact(jobId, contactId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/contacts/${contactId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new ApiError(`PATCH contact → ${res.status}`, res.status)
  return res.json() as Promise<JobContact>
}

// DELETE /api/jobs/:jobId/contacts/:contactId — soft delete server-side; the
// contact leaves the list. Repeat delete → 404, matching receipt/photo removal.
export async function removeJobContact(jobId: string, contactId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300)
    mockRemoveJobContact(jobId, contactId)
    return
  }
  const res = await apiFetch(`/api/jobs/${jobId}/contacts/${contactId}`, { method: 'DELETE' })
  if (res.status === 401) throw new ApiError('Unauthenticated', 401)
  if (res.status === 403) throw new ApiError('Forbidden', 403)
  if (res.status === 404) throw new ApiError('Contact not found', 404)
  if (!res.ok && res.status !== 204) throw new ApiError(`DELETE contact → ${res.status}`, res.status)
}
