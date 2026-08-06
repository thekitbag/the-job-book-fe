import { useCallback, useEffect, useRef, useState } from 'react'
import { getJobReceipts, patchJobReceipt, removeJobReceipt, resolveApiUrl, uploadJobReceipt } from './api'
import { mimeTypeFamily, safeErrorKind, sizeBucket, track } from './analytics'
import { receiptDisplayName } from './memoryScan'
import { formatSavedStamp } from './SourceHistory'
import BottomSheet from './BottomSheet'
import type { JobReceipt } from './types'

// Receipts and invoices live in Job log > Receipts. This is storage and recall
// of job evidence: Mike photographs a paper receipt, screenshots a confirmation
// email, or uploads a PDF invoice he already has, and finds it again later.
//
// It is deliberately NOT accounting. Nothing here asks for supplier, amount, or
// date, nothing is parsed or read out of the file, and uploading or removing a
// receipt never touches Budget, Money, or remembered job facts. Classification
// follows Mike's intent at upload time, not the file format: a receipt image
// uploaded here is receipt evidence and never appears under Photos.

// Browser-accepted types. The backend is the authority — this only shapes the
// picker, so a phone that offers HEIC or an odd PDF MIME still gets through to
// a server-side decision.
const FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

// What went wrong with the file, in Mike's words. Backend error codes are
// mapped explicitly; anything else is a plain retryable failure.
function uploadErrorCopy(err: unknown): string {
  const code = (err as { code?: string } | null)?.code
  const status = (err as { status?: number } | null)?.status
  if (code === 'RECEIPT_UNSUPPORTED_TYPE' || status === 415) {
    return 'That file type isn’t supported. Use a photo, screenshot, or PDF.'
  }
  if (code === 'RECEIPT_TOO_LARGE' || status === 413) {
    return 'That file is too big. Try a photo of the receipt instead.'
  }
  return 'Could not upload — check your connection and try again'
}

// Short file-type cue, so a PDF is recognisable before it is opened.
function fileKindLabel(receipt: JobReceipt): string {
  return receipt.fileKind === 'pdf' ? 'PDF' : 'Image'
}

// Thumbnail for a receipt row: the image itself where the browser can render
// it, otherwise a file-type tile. HEIC and PDF both land on the tile rather
// than a broken image.
function ReceiptThumb({ receipt }: { receipt: JobReceipt }) {
  const [failed, setFailed] = useState(false)
  const src = receipt.thumbnailUrl ?? receipt.fileUrl
  if (receipt.fileKind === 'pdf' || failed || !src) {
    return <span className="receipt-thumb receipt-thumb--file" aria-hidden="true">{fileKindLabel(receipt)}</span>
  }
  return (
    <img
      className="receipt-thumb"
      // Resolved against VITE_API_BASE: the backend returns a relative route,
      // which would otherwise load from the frontend origin when the API is a
      // separate host in prod.
      src={resolveApiUrl(src)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

// One receipt's actions, in the shared push/replace drawer shape used by every
// other item row: an action list that pushes into a focused sub-state, with
// Back returning to the actions. No stacked sheets, no inline page expansion.
type Sub = 'actions' | 'edit' | 'remove'

function ReceiptActionDrawer({ receipt, onClose, onSave, onRemove }: {
  receipt: JobReceipt
  onClose: () => void
  onSave: (descriptor: string | null) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [sub, setSub] = useState<Sub>('actions')
  const [descriptor, setDescriptor] = useState(receipt.descriptor ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const back = () => { setError(null); setSub('actions') }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave(descriptor.trim() || null)
      onClose()
    } catch {
      setError('Could not save — try again')
      setBusy(false)
    }
  }

  // The receipt stays put until the backend accepts the removal, so a failure
  // never looks like it worked.
  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await onRemove()
      onClose()
    } catch {
      setError('Could not remove — try again')
      setBusy(false)
    }
  }

  const title = sub === 'edit' ? 'Edit description' : sub === 'remove' ? 'Remove receipt' : receiptDisplayName(receipt)
  const BackRow = <button type="button" className="row-sheet-back" onClick={back}>‹ Back</button>

  return (
    <BottomSheet title={title} onClose={onClose}>
      {sub === 'actions' && (
        <>
          <p className="row-sheet-sub">
            {fileKindLabel(receipt)} · added {formatSavedStamp(receipt.uploadedAt)}
          </p>
          {receipt.descriptor && receipt.originalFileName && (
            <p className="row-sheet-sub">{receipt.originalFileName}</p>
          )}
          <div className="row-sheet-actions">
            {/* A real link, not a scripted window.open: the authenticated file
                route opens reliably in the PWA and is never popup-blocked. */}
            <a
              className="row-sheet-opt"
              href={resolveApiUrl(receipt.fileUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('receipt_opened', { file_kind: receipt.fileKind })}
            >
              Open file <span aria-hidden="true">›</span>
            </a>
            <button type="button" className="row-sheet-opt" onClick={() => setSub('edit')}>
              Edit description <span aria-hidden="true">›</span>
            </button>
            <button type="button" className="row-sheet-opt row-sheet-opt--danger" onClick={() => setSub('remove')}>
              Remove receipt <span aria-hidden="true">›</span>
            </button>
          </div>
          <button type="button" className="row-sheet-cancel" onClick={onClose}>Cancel</button>
        </>
      )}

      {sub === 'edit' && (
        <div className="row-sheet-substate">
          {BackRow}
          <form className="queue-edit-form" aria-label="Edit receipt description" onSubmit={e => { e.preventDefault(); void save() }}>
            <label className="queue-field">
              <span className="queue-field-label">What is it? (optional)</span>
              <input
                className="queue-field-input"
                name="descriptor"
                value={descriptor}
                maxLength={120}
                onChange={e => setDescriptor(e.target.value)}
                placeholder="e.g. Jewson receipt, Travis Perkins invoice"
              />
            </label>
            <div className="queue-edit-actions">
              <button type="submit" className="btn-queue-save" disabled={busy}>{busy ? 'Saving…' : 'Save description'}</button>
              <button type="button" className="btn-queue-cancel" onClick={back} disabled={busy}>Cancel</button>
            </div>
            {error && <p className="queue-item-error" role="alert">{error}</p>}
          </form>
        </div>
      )}

      {sub === 'remove' && (
        <div className="row-sheet-substate">
          {BackRow}
          <div className="mem-remove-confirm">
            <p className="mem-remove-question">Remove this receipt?</p>
            {/* Named consequences: the file leaves the job log, and nothing
                money-shaped moves, because a receipt was never spend. */}
            <p className="mem-remove-consequence">It will be removed from the job log.</p>
            <p className="mem-remove-consequence">Your Budget, Money, notes, and photos are not changed.</p>
            <div className="mem-remove-actions">
              <button type="button" className="btn-mem-remove-confirm" disabled={busy} onClick={() => void remove()}>
                {busy ? 'Removing…' : 'Remove'}
              </button>
              <button type="button" className="btn-mem-cancel" disabled={busy} onClick={back}>Cancel</button>
            </div>
            {error && <p className="queue-item-error" role="alert">{error}</p>}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

export default function JobReceiptsSection({ jobId, onReceiptsChanged = () => {} }: {
  jobId: string
  // Notifies a parent (the Job log "All" feed) that the receipt list changed.
  onReceiptsChanged?: () => void
}) {
  const [receipts, setReceipts] = useState<JobReceipt[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [descriptor, setDescriptor] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Latest selected job id; ignore a load that resolves after a job switch.
  const currentJobIdRef = useRef(jobId)
  currentJobIdRef.current = jobId

  const load = useCallback(async () => {
    const requestedJobId = jobId
    setLoadFailed(false)
    try {
      const res = await getJobReceipts(requestedJobId)
      if (currentJobIdRef.current === requestedJobId) setReceipts(res.receipts)
    } catch {
      if (currentJobIdRef.current === requestedJobId) { setReceipts(r => r ?? []); setLoadFailed(true) }
    }
  }, [jobId])

  useEffect(() => { void load() }, [load])

  const resetForm = () => { setFile(null); setDescriptor(''); setUploadError(null) }

  // Show the receipt only once the backend has it (no durable local queue in
  // v1). On failure the file and description stay put so retry is one tap.
  const submit = async () => {
    if (!file || uploading) return
    setUploading(true)
    setUploadError(null)
    const safeMeta = { job_id: jobId, mime_type_family: mimeTypeFamily(file.type), size_bucket: sizeBucket(file.size) }
    track('receipt_upload_started', safeMeta)
    try {
      await uploadJobReceipt(jobId, { file, descriptor: descriptor.trim() || null })
      track('receipt_upload_succeeded', { ...safeMeta, described: descriptor.trim() ? 'yes' : 'no' })
      resetForm()
      setOpen(false)
      await load()
      onReceiptsChanged()
    } catch (err: unknown) {
      track('receipt_upload_failed', { ...safeMeta, error_kind: safeErrorKind((err as { code?: string } | null)?.code) })
      setUploadError(uploadErrorCopy(err))
    } finally {
      setUploading(false)
    }
  }

  const handlePatch = async (receiptId: string, nextDescriptor: string | null) => {
    const updated = await patchJobReceipt(jobId, receiptId, { descriptor: nextDescriptor })
    setReceipts(prev => prev ? prev.map(r => r.id === receiptId ? updated : r) : prev)
    onReceiptsChanged()
  }

  // Delete on the backend, then adopt the authoritative list by refetch (rather
  // than splicing locally) so the Job log "All" feed and this view agree.
  const handleRemove = async (receiptId: string) => {
    await removeJobReceipt(jobId, receiptId)
    track('receipt_removed', { job_id: jobId })
    await load()
    onReceiptsChanged()
  }

  const openReceipt = (receipts ?? []).find(r => r.id === openReceiptId) ?? null

  return (
    <section className="job-receipts" aria-label="Receipts and invoices">
      <div className="lens-add-head">
        {/* Short visible label: the filter tab above already says Receipts, and
            the full phrase wrapped to two lines against the add action at
            390px. The region keeps the full name for screen readers. */}
        <span className="lens-add-label">Receipts</span>
        <button
          type="button"
          className="btn-lens-add-text"
          aria-expanded={open}
          onClick={() => { setUploadError(null); setOpen(o => !o) }}
        >
          {open ? 'Close' : 'Add receipt or invoice'}
        </button>
      </div>

      {open && (
        <div className="direct-add">
          <form className="queue-edit-form" aria-label="Add receipt or invoice" onSubmit={e => { e.preventDefault(); void submit() }}>
            <label className="queue-field">
              <span className="queue-field-label">Receipt or invoice</span>
              <input
                className="queue-field-input photo-file-input"
                type="file"
                name="receipt"
                accept={FILE_ACCEPT}
                onChange={e => { setUploadError(null); setFile(e.target.files?.[0] ?? null) }}
              />
            </label>
            {file && <p className="receipt-picked">{file.name}</p>}
            <label className="queue-field">
              <span className="queue-field-label">What is it? (optional)</span>
              <input
                className="queue-field-input"
                name="descriptor"
                value={descriptor}
                maxLength={120}
                onChange={e => setDescriptor(e.target.value)}
                placeholder="e.g. Jewson receipt, Travis Perkins invoice"
              />
            </label>
            {/* Says plainly what saving does — a file kept on the job, not a
                cost entered anywhere. */}
            <p className="receipt-add-note">Kept with this job so you can find it later. It doesn’t change your Budget or Money.</p>
            <div className="queue-edit-actions">
              <button type="submit" className="btn-queue-save" disabled={uploading || !file}>
                {uploading ? 'Uploading…' : 'Save receipt'}
              </button>
              <button type="button" className="btn-queue-cancel" onClick={() => { resetForm(); setOpen(false) }} disabled={uploading}>Cancel</button>
            </div>
            {uploadError && <p className="queue-item-error" role="alert">{uploadError}</p>}
          </form>
        </div>
      )}

      {loadFailed && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t load receipts.</span>
          <button type="button" className="mem-known-spend-retry" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {receipts !== null && receipts.length === 0 && !loadFailed && (
        <p className="mem-section-empty">No receipts or invoices yet.</p>
      )}

      {(receipts ?? []).map(receipt => (
        <div className="mem-card receipt-card" key={receipt.id}>
          <button
            type="button"
            className="mem-row-tap receipt-row"
            aria-label={`${receiptDisplayName(receipt)} — receipt actions`}
            onClick={() => setOpenReceiptId(receipt.id)}
          >
            <ReceiptThumb receipt={receipt} />
            <span className="receipt-row-text">
              <span className="receipt-row-title">{receiptDisplayName(receipt)}</span>
              <span className="receipt-row-meta">
                {fileKindLabel(receipt)} · added {formatSavedStamp(receipt.uploadedAt)}
              </span>
            </span>
            <span className="mem-row-tap-chev" aria-hidden="true">›</span>
          </button>
        </div>
      ))}

      {openReceipt && (
        <ReceiptActionDrawer
          receipt={openReceipt}
          onClose={() => setOpenReceiptId(null)}
          onSave={descriptorValue => handlePatch(openReceipt.id, descriptorValue)}
          onRemove={() => handleRemove(openReceipt.id)}
        />
      )}
    </section>
  )
}
