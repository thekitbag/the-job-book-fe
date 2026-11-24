import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import ReviewQueueScreen from '../ReviewQueueScreen'
import BookHomeScreen from '../BookHomeScreen'
import { ToastProvider } from '../Toast'
import * as api from '../api'
import {
  mockCreateMemoryItem,
  mockMemoryView,
  mockUpdateMemoryItem,
  mockReturnMemoryItem,
  mockRemoveMemoryItem,
  mockVerifyMemoryItem,
} from '../api/mock/memory'
import { _resetMockMemoryForTesting } from '../api/mock/state'
import { mockGetReviewQueue, mockSubmitQueueDecision, resetMockQueue } from '../api/mock/reviewQueue'
import { mockJobLog } from '../api/mock/jobLog'
import { MOCK_JOBS } from '../api/mock/jobs'
import { track } from '../analytics'
import type { MemoryViewResponse } from '../types'
const JOB = MOCK_JOBS[0]
vi.mock('../api', async (original) => ({
  ...(await original<typeof api>()),
  getMemoryView: vi.fn(),
  createMemoryItem: vi.fn(),
  updateMemoryItem: vi.fn(),
  removeMemoryItem: vi.fn(),
  returnMemoryItem: vi.fn(),
  verifyMemoryItem: vi.fn(),
  getReviewQueue: vi.fn(),
  submitQueueDecision: vi.fn(),
  getJobLog: vi.fn(),
  getJobPhotos: vi.fn(async () => ({ jobId: JOB.id, photos: [] })),
  getDraftFacts: vi.fn(async () => []),
}))
vi.mock('../analytics', async (original) => ({
  ...(await original<typeof import('../analytics')>()),
  track: vi.fn(),
}))
vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))
vi.mock('../useRecorder', () => ({
  isRecordingSupported: true,
  useRecorder: () => ({ state: 'idle', elapsedMs: 0, permissionError: null, start: vi.fn(), stop: vi.fn() }),
}))
beforeEach(() => {
  _resetMockMemoryForTesting()
  resetMockQueue()
  vi.mocked(api.getMemoryView).mockImplementation(async (id) => mockMemoryView(id))
  vi.mocked(api.createMemoryItem).mockImplementation(async (id, req) => mockCreateMemoryItem(id, req))
  vi.mocked(api.updateMemoryItem).mockImplementation(async (id, item, req) =>
    mockUpdateMemoryItem(id, item, req),
  )
  vi.mocked(api.returnMemoryItem).mockImplementation(async (id, item, req) =>
    mockReturnMemoryItem(id, item, req),
  )
  vi.mocked(api.removeMemoryItem).mockImplementation(async (id, item) => mockRemoveMemoryItem(id, item))
  vi.mocked(api.verifyMemoryItem).mockImplementation(async (id, item) => {
    mockVerifyMemoryItem(id, item)
    return { uncertaintyFlags: [] }
  })
  vi.mocked(api.getReviewQueue).mockImplementation(async (id) => mockGetReviewQueue(id))
  vi.mocked(api.submitQueueDecision).mockImplementation(async (id, req) => mockSubmitQueueDecision(id, req))
  vi.mocked(api.getJobLog).mockImplementation(async (id) => mockJobLog(id))
})
function workspace() {
  return render(
    <ToastProvider>
      <CurrentJobWorkspace job={JOB} onOpenBookHome={() => {}} onOpenReviewQueue={() => {}} />
    </ToastProvider>,
  )
}
async function section(name: string) {
  const back = screen.queryByRole('button', { name: /job home/i })
  if (back) fireEvent.click(back)
  fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }))
  await screen.findByRole('tabpanel')
}
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
function guard() {
  const clone = document.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-builder-note]').forEach((n) => n.remove())
  const text = clone.textContent ?? ''
  expect(text).not.toMatch(
    /\b(budget|spend|cost|paid|to pay|money in|money out|account|settlement|allowance|category|rate)\b|£/i,
  )
  for (const n of clone.querySelectorAll('[aria-label],[placeholder],[title]'))
    expect(
      [n.getAttribute('aria-label'), n.getAttribute('placeholder'), n.getAttribute('title')].join(' '),
    ).not.toMatch(
      /\b(budget|spend|cost|paid|to pay|money in|money out|account|settlement|allowance|category|rate)\b|£/i,
    )
}
describe('job memory workflows', () => {
  it('uses authoritative Hours totals and refetches per-person and daily totals after adding only who, day, hours', async () => {
    workspace()
    await section('Hours')
    const before = mockMemoryView(JOB.id).hours.totalHours
    expect(screen.getByRole('region', { name: 'Hours total' })).toHaveTextContent(before + 'h')
    fireEvent.click(screen.getByRole('button', { name: 'Add hours' }))
    expect(screen.getByRole('dialog').querySelectorAll('input')).toHaveLength(3)
    fill('Who', 'Kurt')
    fill('Which day', '2026-11-21')
    fill('How many hours', '6')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.createMemoryItem).toHaveBeenCalledWith(JOB.id, {
      memoryType: 'labour',
      labourPerson: 'Kurt',
      labourHours: '6',
      happenedAt: '2026-11-21',
    })
    expect(screen.getByRole('region', { name: 'Hours total' })).toHaveTextContent(
      String(Number(before) + 6) + 'h',
    )
    expect(
      screen
        .getAllByRole('button', { name: 'Open actions for Kurt' })
        .some((row) => row.textContent?.includes('6h')),
    ).toBe(true)
    expect(track).toHaveBeenCalledWith('hours_added_by_hand')
  })
  it('adds all three material states, edits without changing unit shape, and returns a leftover with no extra fields', async () => {
    workspace()
    await section('Materials')
    for (const [tab, label, state] of [
      ['Bought', 'Add bought item', 'bought'],
      ['Used', 'Add used item', 'used'],
      ['Left over', 'Add leftover', 'left_over'],
    ]) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      fireEvent.click(screen.getByRole('button', { name: label }))
      fill('Item', `Test ${tab}`)
      fill('Number or amount', '6')
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByText(`Test ${tab}`)).toBeVisible()
      expect(track).toHaveBeenCalledWith('material_added_by_hand', { state })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Test Left over' }))
    fireEvent.click(screen.getByRole('button', { name: /mark as returned/i }))
    fill('How many did you take back?', '4')
    fireEvent.click(screen.getByRole('button', { name: 'Save return' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Open actions for Test Left over' })).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('tab', { name: 'Returned' }))
    expect(screen.getByRole('button', { name: 'Open actions for Test Left over' })).toHaveTextContent('4')
    fireEvent.click(screen.getByRole('tab', { name: 'Bought' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for hardcore' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fix memory' }))
    expect(screen.getByLabelText('Number or amount')).toHaveValue('8 bags')
    fill('Supplier (optional)', 'Selco')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.updateMemoryItem).toHaveBeenCalledWith(JOB.id, 'mem-view-001', {
      materialName: 'hardcore',
      quantity: '8 bags',
      supplierName: 'Selco',
      locationOrUse: null,
    })
    const item = mockMemoryView(JOB.id)
      .sections.flatMap((s) => s.items)
      .find((i) => i.id === 'mem-view-001')!
    expect(item.quantity).toBe('8')
    expect(item.unit).toBe('bags')
  })
  it('keeps entered values after a failed save and makes a failed post-save refresh retryable', async () => {
    workspace()
    await section('Materials')
    fireEvent.click(screen.getByRole('button', { name: 'Add bought item' }))
    fill('Item', 'OSB')
    fill('Number or amount', 'about half a pallet')
    vi.mocked(api.createMemoryItem).mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByLabelText('Item')).toHaveValue('OSB')
    vi.mocked(api.getMemoryView).mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t refresh')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('OSB')
    expect(api.createMemoryItem).toHaveBeenCalledTimes(2)
  })
  it('ignores a memory read that finishes after switching jobs', async () => {
    let resolve!: (v: MemoryViewResponse) => void
    vi.mocked(api.getMemoryView).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    const rendered = workspace()
    rendered.rerender(
      <ToastProvider>
        <CurrentJobWorkspace job={MOCK_JOBS[1]} onOpenBookHome={() => {}} onOpenReviewQueue={() => {}} />
      </ToastProvider>,
    )
    await waitFor(() => expect(api.getMemoryView).toHaveBeenLastCalledWith(MOCK_JOBS[1].id))
    await act(async () => resolve(mockMemoryView(JOB.id)))
    fireEvent.click(screen.getByRole('button', { name: 'Open Materials' }))
    expect(screen.queryByText('hardcore')).not.toBeInTheDocument()
  })
  it('confirms a check, preserves core analytics properties, and renders no financial question', async () => {
    render(<ReviewQueueScreen job={JOB} onClose={() => {}} />)
    await screen.findByText(/waiting/)
    guard()
    const card = screen.getByTestId('queue-item-queue-item-mock-001')
    fireEvent.click(within(card).getByRole('button', { name: 'Remember this' }))
    await waitFor(() => expect(within(card).getByText('Saved to trusted memory')).toBeVisible())
    expect(track).toHaveBeenCalledWith('review_decision_submitted', {
      job_id: JOB.id,
      section_key: 'ordered_materials',
      action: 'confirm',
      memory_type: 'ordered_material',
      has_correction: false,
    })
    expect(api.submitQueueDecision).toHaveBeenCalledWith(JOB.id, {
      queueItemId: 'queue-item-mock-001',
      action: 'confirm',
      corrected: undefined,
      reason: undefined,
      uncertaintyResolution: 'resolved',
    })
  })
  it('language guard scans job home, Hours, every material tab, drawers, forms, Job log filters, check correction, and Book Home over legacy money-heavy data', async () => {
    const legacy = mockMemoryView(JOB.id)
    const extra = {
      costAmount: '240',
      costCurrency: 'GBP',
      totalCostAmount: '240',
      budgetCategoryId: 'old',
      paidLabel: '£240 paid',
      refundAmount: '80',
    }
    for (const s of legacy.sections)
      for (const item of s.items)
        Object.assign(item, extra, {
          summary: item.memoryType.endsWith('_material') ? 'Old cost £240 paid on account' : item.summary,
        })
    Object.assign(legacy, {
      costSummary: { totalKnownCost: { knownSpendLabel: '£99999 known spend' } },
      budgetSummary: { total: '£99999' },
    })
    vi.mocked(api.getMemoryView).mockResolvedValue(legacy)
    const rendered = workspace()
    await waitFor(() => expect(api.getMemoryView).toHaveBeenCalled())
    guard()
    await section('Hours')
    guard()
    fireEvent.click(screen.getByRole('button', { name: 'Add hours' }))
    guard()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await section('Materials')
    for (const tab of ['Bought', 'Used', 'Left over', 'Returned']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      guard()
      const row = document.querySelector('.mem-row-tap')
      if (row) {
        fireEvent.click(row)
        guard()
        fireEvent.click(screen.getByRole('button', { name: 'Fix memory' }))
        guard()
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      }
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Bought' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add bought item' }))
    guard()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: /job home/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Job log' }))
    await screen.findByText('Skip hire, £250.')
    for (const tab of ['All', 'Notes', 'Photos']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      guard()
    }
    rendered.unmount()
    const checks = render(<ReviewQueueScreen job={JOB} onClose={() => {}} />)
    await screen.findByText(/waiting/)
    guard()
    fireEvent.click(
      within(screen.getByTestId('queue-item-queue-item-mock-001')).getByRole('button', {
        name: 'Fix details',
      }),
    )
    guard()
    checks.unmount()
    render(
      <BookHomeScreen jobs={MOCK_JOBS} workshop={null} onOpenAllJobs={() => {}} onOpenWorkshop={() => {}} />,
    )
    guard()
  })
})

it('does not let an old-job add invalidate the new job memory load', async () => {
  let completeAdd!: (item: Awaited<ReturnType<typeof api.createMemoryItem>>) => void
  let completeLoad!: (data: MemoryViewResponse) => void
  vi.mocked(api.createMemoryItem).mockReturnValueOnce(
    new Promise((r) => {
      completeAdd = r
    }),
  )
  const rendered = workspace()
  await section('Materials')
  fireEvent.click(screen.getByRole('button', { name: 'Add bought item' }))
  fill('Item', 'OSB')
  fill('Number or amount', '3 sheets')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  vi.mocked(api.getMemoryView).mockReturnValueOnce(
    new Promise((r) => {
      completeLoad = r
    }),
  )
  rendered.rerender(
    <ToastProvider>
      <CurrentJobWorkspace job={MOCK_JOBS[1]} onOpenBookHome={() => {}} onOpenReviewQueue={() => {}} />
    </ToastProvider>,
  )
  await act(async () =>
    completeAdd(
      mockCreateMemoryItem(JOB.id, {
        memoryType: 'ordered_material',
        materialName: 'OSB',
        quantity: '3 sheets',
      }),
    ),
  )
  await act(async () => completeLoad(mockMemoryView(MOCK_JOBS[1].id)))
  fireEvent.click(screen.getByRole('button', { name: 'Open Hours' }))
  expect(screen.getByRole('region', { name: 'Hours total' })).toHaveTextContent('0h')
})

it('renders the server Hours block without recalculating from legacy sections', async () => {
  const view = mockMemoryView(JOB.id)
  view.hours = { totalHours: '23.75', people: [{ name: 'Server-resolved person', hours: '23.75' }], days: [] }
  vi.mocked(api.getMemoryView).mockResolvedValueOnce(view)
  workspace()
  await section('Hours')
  expect(screen.getByRole('region', { name: 'Hours total' })).toHaveTextContent('23.75h')
  expect(screen.getByRole('region', { name: 'Hours total' })).toHaveTextContent('Server-resolved person')
})

it('corrects a legacy draft without resending financial fields or duplicating its unit', async () => {
  const queue = mockGetReviewQueue(JOB.id)
  const item = queue.sections.flatMap((s) => s.items).find((i) => i.id === 'queue-item-mock-001')!
  Object.assign(item.proposedMemory, {
    costAmount: '40',
    costCurrency: 'GBP',
    budgetCategoryId: 'old',
    summary: 'Legacy cost £40',
  })
  vi.mocked(api.getReviewQueue).mockResolvedValue(queue)
  render(<ReviewQueueScreen job={JOB} onClose={() => {}} />)
  const card = await screen.findByTestId('queue-item-queue-item-mock-001')
  fireEvent.click(within(card).getByRole('button', { name: 'Fix details' }))
  fill('Supplier (optional)', 'Selco')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(api.submitQueueDecision).toHaveBeenCalled())
  const corrected = vi.mocked(api.submitQueueDecision).mock.calls[0][1].corrected!
  expect(corrected.quantity).toBe('8')
  expect(corrected.unit).toBe('bags')
  expect(corrected.supplierName).toBe('Selco')
  expect(Object.keys(corrected).join(' ')).not.toMatch(/cost|budget|paid|refund/i)
  expect(corrected.summary).not.toMatch(/cost|£/i)
})

it('moving Used and Left over preserves the existing rough quantity and unit', async () => {
  workspace()
  await section('Materials')
  fireEvent.click(screen.getByRole('tab', { name: 'Left over' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for sand' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move to Used' }))
  await waitFor(() => expect(api.updateMemoryItem).toHaveBeenCalled())
  expect(api.updateMemoryItem).toHaveBeenCalledWith(JOB.id, 'mem-view-007', { memoryType: 'used_material' })
  fireEvent.click(screen.getByRole('tab', { name: 'Used' }))
  expect(await screen.findByRole('button', { name: 'Open actions for sand' })).toHaveTextContent(
    'about half bag',
  )
})
