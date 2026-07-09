import type { BudgetSummaryResponse, InspectionData, JobPhotosResponse, MemoryViewResponse, ReviewQueue, SupportJob, SupportUser, SupportUserJobsResponse, SupportUsersResponse } from '../../types'
import { ApiError } from '../client'
import { getMockSession, MOCK_SUPPORT_DIRECTORY } from './auth'
import { mockBudgetSummary } from './budget'
import { mockInspectionData } from './inspection'
import { MOCK_JOBS } from './jobs'
import { mockMemoryView } from './memory'
import { mockGetJobPhotos } from './photos'
import { mockGetReviewQueue } from './reviewQueue'

// Mock Founder Support Mode — READ-ONLY, gated exactly like the backend:
// 401 unauthenticated, 403 for any non-INTERNAL session. There are no support
// write functions here at all; the mock cannot mutate target-user data.

function requireInternal(): void {
  const session = getMockSession()
  if (!session) throw new ApiError('Unauthorized', 401)
  if (session.role !== 'INTERNAL') throw new ApiError('Not authorised for support access', 403)
}

// Mike owns the seeded jobs; Dave is a pilot with none (real empty state).
const MIKE_ID = 'user-mock-mike'

function toSupportUser(u: { id: string; email: string; name: string; role: 'PILOT' | 'INTERNAL' }): SupportUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-07-01T08:00:00.000Z',
    jobCount: u.id === MIKE_ID ? MOCK_JOBS.length : 0,
    lastActivityAt: u.id === MIKE_ID ? new Date().toISOString() : null,
  }
}

export function mockSupportUsers(): SupportUsersResponse {
  requireInternal()
  return { users: MOCK_SUPPORT_DIRECTORY.map(toSupportUser) }
}

export function mockSupportUserJobs(targetUserId: string): SupportUserJobsResponse {
  requireInternal()
  const user = MOCK_SUPPORT_DIRECTORY.find(u => u.id === targetUserId)
  if (!user) throw new ApiError('Not found', 404)
  const jobs: SupportJob[] = user.id === MIKE_ID
    ? MOCK_JOBS.map(j => ({
        id: j.id,
        ownerUserId: MIKE_ID,
        title: j.title,
        jobType: j.jobType,
        status: j.status,
        roughLocationOrLabel: j.roughLocationOrLabel,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      }))
    : []
  return { user: toSupportUser(user), jobs }
}

function requireMikeJob(jobId: string): void {
  if (!MOCK_JOBS.some(j => j.id === jobId)) throw new ApiError('Not found', 404)
}

// The job-scoped support reads delegate to the same mock state the target user
// sees in their own workspace, so support data matches the user's reality.
export function mockSupportInspection(jobId: string): InspectionData {
  requireInternal()
  requireMikeJob(jobId)
  return mockInspectionData(jobId)
}

export function mockSupportMemoryView(jobId: string): MemoryViewResponse {
  requireInternal()
  requireMikeJob(jobId)
  return mockMemoryView(jobId)
}

export function mockSupportBudgetSummary(jobId: string): BudgetSummaryResponse {
  requireInternal()
  requireMikeJob(jobId)
  return mockBudgetSummary(jobId)
}

export function mockSupportReviewQueue(jobId: string): ReviewQueue {
  requireInternal()
  requireMikeJob(jobId)
  return mockGetReviewQueue(jobId)
}

export function mockSupportPhotos(jobId: string): JobPhotosResponse {
  requireInternal()
  requireMikeJob(jobId)
  return mockGetJobPhotos(jobId)
}
