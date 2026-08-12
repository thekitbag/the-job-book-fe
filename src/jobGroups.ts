import type { Job } from './types'

// The book level only ever talks about three states. Archived jobs are not
// part of the index at all — the job list arrives with them already excluded
// (GET /api/jobs), and this filters again so a stale cache can't leak one in.
export type JobGroupKey = 'started' | 'planning' | 'finished'

export const JOB_GROUP_LABELS: Record<JobGroupKey, string> = {
  started: 'In progress',
  planning: 'Planning',
  finished: 'Finished',
}

// Deterministic order: most recently touched first inside a group. This is an
// ordering signal only — it is never shown to Mike as a date, because
// updatedAt records when the job row changed, not when work happened.
function byRecency(a: Job, b: Job): number {
  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
}

export function jobsInGroup(jobs: Job[], key: JobGroupKey): Job[] {
  return jobs.filter(j => j.status === key).sort(byRecency)
}

/** Jobs on the book: work in hand first, then work being planned. */
export function liveJobs(jobs: Job[]): Job[] {
  return [...jobsInGroup(jobs, 'started'), ...jobsInGroup(jobs, 'planning')]
}

/** Every job the index shows, once, in group order. */
export function indexedJobs(jobs: Job[]): Job[] {
  return [...liveJobs(jobs), ...jobsInGroup(jobs, 'finished')]
}
