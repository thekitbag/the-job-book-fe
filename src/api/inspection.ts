import type { InspectionData } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import { mockInspectionData } from './mock/inspection'

// GET /api/internal/pilot/jobs/:jobId/inspection
// Requires X-Internal-Inspection-Key header plus an authenticated session.
export async function getInspectionData(jobId: string, inspectionKey: string): Promise<InspectionData> {
  if (USE_MOCK) {
    await delay(600)
    return mockInspectionData(jobId)
  }
  const res = await apiFetch(`/api/internal/pilot/jobs/${jobId}/inspection`, {
    headers: { 'X-Internal-Inspection-Key': inspectionKey },
  })
  if (res.status === 401) throw new ApiError('Invalid or missing inspection key', 401)
  if (!res.ok) throw new ApiError(`GET inspection → ${res.status}`, res.status)
  return res.json() as Promise<InspectionData>
}
