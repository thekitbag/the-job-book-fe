import { useCallback, useEffect, useRef, useState } from 'react'
import { useCaptureContext } from './CaptureSyncProvider'
import { useLocalCaptures } from './useLocalCaptures'
import { patchNote, patchPhoto, getAllNotes, getAllPhotos } from './db'
import {
  fileCaptureNote,
  fileCapturePhoto,
  moveCaptureNote,
  moveCapturePhoto,
  getCaptureDraft,
  uploadCapturePhoto,
  getJob,
} from './api'
import { getCaptureSessionId } from './localOwner'
import { announceCaptureChange } from './captureEvents'
import CaptureJobPicker from './CaptureJobPicker'
import CaptureDraftSheet from './CaptureDraftSheet'
import type { Job } from './types'
import type { CaptureHome } from './captureTypes'
import { track } from './analytics'
export default function CaptureFlow({
  jobs,
  home,
  online,
  onJobAdded,
  onOpenJob,
  onOpenChecks,
}: {
  jobs: Job[]
  home: CaptureHome | null
  online: boolean
  onJobAdded: (job: Job) => void
  onOpenJob: (id: string) => void
  onOpenChecks: (id: string) => void
}) {
  const capture = useCaptureContext()!,
    { flow, setFlow } = capture,
    { notes, photos } = useLocalCaptures(),
    [error, setError] = useState(''),
    [showingDraft, setShowingDraft] = useState(false)
  const currentFlow = useRef(flow)
  currentFlow.current = flow
  const close = useCallback(() => {
    const leaving = currentFlow.current
    currentFlow.current = null
    if (leaving?.mode === 'picker')
      track('note_left_unfiled', { context: leaving.target.context })
    setFlow(null)
    setError('')
    setShowingDraft(false)
  }, [setFlow])
  useEffect(() => {
    const leave = () => {
      if (document.visibilityState === 'hidden') close()
    }
    document.addEventListener('visibilitychange', leave)
    window.addEventListener('pagehide', close)
    window.addEventListener('popstate', close)
    return () => {
      document.removeEventListener('visibilitychange', leave)
      window.removeEventListener('pagehide', close)
      window.removeEventListener('popstate', close)
    }
  }, [close])
  useEffect(() => {
    if (!flow || flow.mode !== 'saved') return
    const item =
        flow.target.kind === 'note'
          ? notes.find((n) => n.clientNoteId === flow.target.localId)
          : photos.find((p) => p.clientPhotoId === flow.target.localId),
      id = item ? item.jobId : flow.target.jobId
    if (!id || jobs.some((j) => j.id === id)) return
    let alive = true
    const boundary = getCaptureSessionId()
    void getJob(id)
      .then((job) => {
        if (alive && boundary === getCaptureSessionId()) onJobAdded(job)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [flow, notes, photos, jobs, onJobAdded])
  if (!flow) return null
  const { target } = flow,
    local =
      target.kind === 'note'
        ? notes.find((n) => n.clientNoteId === target.localId)
        : photos.find((p) => p.clientPhotoId === target.localId)
  const jobId = local ? local.jobId : target.jobId,
    serverId = local
      ? 'serverNoteId' in local
        ? local.serverNoteId
        : local.serverPhotoId
      : target.serverId,
    job = jobs.find((j) => j.id === jobId),
    title = job?.title ?? 'this job'
  const choose = async (selected: Job, method: 'picker' | 'new_job') => {
    const boundary = getCaptureSessionId(),
      active = () => boundary === getCaptureSessionId()
    setError('')
    if (flow.mode === 'move') {
      if (!serverId)
        throw new Error(
          'Wait until this recording is saved online before moving it.',
        )
      try {
        const result = await (target.kind === 'note'
          ? moveCaptureNote(serverId, selected.id)
          : moveCapturePhoto(serverId, selected.id))
        if (!active()) return
        const localItems =
          target.kind === 'note' ? await getAllNotes() : await getAllPhotos()
        for (const item of localItems) {
          const id =
            'serverNoteId' in item ? item.serverNoteId : item.serverPhotoId
          if (id === serverId) {
            if ('clientNoteId' in item)
              await patchNote(item.clientNoteId, {
                jobId: result.jobId,
                serverJobId: result.jobId,
              })
            else
              await patchPhoto(item.clientPhotoId, {
                jobId: result.jobId,
                serverJobId: result.jobId,
              })
          }
        }
        track('item_moved', { kind: target.kind })
        announceCaptureChange()
        setFlow({
          mode: 'saved',
          target: { ...target, jobId: result.jobId, moved: true },
        })
      } catch (e) {
        if ((e as { code?: string }).code === 'NOTE_MOVE_BLOCKED')
          throw new Error((e as Error).message)
        throw e
      }
      return
    }
    let actual = selected.id
    if (target.localId) {
      await (target.kind === 'note'
        ? patchNote(target.localId, { jobId: selected.id })
        : patchPhoto(target.localId, { jobId: selected.id }))
      void capture.syncAll()
    } else if (serverId) {
      try {
        const result = await (target.kind === 'note'
          ? fileCaptureNote(serverId, selected.id)
          : fileCapturePhoto(serverId, selected.id))
        actual = result.jobId ?? selected.id
      } catch (e) {
        if (!active()) return
        const code = (e as { code?: string }).code
        if (code === 'NOTE_ALREADY_FILED') {
          actual = (await getCaptureDraft(serverId)).jobId ?? selected.id
        } else if (
          target.kind === 'photo' &&
          !photos.some((p) => p.serverPhotoId === serverId) &&
          (code === 'PHOTO_ALREADY_FILED' ||
            (e as { status?: number }).status === 404)
        ) {
          capture.setMessage(
            code === 'PHOTO_ALREADY_FILED'
              ? 'This photo has already been filed'
              : 'This photo is no longer here',
          )
          announceCaptureChange()
          close()
          return
        } else if (code === 'PHOTO_ALREADY_FILED') {
          const photo = photos.find((p) => p.serverPhotoId === serverId)
          if (!photo) {
            capture.setMessage('This photo has already been filed')
            announceCaptureChange()
            close()
            return
          }
          actual =
            (await uploadCapturePhoto({ ...photo, jobId: null })).jobId ??
            selected.id
        } else throw e
      }
    }
    if (!active()) return
    track('note_filed', {
      context: target.context,
      method: method === 'new_job' ? 'new_job' : (target.method ?? 'picker'),
      // capturedAt is written when the recorder stops, before persistence.
      ms_since_stop:
        Date.now() - Date.parse(target.at) < 10_000
          ? '<10s'
          : Date.now() - Date.parse(target.at) < 60_000
            ? '10-60s'
            : '60s+',
    })
    announceCaptureChange()
    setFlow({ mode: 'saved', target: { ...target, jobId: actual, method } })
  }
  if (flow.mode === 'picker' || flow.mode === 'move')
    return (
      <CaptureJobPicker
        key={`${target.kind}:${target.localId ?? target.serverId}`}
        jobs={jobs}
        order={home?.inProgressJobs.map((j) => j.id) ?? jobs.map((j) => j.id)}
        lastJobId={home?.lastRecordedJobId ?? null}
        online={online}
        onChoose={choose}
        onJobAdded={onJobAdded}
        title={flow.mode === 'move' ? 'Move to which job?' : 'Which job?'}
        savedLabel={
          flow.mode === 'picker'
            ? target.kind === 'photo'
              ? 'Photo saved'
              : 'Recording saved'
            : undefined
        }
        lastActivity={Object.fromEntries(
          (home?.inProgressJobs ?? []).map((j) => [j.id, j.lastActivityAt]),
        )}
        onClose={close}
      />
    )
  const draftReady =
    target.kind === 'note' &&
    local?.localState === 'uploaded' &&
    !!jobId &&
    !!serverId &&
    online &&
    !target.moved
  const remoteDraft =
    target.kind === 'note' &&
    !target.localId &&
    !!serverId &&
    !!jobId &&
    online &&
    !target.moved
  return (
    <>
      {(!showingDraft || !(draftReady || remoteDraft)) && (
        <div className="capture-saved-toast" role="status">
          <strong>
            {jobId
              ? `${target.moved ? 'Moved' : 'Saved'} to ${title}`
              : 'Saved — not filed yet'}
          </strong>
          <p>
            {local?.localState === 'upload_needs_attention'
              ? 'This copy is still on your phone. Open the Job log to retry.'
              : !online
                ? 'Saved on this phone. It will go online when there’s signal.'
                : !jobId
                  ? 'Choose a job later from Not filed yet.'
                  : 'You can put the phone away.'}
          </p>
          <div className="capture-actions">
            {jobId && (
              <button
                className="capture-link"
                type="button"
                onClick={() => {
                  close()
                  onOpenJob(jobId)
                }}
              >
                Open job
              </button>
            )}
            <button type="button" className="capture-link" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
      {(draftReady || remoteDraft) && (
        <CaptureDraftSheet
          noteId={serverId!}
          jobId={jobId!}
          jobTitle={title}
          onVisible={setShowingDraft}
          onClose={close}
          onOpenChecks={() => {
            close()
            onOpenChecks(jobId!)
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </>
  )
}
