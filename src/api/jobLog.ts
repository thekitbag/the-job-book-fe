import { ApiError, apiFetch, USE_MOCK } from './client'
import type { JobLogResponse } from '../types'
import { capturePhotoLog, captureNoteLog } from './mock/capture'
import { mockJobLog } from './mock/jobLog'
export async function getJobLog(jobId: string): Promise<JobLogResponse> {
  if (USE_MOCK) {
    const captures = captureNoteLog(jobId)
    return {
      entries: [
        ...mockJobLog(jobId).entries.filter(
          (e) => !captures.some((c) => c.id === e.id),
        ),
        ...captures,
        ...capturePhotoLog(jobId),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    }
  }
  const res = await apiFetch(`/api/jobs/${jobId}/log`)
  if (!res.ok) throw new ApiError('Could not load job log', res.status)
  return res.json() as Promise<JobLogResponse>
}
