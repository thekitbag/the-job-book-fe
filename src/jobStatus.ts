import type { EditableJobStatus, Job } from './types'

const JOB_STATUS_LABELS: Record<Job['status'], string> = {
  active: 'In progress',
  paused: 'Paused',
  completed: 'Finished',
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

// The only statuses offered in the edit surface — archived is excluded (not
// editable through this endpoint in this slice).
export const EDITABLE_JOB_STATUSES: { value: EditableJobStatus; label: string }[] = [
  { value: 'active', label: JOB_STATUS_LABELS.active },
  { value: 'paused', label: JOB_STATUS_LABELS.paused },
  { value: 'completed', label: JOB_STATUS_LABELS.completed },
]
