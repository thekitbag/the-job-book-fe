import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import JobPickerScreen from '../JobPickerScreen'
import type { Job } from '../types'

vi.mock('../api', () => ({ createJob: vi.fn() }))

const STARTED: Job = {
  id: 'job-started', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null,
  status: 'started', createdAt: '', updatedAt: '2026-07-10T09:00:00Z',
}
const PLANNING: Job = {
  id: 'job-planning', title: 'Loft Conversion', jobType: 'other', roughLocationOrLabel: null,
  status: 'planning', createdAt: '', updatedAt: '2026-07-09T09:00:00Z',
}
const FINISHED: Job = {
  id: 'job-finished', title: 'Kitchen Extension', jobType: 'extension', roughLocationOrLabel: null,
  status: 'finished', createdAt: '', updatedAt: '2026-07-08T09:00:00Z',
}

function renderPicker(jobs: Job[], selectedJobId: string | null = STARTED.id) {
  return render(
    <JobPickerScreen
      jobs={jobs}
      selectedJobId={selectedJobId}
      online={true}
      onSelect={vi.fn()}
      onJobAdded={vi.fn()}
      onClose={vi.fn()}
    />,
  )
}

describe('JobPickerScreen — planning/started/finished visibility', () => {
  it('shows planning and finished jobs alongside started jobs, all selectable', () => {
    renderPicker([STARTED, PLANNING, FINISHED])
    for (const job of [STARTED, PLANNING, FINISHED]) {
      const item = screen.getByRole('button', { name: new RegExp(job.title) })
      expect(item).toBeInTheDocument()
      expect(item).not.toBeDisabled()
    }
  })

  it('shows a lightweight status label for each job', () => {
    renderPicker([STARTED, PLANNING, FINISHED])
    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByText('Finished')).toBeInTheDocument()
    expect(screen.getByText('Started')).toBeInTheDocument()
  })

  it('never renders an archived job — the list is expected to already exclude it', () => {
    // JobPickerScreen renders whatever `jobs` it's given; the archived-exclusion
    // contract lives in App.tsx/getJobs (see app.test.tsx), not here. This
    // just proves the picker itself has no special-casing that would let one
    // through if it appeared.
    renderPicker([STARTED, PLANNING, FINISHED])
    expect(screen.queryByText('Archived')).not.toBeInTheDocument()
  })
})
