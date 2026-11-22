import { expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { apiFetch, onUnauthorized } from '../api/client'
import {
  captureIdentity,
  getCaptureSessionId,
  beginSignedInSession,
  establishLocalOwner,
  clearLocalOwner,
} from '../localOwner'
import { createCapturedNote, persistCapturedNote } from '../capturePersistence'
import { getAllNotes } from '../db'

const audio = {
  blob: new NodeBlob(['audio']) as unknown as Blob,
  mimeType: 'audio/webm',
  durationMs: 1200,
}

it('resolves an unknown owner discovered while recording in the same session', async () => {
  clearLocalOwner()
  const started = captureIdentity()
  establishLocalOwner('a', getCaptureSessionId())
  const note = createCapturedNote(audio, 'job-a', started)
  expect(note.ownerUserId).toBe('a')
  await persistCapturedNote(note)
  expect((await getAllNotes())[0].ownerUserId).toBe('a')
})
it('never assigns unknown audio to a sign-in that happened during recording', async () => {
  clearLocalOwner()
  const started = captureIdentity()
  beginSignedInSession('b')
  const note = createCapturedNote(audio, null, started)
  expect(note.ownerUserId).toBeNull()
  await persistCapturedNote(note)
  expect(await getAllNotes()).toEqual([])
})
it('retains the original owner when recording completes after an account switch', async () => {
  beginSignedInSession('a')
  const started = captureIdentity()
  beginSignedInSession('b')
  await persistCapturedNote(createCapturedNote(audio, 'job-a', started))
  expect(await getAllNotes()).toEqual([])
  beginSignedInSession('a')
  expect((await getAllNotes())[0].ownerUserId).toBe('a')
})
it('ignores an old request’s 401 after a new sign-in but expires the current session', async () => {
  let respond!: (response: Response) => void
  const expired = vi.fn()
  onUnauthorized(expired)
  vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve
      }),
  )
  const oldRequest = apiFetch('/api/jobs')
  beginSignedInSession('b')
  respond(new Response('', { status: 401 }))
  await oldRequest
  expect(expired).not.toHaveBeenCalled()
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }))
  await apiFetch('/api/jobs')
  expect(expired).toHaveBeenCalledOnce()
  onUnauthorized(null)
})

it('persists an unknown capture boundary after all page session storage is gone', async () => {
  const { _resetLocalOwnerForTesting } = await import('../localOwner')
  clearLocalOwner()
  const boundary = getCaptureSessionId()
  await persistCapturedNote(createCapturedNote(audio, null))
  sessionStorage.clear()
  _resetLocalOwnerForTesting()
  expect(getCaptureSessionId()).toBe(boundary)
  expect(establishLocalOwner('a', boundary)).toBe(true)
  const { stampUnownedCaptures } = await import('../db')
  await stampUnownedCaptures('a', boundary)
  expect((await getAllNotes())[0].ownerUserId).toBe('a')
})

it('keeps the boundary through owner discovery and rotates it only at auth/account boundaries', () => {
  const boundary = getCaptureSessionId()
  establishLocalOwner('a', boundary)
  expect(getCaptureSessionId()).toBe(boundary)
  establishLocalOwner('a', boundary)
  expect(getCaptureSessionId()).toBe(boundary)
  establishLocalOwner('b', boundary)
  const accountChanged = getCaptureSessionId()
  expect(accountChanged).not.toBe(boundary)
  beginSignedInSession('b')
  const signedIn = getCaptureSessionId()
  expect(signedIn).not.toBe(accountChanged)
  clearLocalOwner()
  expect(getCaptureSessionId()).not.toBe(signedIn)
})

it('adopts another tab’s auth boundary without rotating on owner discovery or storage notifications', async () => {
  const { subscribeLocalOwner } = await import('../localOwner')
  const notify = vi.fn()
  const boundary = getCaptureSessionId()
  const unsubscribe = subscribeLocalOwner(notify)
  try {
    localStorage.setItem('job-book-owner-user-id', 'a')
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'job-book-owner-user-id',
        oldValue: null,
        newValue: 'a',
      }),
    )
    expect(getCaptureSessionId()).toBe(boundary)
    localStorage.setItem('job-book-capture-boundary-id', 'other-tab-sign-in')
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'job-book-capture-boundary-id',
        oldValue: boundary,
        newValue: 'other-tab-sign-in',
      }),
    )
    expect(getCaptureSessionId()).toBe('other-tab-sign-in')
    expect(notify).toHaveBeenCalledTimes(2)
  } finally {
    unsubscribe()
  }
})
