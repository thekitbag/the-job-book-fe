import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import JobPickerScreen from '../JobPickerScreen'
import type { Job } from '../types'

vi.mock('../api', () => ({ createJob: vi.fn() }))

const ACTIVE: Job = {
  id: 'job-active', title: 'Garden Room', jobType: 'garden_room', roughLocationOrLabel: null,
  status: 'active', createdAt: '', updatedAt: '2026-07-10T09:00:00Z',
}
const PAUSED: Job = {
  id: 'job-paused', title: 'Loft Conversion', jobType: 'other', roughLocationOrLabel: null,
  status: 'paused', createdAt: '', updatedAt: '2026-07-09T09:00:00Z',
}
const FINISHED: Job = {
  id: 'job-finished', title: 'Kitchen Extension', jobType: 'extension', roughLocationOrLabel: null,
  status: 'completed', createdAt: '', updatedAt: '2026-07-08T09:00:00Z',
}

function renderPicker(jobs: Job[], selectedJobId: string | null = ACTIVE.id) {
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

describe('JobPickerScreen — paused/finished visibility', () => {
  it('shows paused and finished jobs alongside active jobs, all selectable', () => {
    renderPicker([ACTIVE, PAUSED, FINISHED])
    for (const job of [ACTIVE, PAUSED, FINISHED]) {
      const item = screen.getByRole('button', { name: new RegExp(job.title) })
      expect(item).toBeInTheDocument()
      expect(item).not.toBeDisabled()
    }
  })

  it('shows a lightweight status label for paused and finished jobs', () => {
    renderPicker([ACTIVE, PAUSED, FINISHED])
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByText('Finished')).toBeInTheDocument()
  })
})
