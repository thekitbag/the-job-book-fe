import type { Job } from './types'

// User-facing copy for API status values. The API value 'started' deliberately
// renders as 'In progress' (founder copy decision) — never rename the API
// value itself; PATCH bodies must still send 'started'.
const JOB_STATUS_LABELS: Record<Job['status'], string> = {
  planning: 'Planning',
  started: 'In progress',
  finished: 'Finished',
  archived: 'Archived',
}

// Sentence case: "on_hold" → "On hold" — a plain fallback for a status value
// the frontend doesn't have specific copy for yet.
function titleCase(s: string): string {
  const words = s.replace(/[_-]+/g, ' ').trim().split(' ').filter(Boolean)
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ')
}

export function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status as Job['status']] ?? titleCase(status)
}

// The three normal choices offered in the Change status sheet. Archiving is
// not a normal status row — it removes the job from the Switch list, so the
// sheet presents it as a separated danger action behind its own confirmation.
export const NORMAL_JOB_STATUSES: { value: 'planning' | 'started' | 'finished'; label: string }[] = [
  { value: 'planning', label: JOB_STATUS_LABELS.planning },
  { value: 'started', label: JOB_STATUS_LABELS.started },
  { value: 'finished', label: JOB_STATUS_LABELS.finished },
]
