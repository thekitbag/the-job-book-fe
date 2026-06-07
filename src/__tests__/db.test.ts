import { describe, it, expect } from 'vitest'
import {
  saveNote,
  getNotesForJob,
  getAllNotes,
  getPendingNotes,
  patchNote,
  resetInterruptedUploads,
} from '../db'
import { makeNote } from './helpers'

describe('IndexedDB helpers', () => {
  it('saves a note and retrieves it by job ID', async () => {
    const note = makeNote()
    await saveNote(note)
    const notes = await getNotesForJob(note.jobId)
    expect(notes).toHaveLength(1)
    expect(notes[0].clientNoteId).toBe(note.clientNoteId)
  })

  it('does not return notes from a different job', async () => {
    await saveNote(makeNote({ jobId: 'job-a' }))
    await saveNote(makeNote({ jobId: 'job-b' }))
    const notes = await getNotesForJob('job-a')
    expect(notes).toHaveLength(1)
    expect(notes[0].jobId).toBe('job-a')
  })

  it('getPendingNotes returns saved_local and upload_failed notes', async () => {
    await saveNote(makeNote({ localState: 'saved_local' }))
    await saveNote(makeNote({ localState: 'upload_failed' }))
    await saveNote(makeNote({ localState: 'uploaded' }))
    await saveNote(makeNote({ localState: 'uploading' }))
    const pending = await getPendingNotes()
    expect(pending).toHaveLength(2)
    expect(pending.every(n => n.localState === 'saved_local' || n.localState === 'upload_failed')).toBe(true)
  })

  it('patchNote updates state without creating a duplicate', async () => {
    const note = makeNote()
    await saveNote(note)
    await patchNote(note.clientNoteId, { localState: 'uploaded', serverNoteId: 'srv-1' })
    const all = await getAllNotes()
    expect(all).toHaveLength(1)
    expect(all[0].localState).toBe('uploaded')
    expect(all[0].serverNoteId).toBe('srv-1')
  })

  it('resetInterruptedUploads resets uploading→saved_local and returns count', async () => {
    await saveNote(makeNote({ localState: 'uploading' }))
    await saveNote(makeNote({ localState: 'uploading' }))
    await saveNote(makeNote({ localState: 'uploaded' }))
    const count = await resetInterruptedUploads()
    expect(count).toBe(2)
    const all = await getAllNotes()
    const uploading = all.filter(n => n.localState === 'uploading')
    expect(uploading).toHaveLength(0)
  })
})
