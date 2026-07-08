import { useCallback, useEffect, useRef, useState } from 'react'
import { getJobPhotos, patchJobPhoto, uploadJobPhoto } from './api'
import type { JobPhoto, MemoryViewItem, PatchJobPhotoRequest } from './types'

// Photos are supporting job context (never a gallery destination, never spend):
// this section lives on the Notes tab. Photo-only save works — no recording,
// descriptor, or link required. A photo can optionally link to one trusted
// memory item; review-queue drafts are never offered. Nothing here touches
// memory or budget state — a receipt photo is evidence, not processed spend.

export interface PhotoLinkTarget {
  id: string
  label: string
}

// Current-truth label for a link target, matching the display identity the
// memory/spend rows use. Always derived from the trusted memory-view item's
// CURRENT fields — never from original extraction/source text, so a corrected
// item shows its corrected identity in the picker and on saved photo cards.
export function photoLinkTargetLabel(item: MemoryViewItem): string {
  if (item.memoryType === 'labour') {
    const bits = [
      item.labourPerson,
      item.labourHours ? `${item.labourHours}h` : null,
      item.labourTask,
    ].filter(Boolean)
    return bits.length > 0 ? bits.join(' · ') : item.summary
  }
  if (item.memoryType === 'ordered_material' || item.memoryType === 'used_material' || item.memoryType === 'leftover_material') {
    const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
    return [qty, item.materialName].filter(Boolean).join(' ') || item.summary
  }
  return item.summary
}

// Relative day copy for a photo timestamp (photos are recent, phone-first).
function photoDayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const now = new Date()
  if (key(d) === key(now)) return 'Today'
  if (key(d) === key(new Date(now.getTime() - 86_400_000))) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Saved-card link label. Prefers the CURRENT trusted item label (same one the
// picker shows) over the backend-echoed summary, which may predate a
// correction; the echoed summary is only a fallback when the item is no
// longer in the loaded memory view.
function linkLabel(photo: JobPhoto, linkTargets: PhotoLinkTarget[]): string | null {
  if (photo.linkedMemoryItemId || photo.linkedMemoryItem) {
    const current = linkTargets.find(t => t.id === (photo.linkedMemoryItemId ?? photo.linkedMemoryItem?.id))
    const label = current?.label ?? photo.linkedMemoryItem?.summary
    return label ? `Linked to: ${label}` : null
  }
  if (photo.linkedNote) return `Linked to note from ${photoDayLabel(photo.linkedNote.capturedAt)}`
  return null
}

// Shared descriptor + link fields for the upload and edit forms.
function PhotoMetaFields({ descriptor, setDescriptor, linkId, setLinkId, linkTargets }: {
  descriptor: string
  setDescriptor: (v: string) => void
  linkId: string
  setLinkId: (v: string) => void
  linkTargets: PhotoLinkTarget[]
}) {
  return (
    <>
      <label className="queue-field">
        <span className="queue-field-label">What is it? (optional)</span>
        <input
          className="queue-field-input"
          name="descriptor"
          value={descriptor}
          maxLength={120}
          onChange={e => setDescriptor(e.target.value)}
          placeholder="e.g. Jewson receipt, footings before pour"
        />
      </label>
      {linkTargets.length > 0 && (
        <label className="queue-field">
          <span className="queue-field-label">Link to (optional)</span>
          <select
            className="queue-field-input"
            name="linkedMemoryItemId"
            aria-label="Link photo to"
            value={linkId}
            onChange={e => setLinkId(e.target.value)}
          >
            <option value="">No link — general job photo</option>
            {linkTargets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      )}
    </>
  )
}

function PhotoCard({ photo, linkTargets, onSave }: {
  photo: JobPhoto
  linkTargets: PhotoLinkTarget[]
  onSave: (photoId: string, req: PatchJobPhotoRequest) => Promise<void>
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [descriptor, setDescriptor] = useState(photo.descriptor ?? '')
  const [linkId, setLinkId] = useState(photo.linkedMemoryItemId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = () => {
    setDescriptor(photo.descriptor ?? '')
    setLinkId(photo.linkedMemoryItemId ?? '')
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // Explicit metadata state: descriptor null clears; choosing a memory item
      // clears any note link; "No link" clears the memory-item link only.
      const req: PatchJobPhotoRequest = {
        descriptor: descriptor.trim() || null,
        linkedMemoryItemId: linkId || null,
        ...(linkId ? { linkedNoteId: null } : {}),
      }
      await onSave(photo.id, req)
      setEditing(false)
    } catch {
      setError('Could not save — try again')
    } finally {
      setSaving(false)
    }
  }

  const link = linkLabel(photo, linkTargets)
  return (
    <div className="photo-card">
      {imgFailed
        ? <div className="photo-card-fallback">Photo uploaded</div>
        : <img
            className="photo-card-img"
            src={photo.imageUrl}
            alt={photo.descriptor ?? 'Job photo'}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />}
      <div className="photo-card-body">
        {editing ? (
          <form className="queue-edit-form" aria-label="Edit photo details" onSubmit={e => { e.preventDefault(); void save() }}>
            <PhotoMetaFields descriptor={descriptor} setDescriptor={setDescriptor} linkId={linkId} setLinkId={setLinkId} linkTargets={linkTargets} />
            <div className="queue-edit-actions">
              <button type="submit" className="btn-queue-save" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
              <button type="button" className="btn-queue-cancel" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
            {error && <p className="queue-item-error" role="alert">{error}</p>}
          </form>
        ) : (
          <>
            {photo.descriptor && <p className="photo-card-descriptor">{photo.descriptor}</p>}
            <p className="photo-card-meta">
              {photoDayLabel(photo.uploadedAt)}
              {link && <span className="photo-card-link"> · {link}</span>}
            </p>
            <button type="button" className="btn-mem-fix" onClick={startEdit}>Edit details</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function JobPhotosSection({ jobId, linkTargets }: { jobId: string; linkTargets: PhotoLinkTarget[] }) {
  const [photos, setPhotos] = useState<JobPhoto[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [descriptor, setDescriptor] = useState('')
  const [linkId, setLinkId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Latest selected job id; ignore a photos load that resolves after a switch.
  const currentJobIdRef = useRef(jobId)
  currentJobIdRef.current = jobId

  const load = useCallback(async () => {
    const requestedJobId = jobId
    setLoadFailed(false)
    try {
      const res = await getJobPhotos(requestedJobId)
      if (currentJobIdRef.current === requestedJobId) setPhotos(res.photos)
    } catch {
      if (currentJobIdRef.current === requestedJobId) { setPhotos(p => p ?? []); setLoadFailed(true) }
    }
  }, [jobId])

  useEffect(() => { void load() }, [load])

  // Local object URL for a pre-upload preview; revoked when replaced/unmounted.
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const resetForm = () => {
    setFile(null); setDescriptor(''); setLinkId(''); setUploadError(null)
  }

  // Only show the photo once the backend upload succeeds (no durable local
  // queue in v1). On failure keep file/descriptor/link so a retry is one tap.
  const submit = async () => {
    if (!file || uploading) return
    setUploading(true)
    setUploadError(null)
    try {
      await uploadJobPhoto(jobId, {
        file,
        descriptor: descriptor.trim() || null,
        linkedMemoryItemId: linkId || null,
      })
      resetForm()
      setOpen(false)
      await load()
    } catch {
      setUploadError('Could not upload — check your connection and try again')
    } finally {
      setUploading(false)
    }
  }

  const handlePatch = async (photoId: string, req: PatchJobPhotoRequest) => {
    const updated = await patchJobPhoto(jobId, photoId, req)
    setPhotos(prev => prev ? prev.map(p => p.id === photoId ? updated : p) : prev)
  }

  return (
    <section className="job-photos" aria-label="Job photos">
      <div className="lens-add-head">
        <span className="lens-add-label">Job photos</span>
        <button
          type="button"
          className={`btn-lens-add${open ? ' btn-lens-add--open' : ''}`}
          aria-label={open ? 'Close add photo' : 'Add photo'}
          aria-expanded={open}
          onClick={() => { setUploadError(null); setOpen(o => !o) }}
        >
          {open ? '×' : '+'}
        </button>
      </div>

      {open && (
        <div className="direct-add">
          <form className="queue-edit-form" aria-label="Add photo" onSubmit={e => { e.preventDefault(); void submit() }}>
            <label className="queue-field">
              <span className="queue-field-label">Photo</span>
              <input
                className="queue-field-input photo-file-input"
                type="file"
                name="photo"
                accept="image/*"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {previewUrl && <img className="photo-preview" src={previewUrl} alt="Preview of the selected file" />}
            <PhotoMetaFields descriptor={descriptor} setDescriptor={setDescriptor} linkId={linkId} setLinkId={setLinkId} linkTargets={linkTargets} />
            <div className="queue-edit-actions">
              <button type="submit" className="btn-queue-save" disabled={uploading || !file}>
                {uploading ? 'Uploading…' : 'Save photo'}
              </button>
              <button type="button" className="btn-queue-cancel" onClick={() => { resetForm(); setOpen(false) }} disabled={uploading}>Cancel</button>
            </div>
            {uploadError && <p className="queue-item-error" role="alert">{uploadError}</p>}
          </form>
        </div>
      )}

      {loadFailed && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t load photos.</span>
          <button type="button" className="mem-known-spend-retry" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {photos !== null && photos.length === 0 && !loadFailed && (
        <p className="mem-section-empty">No photos yet.</p>
      )}
      {(photos ?? []).map(photo => (
        <PhotoCard key={photo.id} photo={photo} linkTargets={linkTargets} onSave={handlePatch} />
      ))}
    </section>
  )
}
