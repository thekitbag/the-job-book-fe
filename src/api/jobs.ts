import type { Job, JobType } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { mockCreateJob, mockGetCurrentJob, mockGetJobs, mockPatchJob } from './mock/jobs'

export async function getCurrentJob(): Promise<Job> {
  if (USE_MOCK) return mockGetCurrentJob()
  const res = await apiFetch('/api/jobs/current')
  if (!res.ok) throw new ApiError(`GET /api/jobs/current → ${res.status}`, res.status)
  return res.json() as Promise<Job>
}

// GET /api/jobs — returns Mike's jobs, active/recent first.
export async function getJobs(): Promise<Job[]> {
  if (USE_MOCK) return mockGetJobs()
  const res = await apiFetch('/api/jobs')
  if (!res.ok) throw new ApiError(`GET /api/jobs → ${res.status}`, res.status)
  return res.json() as Promise<Job[]>
}

// POST /api/jobs — create a lightweight job. Requires network.
export async function createJob(title: string, jobType?: JobType): Promise<Job> {
  if (USE_MOCK) return mockCreateJob(title, jobType)
  const res = await apiFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim(), jobType }),
  })
  if (!res.ok) throw new ApiError(`POST /api/jobs → ${res.status}`, res.status)
  return res.json() as Promise<Job>
}

// PATCH /api/jobs/:jobId — owner-scoped job edit (title only in this slice).
export async function patchJob(jobId: string, req: { title?: string }): Promise<Job> {
  if (USE_MOCK) return mockPatchJob(jobId, req)
  const res = await apiFetch(`/api/jobs/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new ApiError(`PATCH /api/jobs/${jobId} → ${res.status}`, res.status)
  return res.json() as Promise<Job>
}
