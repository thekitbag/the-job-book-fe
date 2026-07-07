import type { Job, JobType } from '../../types'
import { delay } from './util'
import { getMockSession, MOCK_MIKE_EMAIL } from './auth'

export const MOCK_JOBS: Job[] = [
  {
    id: 'job-pilot-garden-room-001',
    title: 'Garden Room',
    jobType: 'garden_room',
    roughLocationOrLabel: 'Mrs Patel – back garden',
    status: 'active',
    createdAt: '2026-06-01T08:00:00Z',
    updatedAt: '2026-06-10T09:00:00Z',
  },
  {
    id: 'job-pilot-extension-002',
    title: 'Kitchen Extension',
    jobType: 'extension',
    roughLocationOrLabel: null,
    status: 'active',
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-06-08T14:00:00Z',
  },
]

export async function mockGetCurrentJob(): Promise<Job> {
  await delay(200)
  return MOCK_JOBS[0]
}

export async function mockGetJobs(): Promise<Job[]> {
  await delay(300)
  // A signed-up mock account other than seeded Mike starts with no jobs.
  const session = getMockSession()
  if (session && session.email !== MOCK_MIKE_EMAIL) return []
  return MOCK_JOBS
}

export async function mockCreateJob(title: string, jobType?: JobType): Promise<Job> {
  await delay(500)
  const newJob: Job = {
    id: `job-mock-${Date.now()}`,
    title: title.trim(),
    jobType: jobType ?? 'other',
    roughLocationOrLabel: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  MOCK_JOBS.unshift(newJob)
  return newJob
}
