import { expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CaptureDraftSheet from '../CaptureDraftSheet'
import * as api from '../api'
vi.mock('../api', () => ({
  getCaptureDraft: vi.fn(),
  confirmCaptureDraft: vi.fn(),
  getReviewQueue: vi.fn(),
  submitQueueDecision: vi.fn(),
}))
const hours = {
  queueItemId: 'shown-hours',
  kind: 'hours' as const,
  person: 'Mike',
  hours: '2',
  day: '2026-11-23',
  uncertain: false,
}
const material = {
  queueItemId: 'shown-material',
  kind: 'material' as const,
  state: 'used' as const,
  item: 'OSB',
  amount: 'about two sheets',
  supplier: 'Jewson',
  notes: 'back wall',
  uncertain: true,
}
const draft = {
  noteId: 'n',
  jobId: 'j',
  state: 'ready' as const,
  transcriptText: 'original',
  items: [hours, material],
  moreToCheckCount: 3,
}
it('shows every value and uncertainty; sends only the visible ids once, excluding more-to-check facts', async () => {
  vi.mocked(api.getCaptureDraft).mockResolvedValue(draft)
  let complete!: () => void
  vi.mocked(api.confirmCaptureDraft).mockImplementation(async () => {
    await new Promise<void>((r) => {
      complete = r
    })
    return { confirmed: ['shown-hours', 'shown-material'], alreadyDecided: [] }
  })
  const close = vi.fn()
  render(
    <CaptureDraftSheet
      noteId="n"
      jobId="j"
      onClose={close}
      onOpenChecks={vi.fn()}
    />,
  )
  await screen.findByText('about two sheets')
  for (const text of [
    'Mike',
    '2026-11-23',
    'OSB',
    'Jewson',
    'back wall',
    'Not certain',
  ])
    expect(screen.getByText(new RegExp(text))).toBeVisible()
  expect(screen.getByText(/3 more/)).toBeVisible()
  const button = screen.getByRole('button', { name: 'Looks right' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(api.confirmCaptureDraft).toHaveBeenCalledOnce()
  expect(api.confirmCaptureDraft).toHaveBeenCalledWith('n', [
    'shown-hours',
    'shown-material',
  ])
  await act(async () => complete())
  expect(close).toHaveBeenCalledOnce()
})
it('rereads DRAFT_CHANGED, reports nothing confirmed, and requires a new tap on the refreshed values', async () => {
  vi.mocked(api.getCaptureDraft)
    .mockResolvedValueOnce(draft)
    .mockResolvedValue({ ...draft, items: [{ ...hours, hours: '4' }] })
  vi.mocked(api.confirmCaptureDraft).mockRejectedValue(
    Object.assign(new Error('changed'), { status: 409, code: 'DRAFT_CHANGED' }),
  )
  const close = vi.fn()
  render(
    <CaptureDraftSheet
      noteId="n"
      jobId="j"
      onClose={close}
      onOpenChecks={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Looks right' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /nothing was confirmed/i,
  )
  await waitFor(() => expect(api.getCaptureDraft).toHaveBeenCalledTimes(2))
  expect(screen.getByText(/4 hours/)).toBeVisible()
  expect(close).not.toHaveBeenCalled()
})
it('closes a silent ready draft without offering confirmation', async () => {
  vi.mocked(api.getCaptureDraft).mockResolvedValue({
    ...draft,
    items: [],
    moreToCheckCount: 0,
    transcriptText: '',
  })
  const close = vi.fn()
  render(
    <CaptureDraftSheet
      noteId="n"
      jobId="j"
      onClose={close}
      onOpenChecks={vi.fn()}
    />,
  )
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(api.confirmCaptureDraft).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('button', { name: 'Looks right' }),
  ).not.toBeInTheDocument()
})
it('Fix can drop one shown item; Looks right then sends only the remaining shown item', async () => {
  vi.mocked(api.getCaptureDraft)
    .mockResolvedValueOnce(draft)
    .mockResolvedValue({ ...draft, items: [hours] })
  vi.mocked(api.submitQueueDecision).mockResolvedValue({
    queueItemId: material.queueItemId,
    action: 'dismiss',
    status: 'dismissed',
    sourceCandidateFactIds: [],
  })
  vi.mocked(api.confirmCaptureDraft).mockResolvedValue({
    confirmed: ['shown-hours'],
    alreadyDecided: [],
  })
  render(
    <CaptureDraftSheet
      noteId="n"
      jobId="j"
      onClose={vi.fn()}
      onOpenChecks={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Fix' }))
  fireEvent.click(screen.getByRole('button', { name: 'Drop OSB' }))
  await waitFor(() =>
    expect(api.submitQueueDecision).toHaveBeenCalledWith(
      'j',
      expect.objectContaining({
        queueItemId: material.queueItemId,
        action: 'dismiss',
      }),
    ),
  )
  await waitFor(() =>
    expect(screen.queryByText('about two sheets')).not.toBeInTheDocument(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))
  expect(api.confirmCaptureDraft).toHaveBeenCalledWith('n', ['shown-hours'])
})

it('Fix corrects hours through the per-item API without forwarding hidden financial fields', async () => {
  vi.mocked(api.getCaptureDraft)
    .mockResolvedValueOnce(draft)
    .mockResolvedValue({ ...draft, items: [material] })
  const pm = {
    memoryType: 'labour' as const,
    summary: 'Mike two hours, £80',
    materialName: null,
    quantity: null,
    unit: null,
    supplierName: null,
    locationOrUse: null,
    deliveryTiming: null,
    labourHours: '2',
    labourPerson: 'Mike',
    costAmount: '80',
    budgetCategoryId: 'hidden',
  }
  vi.mocked(api.getReviewQueue).mockResolvedValue({
    jobId: 'j',
    generatedAt: '',
    sections: [
      {
        key: 'labour',
        label: 'Hours',
        items: [
          {
            id: hours.queueItemId,
            kind: 'single',
            status: 'draft',
            reviewLabel: '',
            summary: 'Two hours',
            proposedMemory: pm,
            confidenceLabel: 'high',
            uncertaintyFlags: [],
            sourceCandidateFactIds: ['fact'],
            sourceContext: [],
          },
        ],
      },
    ],
    alreadyRemembered: [],
  })
  vi.mocked(api.submitQueueDecision).mockResolvedValue({
    queueItemId: hours.queueItemId,
    action: 'correct',
    status: 'corrected',
    sourceCandidateFactIds: ['fact'],
  })
  render(
    <CaptureDraftSheet
      noteId="n"
      jobId="j"
      onClose={vi.fn()}
      onOpenChecks={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Fix' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Mike' }))
  fireEvent.change(await screen.findByLabelText('Hours'), {
    target: { value: '4' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save fix' }))
  await waitFor(() => expect(api.submitQueueDecision).toHaveBeenCalled())
  const decision = vi.mocked(api.submitQueueDecision).mock.calls[0][1]
  expect(decision.corrected?.labourHours).toBe('4')
  expect(decision.corrected).not.toHaveProperty('costAmount')
  expect(decision.corrected).not.toHaveProperty('budgetCategoryId')
  expect(decision.corrected?.summary).not.toContain('£')
})

it('refreshes job readers when a successful Fix finishes after its sheet was closed', async () => {
  const { renderHook } = await import('@testing-library/react'),
    { useCaptureUpdates } = await import('../captureEvents')
  const revision = renderHook(() => useCaptureUpdates())
  const before = revision.result.current
  vi.mocked(api.getCaptureDraft).mockResolvedValue(draft)
  let finish!: (
    value: Awaited<ReturnType<typeof api.submitQueueDecision>>,
  ) => void
  vi.mocked(api.submitQueueDecision).mockReturnValue(
    new Promise((r) => {
      finish = r
    }),
  )
  const sheet = render(
    <CaptureDraftSheet
      noteId="n"
      jobId="j"
      onClose={vi.fn()}
      onOpenChecks={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Fix' }))
  fireEvent.click(screen.getByRole('button', { name: 'Drop OSB' }))
  sheet.unmount()
  await act(async () =>
    finish({
      queueItemId: material.queueItemId,
      action: 'dismiss',
      status: 'dismissed',
      sourceCandidateFactIds: [],
    }),
  )
  expect(revision.result.current).toBeGreaterThan(before)
})
