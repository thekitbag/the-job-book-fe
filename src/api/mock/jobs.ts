import type { CreateJobRequest, EditableJobStatus, Job } from '../../types'
import { ApiError } from '../client'
import { delay } from './util'
import { getMockSession, MOCK_MIKE_EMAIL } from './auth'

const EDITABLE_STATUSES: EditableJobStatus[] = ['planning', 'started', 'finished', 'archived']

const SEED_JOBS: Job[] = [
  {
    id: 'job-pilot-garden-room-001',
    title: 'Garden Room',
    jobType: 'garden_room',
    roughLocationOrLabel: 'Mrs Patel – back garden',
    status: 'started',
    createdAt: '2026-06-01T08:00:00Z',
    updatedAt: '2026-06-10T09:00:00Z',
  },
  // No Where value: All Jobs must be happy showing the name alone.
  {
    id: 'job-pilot-extension-002',
    title: 'Kitchen Extension',
    jobType: 'extension',
    roughLocationOrLabel: null,
    status: 'started',
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-06-08T14:00:00Z',
  },
  {
    id: 'job-pilot-planning-003',
    title: 'Grant James Roof',
    jobType: 'other',
    roughLocationOrLabel: 'Ash Grove',
    status: 'planning',
    createdAt: '2026-05-18T08:00:00Z',
    updatedAt: '2026-06-05T11:00:00Z',
  },
  // Long name + long address: the row grammar has to survive both on a 390px
  // phone without pushing the chevron or the group count off the screen.
  {
    id: 'job-pilot-planning-004',
    title: 'Full re-roof and rear extension at the Hollybush Farmhouse annexe',
    jobType: 'other',
    roughLocationOrLabel: 'The Hollybush Farmhouse annexe, Lower Wraxall Lane, Bradford-on-Avon',
    status: 'planning',
    createdAt: '2026-05-12T08:00:00Z',
    updatedAt: '2026-06-02T16:00:00Z',
  },
  {
    id: 'job-pilot-finished-005',
    title: 'Whitmore Patio',
    jobType: 'other',
    roughLocationOrLabel: 'Elm Close',
    status: 'finished',
    createdAt: '2026-03-02T08:00:00Z',
    updatedAt: '2026-05-12T15:00:00Z',
  },
  {
    id: 'job-pilot-finished-006',
    title: 'Okoro Loft',
    jobType: 'other',
    roughLocationOrLabel: null,
    status: 'finished',
    createdAt: '2026-02-10T08:00:00Z',
    updatedAt: '2026-04-30T15:00:00Z',
  },
  // Archived: must never appear in Book Home, All Jobs, or the counts.
  {
    id: 'job-pilot-archived-007',
    title: 'Old Shed Rebuild',
    jobType: 'other',
    roughLocationOrLabel: 'Yard',
    status: 'archived',
    createdAt: '2026-01-05T08:00:00Z',
    updatedAt: '2026-02-01T09:00:00Z',
  },
]
export const MOCK_JOBS: Job[] = SEED_JOBS.map(job => ({ ...job }))

export function _resetMockJobsForTesting(): void {
  MOCK_JOBS.splice(0, MOCK_JOBS.length, ...SEED_JOBS.map(job => ({ ...job })))
}

// Prefers the most recently updated started job, then planning, then
// finished — archived jobs are never a "current" pick. Mirrors GET
// /api/jobs/current, though the app UI currently drives selection via
// getJobs() + local pickJob().
export async function mockGetCurrentJob(): Promise<Job> {
  await delay(200)
  const byStatus = (s: Job['status']) =>
    [...MOCK_JOBS].filter(j => j.status === s).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const job = byStatus('started') ?? byStatus('planning') ?? byStatus('finished')
  if (!job) throw new ApiError('No jobs', 404)
  return job
}

export async function mockGetJobs(): Promise<Job[]> {
  await delay(300)
  // A signed-up mock account other than seeded Mike starts with no jobs.
  const session = getMockSession()
  if (session && session.email !== MOCK_MIKE_EMAIL) return []
  // Planning/started/finished jobs stay visible; archived never appears in
  // the normal job list — it's an archive action, not a delete.
  return MOCK_JOBS.filter(j => j.status !== 'archived')
}

// Mirrors the backend create contract: title required after trimming, Where
// optional (blank → null, max 160), status only planning/started and
// defaulting to started. Never touches the selected-job id or any queued
// recording — creating a job is the caller's cue to switch, not the mock's.
export async function mockCreateJob(req: CreateJobRequest): Promise<Job> {
  await delay(500)
  const title = req.title.trim()
  if (!title) throw new ApiError('Title is required', 400)
  if (title.length > 80) throw new ApiError('Title too long', 400)
  const where = (req.roughLocationOrLabel ?? '').trim()
  if (where.length > 160) throw new ApiError('Where is too long', 400)
  const status = req.status ?? 'started'
  if (status !== 'planning' && status !== 'started') throw new ApiError('Invalid status', 400)
  const newJob: Job = {
    id: `job-mock-${Date.now()}`,
    title,
    jobType: 'other',
    roughLocationOrLabel: where || null,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  MOCK_JOBS.unshift(newJob)
  return newJob
}

// Owner-scoped title/status edit, mirroring backend validation (title:
// trim, non-blank, ≤80; status: one of planning/started/finished/archived).
export async function mockPatchJob(jobId: string, req: { title?: string; status?: EditableJobStatus }): Promise<Job> {
  await delay(300)
  const job = MOCK_JOBS.find(j => j.id === jobId)
  if (!job) throw new ApiError('Job not found', 404)
  if (req.title === undefined && req.status === undefined) throw new ApiError('No editable fields', 400)
  if (req.title !== undefined) {
    const title = req.title.trim()
    if (!title) throw new ApiError('Title is required', 400)
    if (title.length > 80) throw new ApiError('Title too long', 400)
    job.title = title
  }
  if (req.status !== undefined) {
    if (!EDITABLE_STATUSES.includes(req.status)) throw new ApiError('Invalid status', 400)
    job.status = req.status
  }
  job.updatedAt = new Date().toISOString()
  return { ...job }
}
