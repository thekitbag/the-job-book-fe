import { announceCaptureChange } from '../captureEvents'
import type { CreateJobRequest, EditableJobStatus, Job } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import {
  mockCreateJob,
  mockGetCurrentJob,
  mockGetJobs,
  mockPatchJob,
} from './mock/jobs'

export async function getCurrentJob(): Promise<Job> {
  if (USE_MOCK) return mockGetCurrentJob()
  const res = await apiFetch('/api/jobs/current')
  if (!res.ok)
    throw new ApiError(`GET /api/jobs/current → ${res.status}`, res.status)
  return res.json() as Promise<Job>
}

// GET /api/jobs — returns Mike's jobs, active/recent first.
export async function getJobs(): Promise<Job[]> {
  if (USE_MOCK) return mockGetJobs()
  const res = await apiFetch('/api/jobs')
  if (!res.ok) throw new ApiError(`GET /api/jobs → ${res.status}`, res.status)
  return res.json() as Promise<Job[]>
}

// POST /api/jobs — create a lightweight job. Requires network. One request
// creates one job; the caller must not retry a request it can't prove failed.
export async function createJob(req: CreateJobRequest): Promise<Job> {
  if (USE_MOCK) {
    const result = await mockCreateJob(req)
    announceCaptureChange()
    return result
  }
  const res = await apiFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new ApiError(`POST /api/jobs → ${res.status}`, res.status)
  const created = (await res.json()) as Job
  announceCaptureChange()
  return created
}

// PATCH /api/jobs/:jobId — owner-scoped job edit (title and/or status).
// `archived` is an archive action here, not a delete — it removes the job
// from the normal job list but keeps its data.
export async function patchJob(
  jobId: string,
  req: { title?: string; status?: EditableJobStatus },
): Promise<Job> {
  if (USE_MOCK) {
    const result = await mockPatchJob(jobId, req)
    announceCaptureChange()
    return result
  }
  const res = await apiFetch(`/api/jobs/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok)
    throw new ApiError(`PATCH /api/jobs/${jobId} → ${res.status}`, res.status)
  const updated = (await res.json()) as Job
  announceCaptureChange()
  return updated
}

export async function getJob(id: string): Promise<Job> {
  if (USE_MOCK) {
    const jobs = await mockGetJobs()
    const job = jobs.find((j) => j.id === id)
    if (!job) throw new ApiError('Job not found', 404)
    return job
  }
  const response = await apiFetch('/api/jobs/' + id)
  if (!response.ok) throw new ApiError('Could not open job', response.status)
  return response.json() as Promise<Job>
}
