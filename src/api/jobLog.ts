import { ApiError, apiFetch, USE_MOCK } from './client'
import type { JobLogResponse } from '../types'
import { mockJobLog } from './mock/jobLog'
export async function getJobLog(jobId: string): Promise<JobLogResponse> {
  if (USE_MOCK) return mockJobLog(jobId)
  const res = await apiFetch(`/api/jobs/${jobId}/log`)
  if (!res.ok) throw new ApiError('Could not load job log', res.status)
  return res.json() as Promise<JobLogResponse>
}
