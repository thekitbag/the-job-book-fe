// What the receipt picker will hand us, and what the frontend is allowed to
// refuse before it ever reaches the backend.
//
// iOS is the reason this module exists. A PDF chosen from Files arrives with an
// unreliable MIME type — sometimes 'application/pdf', but just as often
// 'application/x-pdf', 'application/octet-stream', 'text/plain', or an empty
// string. Any check of the shape `file.type === 'application/pdf'` silently
// blocks Mike's real receipts on the one device he actually uses.
//
// So the rule is deliberately permissive: the backend validates MIME and magic
// bytes and is the only authority on whether a file is really a receipt. The
// frontend refuses only what is unambiguously neither an image nor a PDF, so an
// obvious mistake (a Word document, a video) gets an instant answer instead of
// a round trip.

// Browser accept value. Deliberately not a strict MIME list: on iOS, strict
// values grey out PDFs in the Files picker, so a PDF cannot even be selected.
// The extension form is what makes Files usable, and the backend re-checks.
export const RECEIPT_FILE_ACCEPT = 'image/*,.pdf,application/pdf'

// Types iOS/Android hand over when they don't know (or don't agree) what the
// file is. None of these prove anything, so none of them justify a rejection.
const AMBIGUOUS_TYPES = new Set([
  '',
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream',
  'text/plain',
])

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i

/**
 * Why a selection can't be uploaded, decided without asking the backend.
 * `null` means "send it and let the server judge the bytes".
 *
 * - `empty`: the picker handed over a zero-byte file. This is the Google Drive
 *   / iCloud case: the document is a cloud placeholder the browser could not
 *   materialise, so there is nothing to POST. It is not an upload failure and
 *   must not be reported as one.
 * - `unsupported`: unambiguously neither an image nor a PDF.
 */
export type ReceiptSelectionProblem = 'empty' | 'unsupported'

export function receiptSelectionProblem(file: File): ReceiptSelectionProblem | null {
  if (file.size === 0) return 'empty'
  if (isObviouslyUnsupportedReceipt(file)) return 'unsupported'
  return null
}

/**
 * The selected file's identity, for a console line and for tests. Deliberately
 * a plain object rather than an analytics event: the file name can carry
 * customer detail, so it stays on the device.
 */
export function receiptFileMetadata(file: File): { name: string; type: string; size: number } {
  return { name: file.name ?? '', type: file.type ?? '', size: file.size }
}

/** A file the user meant as a PDF, however the OS chose to label it. */
export function looksLikePdf(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type === 'application/pdf' || type === 'application/x-pdf') return true
  return /\.pdf$/i.test(file.name ?? '')
}

/**
 * True when the frontend is confident this is neither an image nor a PDF, and
 * can say so without asking the backend. An unknown or ambiguous type is never
 * confident — that is the iOS case, and it must go to the server.
 */
export function isObviouslyUnsupportedReceipt(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('image/')) return false
  if (AMBIGUOUS_TYPES.has(type)) return false
  if (looksLikePdf(file)) return false
  if (IMAGE_EXTENSIONS.test(file.name ?? '')) return false
  // A concrete type that is neither image/* nor a PDF type: application/msword,
  // video/mp4, application/zip, and so on.
  return true
}
