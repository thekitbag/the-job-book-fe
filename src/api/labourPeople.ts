import type {
  CreateLabourPersonRequest,
  LabourPeopleResponse,
  LabourPerson,
  PatchLabourPersonRequest,
} from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import {
  mockCreateLabourPerson,
  mockGetLabourPeople,
  mockPatchLabourPerson,
} from './mock/labourPeople'

// Labour people: lightweight, user-owned workers reusable across jobs. They
// carry a default hourly rate and a default Budget treatment used to pre-fill
// new labour. Not payroll, not staff accounts — just enough to make labour
// predictable.

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as { code?: string; message?: string }
  const err = new ApiError(body.message ?? fallback, res.status) as ApiError & { code?: string }
  err.code = body.code
  throw err
}

// GET /api/jobs/:jobId/labour-people — active people for the user, with this
// job's hours/cost stats. People with no entries here are still returned.
export async function getLabourPeople(jobId: string): Promise<LabourPeopleResponse> {
  if (USE_MOCK) {
    await delay(250)
    return mockGetLabourPeople(jobId)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/labour-people`)
  if (!res.ok) throw new ApiError(`GET /api/jobs/${jobId}/labour-people → ${res.status}`, res.status)
  return res.json() as Promise<LabourPeopleResponse>
}

// POST /api/jobs/:jobId/labour-people
export async function createLabourPerson(jobId: string, req: CreateLabourPersonRequest): Promise<LabourPerson> {
  if (USE_MOCK) {
    await delay(250)
    return mockCreateLabourPerson(jobId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/labour-people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not add the person (${res.status})`)
  return res.json() as Promise<LabourPerson>
}

// PATCH /api/jobs/:jobId/labour-people/:personId — omitted preserves; null rate clears.
export async function patchLabourPerson(jobId: string, personId: string, req: PatchLabourPersonRequest): Promise<LabourPerson> {
  if (USE_MOCK) {
    await delay(250)
    return mockPatchLabourPerson(jobId, personId, req)
  }
  const res = await apiFetch(`/api/jobs/${jobId}/labour-people/${personId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await parseError(res, `Could not save the person (${res.status})`)
  return res.json() as Promise<LabourPerson>
}

// GET /api/internal/support/jobs/:jobId/labour-people — read-only support view.
export async function getSupportJobLabourPeople(jobId: string): Promise<LabourPeopleResponse> {
  if (USE_MOCK) {
    await delay(250)
    return mockGetLabourPeople(jobId)
  }
  const res = await apiFetch(`/api/internal/support/jobs/${jobId}/labour-people`)
  if (!res.ok) throw new ApiError(`GET support labour-people → ${res.status}`, res.status)
  return res.json() as Promise<LabourPeopleResponse>
}
