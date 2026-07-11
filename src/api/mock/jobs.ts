import type { EditableJobStatus, Job, JobType } from '../../types'
import { ApiError } from '../client'
import { delay } from './util'
import { getMockSession, MOCK_MIKE_EMAIL } from './auth'

const EDITABLE_STATUSES: EditableJobStatus[] = ['planning', 'started', 'finished', 'archived']

export const MOCK_JOBS: Job[] = [
  {
    id: 'job-pilot-garden-room-001',
    title: 'Garden Room',
    jobType: 'garden_room',
    roughLocationOrLabel: 'Mrs Patel – back garden',
    status: 'started',
    createdAt: '2026-06-01T08:00:00Z',
    updatedAt: '2026-06-10T09:00:00Z',
  },
  {
    id: 'job-pilot-extension-002',
    title: 'Kitchen Extension',
    jobType: 'extension',
    roughLocationOrLabel: null,
    status: 'started',
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-06-08T14:00:00Z',
  },
]

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

export async function mockCreateJob(title: string, jobType?: JobType): Promise<Job> {
  await delay(500)
  const newJob: Job = {
    id: `job-mock-${Date.now()}`,
    title: title.trim(),
    jobType: jobType ?? 'other',
    roughLocationOrLabel: null,
    status: 'started',
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
