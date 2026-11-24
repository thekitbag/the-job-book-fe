import { useEffect } from 'react'
import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CaptureFlow from '../CaptureFlow'
vi.mock('../CaptureSyncProvider', () => ({
  useCaptureContext: () => ({
    flow: {
      mode: 'saved',
      target: {
        kind: 'note',
        localId: 'local',
        jobId: 'job',
        at: '2026-11-23',
        context: 'home',
      },
    },
    setFlow: vi.fn(),
  }),
}))
vi.mock('../useLocalCaptures', () => ({
  useLocalCaptures: () => ({
    notes: [
      {
        clientNoteId: 'local',
        serverNoteId: 'server',
        jobId: 'job',
        localState: 'uploaded',
      },
    ],
    photos: [],
  }),
}))
vi.mock('../CaptureDraftSheet', () => ({
  default: function MockDraft({
    onVisible,
  }: {
    onVisible: (visible: boolean) => void
  }) {
    useEffect(() => onVisible(true), [onVisible])
    return <div>Open review</div>
  },
}))
it('returns to saved confirmation if an open review loses signal', async () => {
  const props = {
    jobs: [
      {
        id: 'job',
        title: 'Garden Room',
        status: 'started' as const,
        jobType: 'other' as const,
        createdAt: '',
        updatedAt: '',
        roughLocationOrLabel: null,
      },
    ],
    home: null,
    onJobAdded: vi.fn(),
    onOpenJob: vi.fn(),
    onOpenChecks: vi.fn(),
  }
  const { rerender } = render(<CaptureFlow {...props} online />)
  await screen.findByText('Open review')
  expect(screen.queryByText('Saved to Garden Room')).not.toBeInTheDocument()
  rerender(<CaptureFlow {...props} online={false} />)
  expect(screen.getByText('Saved to Garden Room')).toBeVisible()
  expect(screen.queryByText('Open review')).not.toBeInTheDocument()
})
