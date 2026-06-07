import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { saveNote, getNotesForJob } from '../db'
import { useSync } from '../useSync'
import { uploadNote } from '../api'
import { makeNote } from './helpers'
import type { UploadNoteResponse } from '../api'

vi.mock('../api', () => ({
  getCurrentJob: vi.fn(),
  uploadNote: vi.fn(),
  getNoteTranscript: vi.fn(),
}))

const mockUpload = vi.mocked(uploadNote)

function successResponse(n: Parameters<typeof uploadNote>[0]): UploadNoteResponse {
  return { noteId: `srv-${n.clientNoteId}`, clientNoteId: n.clientNoteId, status: 'uploaded', isDuplicate: false }
}

describe('useSync', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  it('uploads a saved_local note and marks it as uploaded', async () => {
    mockUpload.mockImplementation(n => Promise.resolve(successResponse(n)))
    const note = makeNote()
    await saveNote(note)

    renderHook(() => useSync(vi.fn()))

    await waitFor(async () => {
      const notes = await getNotesForJob(note.jobId)
      expect(notes[0].localState).toBe('uploaded')
    })
    expect(mockUpload).toHaveBeenCalledOnce()
  })

  it('stores the backend noteId as serverNoteId', async () => {
    mockUpload.mockImplementation(n => Promise.resolve({ ...successResponse(n), noteId: 'backend-xyz' }))
    const note = makeNote()
    await saveNote(note)

    renderHook(() => useSync(vi.fn()))

    await waitFor(async () => {
      const notes = await getNotesForJob(note.jobId)
      expect(notes[0].serverNoteId).toBe('backend-xyz')
    })
  })

  it('does not upload when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mockUpload.mockImplementation(n => Promise.resolve(successResponse(n)))
    const note = makeNote()
    await saveNote(note)

    renderHook(() => useSync(vi.fn()))

    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('retries when network comes back online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mockUpload.mockImplementation(n => Promise.resolve(successResponse(n)))
    const note = makeNote()
    await saveNote(note)

    renderHook(() => useSync(vi.fn()))

    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(mockUpload).not.toHaveBeenCalled()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })

    await waitFor(async () => {
      const notes = await getNotesForJob(note.jobId)
      expect(notes[0].localState).toBe('uploaded')
    })
    expect(mockUpload).toHaveBeenCalledOnce()
  })

  it('does not make concurrent duplicate upload requests for the same note', async () => {
    // Use a closure counter that is immune to vi.resetAllMocks
    let callCount = 0
    mockUpload.mockImplementation(async (n) => {
      callCount++
      return successResponse(n)
    })

    const note = makeNote()
    await saveNote(note)
    const { result } = renderHook(() => useSync(vi.fn()))

    // Fire multiple syncAll calls before the first has settled
    result.current.syncAll()
    result.current.syncAll()
    result.current.syncAll()

    await waitFor(async () => {
      const notes = await getNotesForJob(note.jobId)
      expect(notes[0].localState).toBe('uploaded')
    })

    // Multiple syncAll calls must not produce duplicate uploads
    expect(callCount).toBe(1)
  })

  it('retryNote resets and re-uploads without duplicating the note', async () => {
    mockUpload.mockImplementation(n => Promise.resolve(successResponse(n)))
    const note = makeNote({ localState: 'upload_needs_attention', uploadAttemptCount: 5 })
    await saveNote(note)

    const { result } = renderHook(() => useSync(vi.fn()))

    await act(async () => { await result.current.retryNote(note.clientNoteId) })

    await waitFor(async () => {
      const notes = await getNotesForJob(note.jobId)
      expect(notes).toHaveLength(1)
      expect(notes[0].localState).toBe('uploaded')
    })
  })

  it('marks note as upload_failed (not upload_needs_attention) before reaching MAX_ATTEMPTS', async () => {
    mockUpload.mockRejectedValue(new Error('network error'))
    const note = makeNote({ uploadAttemptCount: 0 })
    await saveNote(note)

    renderHook(() => useSync(vi.fn()))

    await waitFor(async () => {
      const notes = await getNotesForJob(note.jobId)
      expect(notes[0].localState).toBe('upload_failed')
    })
  })

  it('mocked successful upload updates note state to uploaded (synced)', async () => {
    mockUpload.mockImplementation(n => Promise.resolve(successResponse(n)))
    const note = makeNote()
    await saveNote(note)
    const onChanged = vi.fn()

    renderHook(() => useSync(onChanged))

    await waitFor(async () => {
      const notes = await getNotesForJob(note.jobId)
      expect(notes[0].localState).toBe('uploaded')
    })
    expect(onChanged).toHaveBeenCalled()
  })
})
