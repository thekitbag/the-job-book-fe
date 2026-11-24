import { useEffect, useState } from 'react'
import type { LocalNote, LocalPhoto } from './types'
import {
  formatDuration,
  formatSavedStamp,
  TranscriptSection,
} from './SourceHistory'
import { useCaptureContext } from './CaptureSyncProvider'
export default function LocalCaptureItem({
  note,
  photo,
  onFile,
}: {
  note?: LocalNote
  photo?: LocalPhoto
  onFile?: () => void
}) {
  const capture = useCaptureContext(),
    item = note ?? photo!,
    [preview, setPreview] = useState('')
  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const message =
    item.localState === 'upload_failed'
      ? 'Will retry when there’s signal.'
      : item.localState === 'upload_needs_attention'
        ? item.lastErrorCode === 'PHOTO_NOT_FOUND'
          ? 'The online photo was removed. This copy is still on your phone.'
          : ['AUDIO_TOO_LARGE', 'PHOTO_TOO_LARGE'].includes(
                item.lastErrorCode ?? '',
              )
            ? 'This file is too large to send. It is still on your phone.'
            : ['AUDIO_UNSUPPORTED_TYPE', 'PHOTO_UNSUPPORTED_TYPE'].includes(
                  item.lastErrorCode ?? '',
                )
              ? 'This file type could not be sent. It is still on your phone.'
              : 'Could not send this yet. Your copy is still on this phone.'
        : item.localState === 'uploading'
          ? 'Saving online…'
          : item.localState === 'uploaded'
            ? note
              ? 'Voice note saved'
              : 'Photo saved'
            : 'Saved on this phone'
  return (
    <article className="capture-local-item">
      <p>
        {photo ? 'Photo' : 'Voice note'} · {formatSavedStamp(item.capturedAt)}
        {note ? ` · ${formatDuration(note.durationMs)}` : ''}
      </p>
      {preview && (
        <img
          className="job-log-photo"
          src={preview}
          alt="Saved on this phone"
        />
      )}
      <p role="status">{message}</p>
      {note && note.localState === 'uploaded' && (
        <TranscriptSection note={note} />
      )}
      {(item.localState === 'upload_failed' ||
        item.localState === 'upload_needs_attention') &&
        item.lastErrorCode !== 'PHOTO_NOT_FOUND' && (
          <button
            type="button"
            className="capture-link"
            onClick={() => {
              if (note) void capture?.retryNote(note.clientNoteId)
              else void capture?.retryPhoto(photo!.clientPhotoId)
            }}
          >
            Retry
          </button>
        )}
      {onFile && (
        <button type="button" className="capture-link" onClick={onFile}>
          Choose job
        </button>
      )}
    </article>
  )
}
