import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import { saveNote } from '../db'
import { makeNote } from './helpers'
import { getReviewQueue } from '../api'
import type { UseRecorderReturn } from '../useRecorder'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
  getNoteTranscript: vi.fn(),
  getDraftFacts: vi.fn(() => Promise.resolve([])),
  getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-pilot-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
  getMemoryView: vi.fn(() => Promise.resolve({ job: { id: 'job-pilot-001' }, generatedAt: '', sections: [], stillToCheck: { count: 0, items: [] } })),
  getBudgetSummary: vi.fn(() => Promise.reject(new Error('no budget'))),
  getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-pilot-001', photos: [] })),
}))

vi.mock('../useRecorder', () => {
  const mockRecorder: UseRecorderReturn = {
    state: 'idle',
    elapsedMs: 0,
    mimeType: 'audio/webm;codecs=opus',
    permissionError: null,
    start: vi.fn(),
    stop: vi.fn(),
  }
  return {
    isRecordingSupported: true,
    getSupportedMimeType: () => 'audio/webm;codecs=opus',
    useRecorder: () => mockRecorder,
  }
})

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(__dirname, '../..')
const PUBLIC_DIR = resolve(PROJECT_ROOT, 'public')
const CONFIG_PATH = resolve(PROJECT_ROOT, 'vite.config.ts')

const PILOT_JOB = {
  id: 'job-pilot-001',
  title: 'Garden Room',
  jobType: 'garden_room' as const,
  roughLocationOrLabel: 'Mrs Patel – back garden',
  status: 'started' as const,
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-10T09:00:00Z',
}

// ── PWA asset and manifest config ─────────────────────────────────────────────

describe('PWA assets and manifest config', () => {
  it('SVG icon file is present in public dir', () => {
    expect(existsSync(resolve(PUBLIC_DIR, 'icon.svg'))).toBe(true)
  })

  it('192x192 PNG icon is present in public dir', () => {
    expect(existsSync(resolve(PUBLIC_DIR, 'icon-192.png'))).toBe(true)
  })

  it('512x512 PNG icon is present in public dir', () => {
    expect(existsSync(resolve(PUBLIC_DIR, 'icon-512.png'))).toBe(true)
  })

  it('vite config declares correct app name and short name', () => {
    const config = readFileSync(CONFIG_PATH, 'utf-8')
    expect(config).toContain("name: 'The Job Book'")
    expect(config).toContain("short_name: 'The Job Book'")
  })

  it('vite config sets standalone display mode', () => {
    const config = readFileSync(CONFIG_PATH, 'utf-8')
    expect(config).toContain("display: 'standalone'")
  })

  it('vite config sets start URL to root', () => {
    const config = readFileSync(CONFIG_PATH, 'utf-8')
    expect(config).toContain("start_url: '/'")
  })

  it('vite config references PNG icons in manifest', () => {
    const config = readFileSync(CONFIG_PATH, 'utf-8')
    expect(config).toContain('icon-192.png')
    expect(config).toContain('icon-512.png')
  })

  it('workbox glob patterns cover PNG icons for offline precache', () => {
    const config = readFileSync(CONFIG_PATH, 'utf-8')
    expect(config).toContain('globPatterns')
    expect(config).toContain('png')
  })
})

// ── CaptureScreen pilot requirements ─────────────────────────────────────────

describe('Workspace — pilot field requirements', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(getReviewQueue).mockResolvedValue({ jobId: 'job-pilot-001', generatedAt: '', sections: [], alreadyRemembered: [] })
  })

  it('shows approved audio-storage explainer copy on first launch', () => {
    render(<CurrentJobWorkspace job={PILOT_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)
    expect(screen.getByText(
      'We save the recording during the pilot so we can check what was captured and improve the job memory.'
    )).toBeInTheDocument()
  })

  it('renders the record button as the default capture entry point', () => {
    render(<CurrentJobWorkspace job={PILOT_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
  })

  it('shows the current pilot job title', () => {
    render(<CurrentJobWorkspace job={PILOT_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)
    expect(screen.getByText('Garden Room')).toBeInTheDocument()
  })

  it('shows "Saved on phone" label for a locally-saved note when online', async () => {
    const note = makeNote({ jobId: PILOT_JOB.id, localState: 'saved_local', serverNoteId: null })
    await saveNote(note)

    render(<CurrentJobWorkspace job={PILOT_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Saved on phone')).toBeInTheDocument()
    })
  })

  it('shows "Voice note saved" label after a note is uploaded', async () => {
    const note = makeNote({ jobId: PILOT_JOB.id, localState: 'uploaded', serverNoteId: 'srv-001' })
    await saveNote(note)

    render(<CurrentJobWorkspace job={PILOT_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Voice note saved')).toBeInTheDocument()
    })
  })

  it('shows "Saved on this phone" when offline and a note is saved locally', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const note = makeNote({ jobId: PILOT_JOB.id, localState: 'saved_local', serverNoteId: null })
    await saveNote(note)

    render(<CurrentJobWorkspace job={PILOT_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Saved on this phone')).toBeInTheDocument()
    })
  })

  it('shows offline badge in the header when network is unavailable', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    render(<CurrentJobWorkspace job={PILOT_JOB} onOpenReviewQueue={() => {}} onSwitchJob={() => {}} />)

    expect(screen.getByText('No signal')).toBeInTheDocument()
  })
})
