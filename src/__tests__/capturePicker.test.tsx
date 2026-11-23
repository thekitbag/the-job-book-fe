import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CaptureJobPicker from '../CaptureJobPicker'
import type { Job } from '../types'
const job = (id: string, status: Job['status'] = 'started'): Job => ({
  id,
  title: id,
  jobType: 'other',
  status,
  roughLocationOrLabel: null,
  createdAt: '',
  updatedAt: '',
})
it('snapshots in-progress order at open, last-recorded first, despite a refresh', () => {
  const choose = vi.fn(),
    props = {
      jobs: [job('A'), job('B'), job('C'), job('Planning', 'planning')],
      order: ['A', 'B', 'C'],
      lastJobId: 'B',
      online: true,
      onChoose: choose,
      onClose: vi.fn(),
      onJobAdded: vi.fn(),
    }
  const { rerender } = render(<CaptureJobPicker {...props} />)
  const rows = () =>
    screen
      .getAllByRole('button', { name: /^(A|B|C)$/ })
      .map((b) => b.querySelector('strong')?.textContent)
  expect(rows()).toEqual(['B', 'A', 'C'])
  rerender(
    <CaptureJobPicker
      {...props}
      order={['C', 'A', 'B']}
      jobs={[job('C'), job('A'), job('B')]}
    />,
  )
  expect(rows()).toEqual(['B', 'A', 'C'])
  fireEvent.click(screen.getByRole('button', { name: 'B' }))
  expect(choose).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'B' }),
    'picker',
  )
})
it('offers cached jobs and Later offline and explains that New job needs signal', () => {
  render(
    <CaptureJobPicker
      jobs={[job('A')]}
      order={['A']}
      lastJobId={null}
      online={false}
      onChoose={vi.fn()}
      onClose={vi.fn()}
      onJobAdded={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'A' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Later' })).toBeVisible()
  expect(screen.getByText(/new job needs signal/i)).toBeVisible()
})

it('fills an initially empty picker when jobs arrive, then freezes those rows', () => {
  const props = {
    jobs: [] as Job[],
    order: ['B', 'A'],
    lastJobId: null,
    online: true,
    onChoose: vi.fn(),
    onClose: vi.fn(),
    onJobAdded: vi.fn(),
  }
  const { rerender } = render(<CaptureJobPicker {...props} />)
  rerender(<CaptureJobPicker {...props} jobs={[job('A'), job('B')]} />)
  expect(
    screen
      .getAllByRole('button', { name: /^(A|B)$/ })
      .map((b) => b.querySelector('strong')?.textContent),
  ).toEqual(['B', 'A'])
  rerender(
    <CaptureJobPicker
      {...props}
      order={['A', 'B']}
      jobs={[job('B'), job('A')]}
    />,
  )
  expect(
    screen
      .getAllByRole('button', { name: /^(A|B)$/ })
      .map((b) => b.querySelector('strong')?.textContent),
  ).toEqual(['B', 'A'])
})

it('confirms the capture is saved and shows when each job was last touched', () => {
  render(
    <CaptureJobPicker
      jobs={[job('A'), job('Planned', 'planning')]}
      order={['A']}
      lastJobId={null}
      online
      savedLabel="Recording saved"
      lastActivity={{ A: new Date().toISOString() }}
      onChoose={vi.fn()}
      onClose={vi.fn()}
      onJobAdded={vi.fn()}
    />,
  )
  expect(screen.getByText('Recording saved')).toBeVisible()
  expect(screen.getByRole('button', { name: 'A' })).toHaveTextContent('Today')
  fireEvent.click(
    screen.getByRole('button', { name: /Planning and finished jobs/ }),
  )
  expect(screen.getByRole('button', { name: 'Planned' })).toHaveTextContent(
    'Planning',
  )
})
