import type { LocalNote, LocalPhoto } from '../../types'
import type {
  CaptureNote,
  CapturePhoto,
  CaptureDraft,
  CaptureHome,
  UnfiledCaptures,
} from '../../captureTypes'
import { ApiError } from '../client'
import { MOCK_JOBS, mockOwnsJob } from './jobs'
import { getMockSession } from './auth'
import {
  mockGetReviewQueue,
  mockSubmitQueueDecision,
  mockAddCaptureChecks,
} from './reviewQueue'
import { mockGetWorkshop } from './workshop'
const KEY = 'job-book-mock-captures'
type N = CaptureNote & {
  owner: string
  at: string
  duration: number
  readyAt: number
  local: Omit<LocalNote, 'blob'>
}
type P = CapturePhoto & { owner: string }
function read(): { notes: N[]; photos: P[] } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{"notes":[],"photos":[]}')
  } catch {
    return { notes: [], photos: [] }
  }
}
function write(data: ReturnType<typeof read>) {
  localStorage.setItem(KEY, JSON.stringify(data))
}
const owner = () => getMockSession()?.id ?? ''
const error = (code: string, status = 409) =>
  Object.assign(new ApiError(code, status), { code })
function checkJob(id: string) {
  const j = MOCK_JOBS.find((j) => j.id === id)
  if (!j || !mockOwnsJob(id)) throw error('JOB_NOT_FOUND', 404)
  if (j.status === 'archived') throw error('JOB_NOT_FILEABLE')
}
function notesForUser() {
  return read().notes.filter((n) => n.owner === owner())
}
export function resetMockCaptures() {
  localStorage.removeItem(KEY)
}
export async function uploadNote(local: LocalNote): Promise<CaptureNote> {
  if (local.jobId) checkJob(local.jobId)
  const data = read()
  let n = data.notes.find(
    (n) => n.owner === owner() && n.clientNoteId === local.clientNoteId,
  )
  if (!n) {
    const rest = { ...local }
    delete (rest as Partial<LocalNote>).blob
    n = {
      id: 'srv-' + local.clientNoteId,
      clientNoteId: local.clientNoteId,
      owner: owner(),
      jobId: local.jobId,
      filedAt: local.jobId ? new Date().toISOString() : null,
      captureContext: local.captureContext ?? 'home',
      serverStatus: 'UPLOADED',
      at: local.capturedAt,
      duration: local.durationMs,
      readyAt: Date.now() + 250,
      local: rest,
    }
    data.notes.push(n)
  } else if (!n.jobId && local.jobId) {
    n.jobId = local.jobId
    n.filedAt = new Date().toISOString()
  }
  write(data)
  if (n.jobId) mockAddCaptureChecks(n.jobId, n.id)
  return noteView(n)
}
async function placeNote(
  id: string,
  jobId: string,
  move: boolean,
): Promise<CaptureNote> {
  checkJob(jobId)
  const data = read(),
    n = data.notes.find((n) => n.id === id && n.owner === owner())
  if (!n) throw error('NOTE_NOT_FOUND', 404)
  if (!move && n.jobId && n.jobId !== jobId) throw error('NOTE_ALREADY_FILED')
  n.jobId = jobId
  n.filedAt ??= new Date().toISOString()
  write(data)
  mockAddCaptureChecks(jobId, n.id)
  return noteView(n)
}
export const fileNote = (id: string, jobId: string) =>
  placeNote(id, jobId, false)
export const moveNote = (id: string, jobId: string) =>
  placeNote(id, jobId, true)
export async function draft(id: string): Promise<CaptureDraft> {
  const n = notesForUser().find((n) => n.id === id)
  if (!n) throw error('NOTE_NOT_FOUND', 404)
  const state = !n.jobId
    ? 'not_filed'
    : Date.now() < n.readyAt
      ? 'extracting'
      : 'ready'
  if (n.jobId) mockAddCaptureChecks(n.jobId, n.id)
  const items = n.jobId
    ? mockGetReviewQueue(n.jobId)
        .sections.flatMap((s) => s.items)
        .filter(
          (i) =>
            i.status === 'draft' &&
            i.sourceContext.some((c) => c.noteId === id),
        )
    : []
  return {
    noteId: id,
    jobId: n.jobId,
    state,
    transcriptText:
      state === 'ready'
        ? 'Mike two hours. Bought about two sheets of OSB.'
        : null,
    items:
      state === 'ready'
        ? items.map((i) =>
            i.proposedMemory.memoryType === 'labour'
              ? {
                  queueItemId: i.id,
                  kind: 'hours',
                  person: i.proposedMemory.labourPerson ?? null,
                  hours: i.proposedMemory.labourHours ?? null,
                  day: n.at.slice(0, 10),
                  uncertain: i.uncertaintyFlags.length > 0,
                }
              : {
                  queueItemId: i.id,
                  kind: 'material',
                  state: 'bought',
                  item: i.proposedMemory.materialName,
                  amount: [i.proposedMemory.quantity, i.proposedMemory.unit]
                    .filter(Boolean)
                    .join(' '),
                  supplier: i.proposedMemory.supplierName,
                  notes: i.proposedMemory.locationOrUse,
                  uncertain: i.uncertaintyFlags.length > 0,
                },
          )
        : [],
    moreToCheckCount: 0,
  }
}
export async function looksRight(id: string, ids: string[]) {
  const n = notesForUser().find((n) => n.id === id)
  if (!n?.jobId) throw error('NOTE_NOT_FOUND', 404)
  const d = await draft(id),
    valid = new Set(d.items.map((i) => i.queueItemId))
  const confirmed: string[] = [],
    alreadyDecided: string[] = []
  for (const item of ids) {
    if (valid.has(item)) {
      mockSubmitQueueDecision(n.jobId, {
        queueItemId: item,
        action: 'confirm',
        uncertaintyResolution: 'still_unsure',
      })
      confirmed.push(item)
    } else alreadyDecided.push(item)
  }
  return { confirmed, alreadyDecided }
}
export async function uploadPhoto(local: LocalPhoto): Promise<CapturePhoto> {
  if (local.jobId) checkJob(local.jobId)
  const data = read()
  let p = data.photos.find(
    (p) => p.owner === owner() && p.clientPhotoId === local.clientPhotoId,
  )
  if (!p) {
    p = {
      id: 'photo-' + local.clientPhotoId,
      clientPhotoId: local.clientPhotoId,
      owner: owner(),
      jobId: local.jobId,
      filedAt: local.jobId ? new Date().toISOString() : null,
      captureContext: local.captureContext ?? 'home',
      uploadedAt: local.capturedAt,
      fileUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    }
    data.photos.push(p)
  } else if (!p.jobId && local.jobId) {
    p.jobId = local.jobId
    p.filedAt = new Date().toISOString()
  }
  write(data)
  return photoView(p)
}
async function placePhoto(id: string, jobId: string, move: boolean) {
  checkJob(jobId)
  const data = read(),
    p = data.photos.find((p) => p.id === id && p.owner === owner())
  if (!p) throw error('PHOTO_NOT_FOUND', 404)
  if (!move && p.jobId && p.jobId !== jobId) throw error('PHOTO_ALREADY_FILED')
  p.jobId = jobId
  p.filedAt ??= new Date().toISOString()
  write(data)
  return photoView(p)
}
export const filePhoto = (id: string, jobId: string) =>
  placePhoto(id, jobId, false)
export const movePhoto = (id: string, jobId: string) =>
  placePhoto(id, jobId, true)
export async function unfiled(): Promise<UnfiledCaptures> {
  const d = read()
  return {
    notes: d.notes
      .filter((n) => n.owner === owner() && !n.jobId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((n) => ({
        noteId: n.id,
        capturedAt: n.at,
        durationMs: n.duration,
        transcriptStatus: 'completed',
        text: 'Mike two hours. Bought about two sheets of OSB.',
      })),
    photos: d.photos
      .filter((p) => p.owner === owner() && !p.jobId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .map((p) => ({
        photoId: p.id,
        uploadedAt: p.uploadedAt,
        fileUrl: p.fileUrl,
      })),
  }
}
export async function home(): Promise<CaptureHome> {
  const ns = notesForUser()
  ns.filter((n) => n.jobId).forEach((n) => mockAddCaptureChecks(n.jobId!, n.id))
  const workshop = await mockGetWorkshop(),
    u = await unfiled()
  return {
    inProgressJobs: MOCK_JOBS.filter(
      (j) => j.status === 'started' && mockOwnsJob(j.id),
    )
      .map((j) => ({
        id: j.id,
        title: j.title,
        lastActivityAt:
          ns
            .filter((n) => n.jobId === j.id)
            .map((n) => n.at)
            .sort()
            .reverse()[0] ?? j.updatedAt,
        toCheckCount: mockGetReviewQueue(j.id)
          .sections.flatMap((s) => s.items)
          .filter((i) => i.status === 'draft').length,
      }))
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
    otherJobs: {
      planningCount: MOCK_JOBS.filter(
        (j) => j.status === 'planning' && mockOwnsJob(j.id),
      ).length,
      finishedCount: MOCK_JOBS.filter(
        (j) => j.status === 'finished' && mockOwnsJob(j.id),
      ).length,
    },
    unfiledCount: u.notes.length + u.photos.length,
    lastRecordedJobId:
      ns
        .filter((n) => n.jobId)
        .sort((a, b) => (b.filedAt ?? '').localeCompare(a.filedAt ?? ''))[0]
        ?.jobId ?? null,
    workshop: {
      availableCount: workshop.bookHome.availableCount,
      preview: workshop.bookHome.previewItems.map((i) => i.materialName),
    },
  }
}
export function capturePhotoLog(jobId: string) {
  return read()
    .photos.filter((p) => p.owner === owner() && p.jobId === jobId)
    .map((p) => ({
      kind: 'photo' as const,
      id: p.id,
      photoId: p.id,
      at: p.uploadedAt,
      fileKind: 'IMAGE' as const,
      fileUrl: p.fileUrl,
      descriptor: null,
      linkedNoteId: null,
    }))
}

function noteView(n: CaptureNote): CaptureNote {
  return {
    id: n.id,
    clientNoteId: n.clientNoteId,
    jobId: n.jobId,
    filedAt: n.filedAt,
    captureContext: n.captureContext,
    serverStatus: n.serverStatus,
  }
}
function photoView(p: CapturePhoto): CapturePhoto {
  return {
    id: p.id,
    clientPhotoId: p.clientPhotoId,
    jobId: p.jobId,
    filedAt: p.filedAt,
    captureContext: p.captureContext,
    uploadedAt: p.uploadedAt,
    fileUrl: p.fileUrl,
  }
}
export function captureNoteLog(jobId: string) {
  return notesForUser()
    .filter((n) => n.jobId === jobId)
    .map((n) => ({
      kind: 'voice_note' as const,
      id: n.id,
      noteId: n.id,
      at: n.at,
      durationMs: n.duration,
      transcriptStatus:
        Date.now() < n.readyAt ? ('pending' as const) : ('completed' as const),
      text:
        Date.now() < n.readyAt
          ? null
          : 'Mike two hours. Bought about two sheets of OSB.',
      linkedPhotoIds: [],
    }))
}
