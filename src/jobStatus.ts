import type { EditableJobStatus, Job } from './types'

const JOB_STATUS_LABELS: Record<Job['status'], string> = {
  planning: 'Planning',
  started: 'Started',
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

// All four statuses are offered in the edit surface. Archived is last and
// treated specially by the caller (requires explicit confirmation — it's an
// archive action, not a delete, but it does remove the job from the normal list).
export const EDITABLE_JOB_STATUSES: { value: EditableJobStatus; label: string }[] = [
  { value: 'planning', label: JOB_STATUS_LABELS.planning },
  { value: 'started', label: JOB_STATUS_LABELS.started },
  { value: 'finished', label: JOB_STATUS_LABELS.finished },
  { value: 'archived', label: JOB_STATUS_LABELS.archived },
]
