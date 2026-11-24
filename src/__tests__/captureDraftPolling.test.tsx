import { afterEach, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import CaptureDraftSheet from '../CaptureDraftSheet'
import * as api from '../api'
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  getCaptureDraft: vi.fn(),
}))
const pending = {
  noteId: 'note',
  jobId: 'job',
  state: 'extracting' as const,
  items: [],
  moreToCheckCount: 0,
  transcriptText: null,
}
afterEach(() => vi.useRealTimers())
it('polls only while open and closes quietly on failed processing', async () => {
  vi.mocked(api.getCaptureDraft).mockResolvedValue({
    ...pending,
    state: 'failed',
  })
  const close = vi.fn()
  render(
    <CaptureDraftSheet
      noteId="note"
      jobId="job"
      onClose={close}
      onOpenChecks={vi.fn()}
    />,
  )
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
})
it('stops immediately when the app is hidden', async () => {
  vi.mocked(api.getCaptureDraft).mockResolvedValue(pending)
  const close = vi.fn()
  const { unmount } = render(
    <CaptureDraftSheet
      noteId="note"
      jobId="job"
      onClose={close}
      onOpenChecks={vi.fn()}
    />,
  )
  await waitFor(() => expect(api.getCaptureDraft).toHaveBeenCalledOnce())
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(close).toHaveBeenCalledOnce()
  unmount()
})
it('stops after twenty seconds without turning pending work into success', async () => {
  vi.useFakeTimers()
  vi.mocked(api.getCaptureDraft).mockResolvedValue(pending)
  const close = vi.fn()
  render(
    <CaptureDraftSheet
      noteId="note"
      jobId="job"
      onClose={close}
      onOpenChecks={vi.fn()}
    />,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_001)
  })
  expect(close).toHaveBeenCalledOnce()
  const count = vi.mocked(api.getCaptureDraft).mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(api.getCaptureDraft).toHaveBeenCalledTimes(count)
})
it('never polls while offline', async () => {
  vi.useFakeTimers()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  render(
    <CaptureDraftSheet
      noteId="note"
      jobId="job"
      onClose={vi.fn()}
      onOpenChecks={vi.fn()}
    />,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(api.getCaptureDraft).not.toHaveBeenCalled()
})
it('discards a late response after the sheet unmounts', async () => {
  let finish!: (value: typeof pending) => void
  vi.mocked(api.getCaptureDraft).mockReturnValue(
    new Promise((r) => {
      finish = r
    }),
  )
  const close = vi.fn()
  const { unmount } = render(
    <CaptureDraftSheet
      noteId="note"
      jobId="job"
      onClose={close}
      onOpenChecks={vi.fn()}
    />,
  )
  unmount()
  await act(async () => finish(pending))
  expect(close).not.toHaveBeenCalled()
})
