import { describe, it, expect, vi } from 'vitest'
import {
  RECEIPT_FILE_ACCEPT,
  isObviouslyUnsupportedReceipt,
  looksLikePdf,
  receiptFileMetadata,
  readReceiptFile,
  receiptSelectionProblem,
} from '../receiptFile'

// The single rule these tests protect: the frontend may not decide a file is
// invalid from `file.type`. Phone pickers lie about PDFs, and the backend is
// the only thing that reads the bytes.

function file(name: string, type: string, bytes = 'x'): File {
  return new File(bytes ? [bytes] : [], name, { type })
}

describe('looksLikePdf', () => {
  it.each([
    ['application/pdf', 'receipt.pdf'],
    ['application/x-pdf', 'receipt.pdf'],
    ['application/octet-stream', 'receipt.pdf'],
    ['text/plain', 'receipt.pdf'],
    ['', 'receipt.pdf'],
    ['', 'Invoice 88213.PDF'],
  ])('accepts a PDF declared as "%s" named %s', (type, name) => {
    expect(looksLikePdf(file(name, type))).toBe(true)
  })

  it('accepts a PDF type even when the name has no extension', () => {
    expect(looksLikePdf(file('scan-0012', 'application/pdf'))).toBe(true)
  })

  it('does not claim a plain image is a PDF', () => {
    expect(looksLikePdf(file('site.jpg', 'image/jpeg'))).toBe(false)
  })
})

describe('isObviouslyUnsupportedReceipt', () => {
  it.each([
    ['image/jpeg', 'site.jpg'],
    ['image/heic', 'IMG_4821.HEIC'],
    ['application/pdf', 'receipt.pdf'],
    ['application/x-pdf', 'receipt.pdf'],
    // The iOS/Drive shapes: unknown type, PDF name.
    ['application/octet-stream', 'receipt.pdf'],
    ['text/plain', 'receipt.pdf'],
    ['', 'receipt.pdf'],
    // Unknown type AND unknown name — still not our call to refuse.
    ['', 'document'],
    ['application/octet-stream', 'scan-0012'],
  ])('lets "%s" (%s) through to the backend', (type, name) => {
    expect(isObviouslyUnsupportedReceipt(file(name, type))).toBe(false)
  })

  it.each([
    ['application/msword', 'notes.docx'],
    ['video/mp4', 'clip.mp4'],
    ['application/zip', 'job.zip'],
    ['audio/mpeg', 'voice.mp3'],
  ])('refuses "%s" (%s) without a request', (type, name) => {
    expect(isObviouslyUnsupportedReceipt(file(name, type))).toBe(true)
  })
})

describe('receiptSelectionProblem', () => {
  it('reports a zero-byte cloud placeholder separately from an unsupported type', () => {
    expect(receiptSelectionProblem(file('drive-invoice.pdf', 'application/pdf', ''))).toBe('empty')
    expect(receiptSelectionProblem(file('notes.docx', 'application/msword'))).toBe('unsupported')
  })

  it('has no complaint about a readable PDF of unknown type', () => {
    expect(receiptSelectionProblem(file('receipt.pdf', ''))).toBeNull()
  })
})

describe('readReceiptFile', () => {
  it('returns an in-memory copy with the bytes intact', async () => {
    const out = await readReceiptFile(file('receipt.pdf', 'application/pdf', 'hello'))
    expect(out.name).toBe('receipt.pdf')
    expect(out.size).toBe(5)
    expect(await out.text()).toBe('hello')
  })

  it.each(['', 'application/octet-stream', 'application/x-pdf', 'text/plain'])(
    'normalises a PDF declared as "%s" to application/pdf',
    async type => {
      const out = await readReceiptFile(file('receipt.pdf', type))
      expect(out.type).toBe('application/pdf')
    },
  )

  it('leaves an image type alone', async () => {
    expect((await readReceiptFile(file('site.jpg', 'image/jpeg'))).type).toBe('image/jpeg')
  })

  // The Android/Drive case: the handle looks fine until something reads it.
  it('throws unreadable when the bytes cannot be read', async () => {
    const f = file('drive.pdf', 'application/pdf')
    vi.spyOn(f, 'arrayBuffer').mockRejectedValue(
      Object.assign(new Error('nope'), { name: 'NotReadableError' }),
    )
    await expect(readReceiptFile(f)).rejects.toMatchObject({ name: 'ReceiptFileReadError', reason: 'unreadable' })
  })

  it('throws empty when the read succeeds with no bytes', async () => {
    const f = file('drive.pdf', 'application/pdf')
    vi.spyOn(f, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(0))
    await expect(readReceiptFile(f)).rejects.toMatchObject({ name: 'ReceiptFileReadError', reason: 'empty' })
  })
})

describe('picker accept value', () => {
  // Strict MIME lists grey PDFs out in the iOS Files and Android Drive pickers.
  it('uses extension-friendly values', () => {
    expect(RECEIPT_FILE_ACCEPT).toBe('image/*,.pdf,application/pdf')
  })
})

describe('receiptFileMetadata', () => {
  it('reports name, type, and size for on-device diagnosis', () => {
    const f = file('receipt.pdf', 'application/octet-stream', 'abc')
    expect(receiptFileMetadata(f)).toEqual({ name: 'receipt.pdf', type: 'application/octet-stream', size: 3 })
  })
})
