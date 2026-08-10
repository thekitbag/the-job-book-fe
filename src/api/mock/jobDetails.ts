import type { CreateJobContactRequest, JobContact, JobDetailsResponse, PatchJobContactRequest, PatchJobDetailsRequest } from '../../types'
import { ApiError } from '../client'
import { MOCK_JOBS } from './jobs'

// Stateful per-job details store: one site address and a job-local contact
// list. Module-level, so it resets on every full page load (each Playwright
// test starts with page.goto) but persists across in-app navigation and
// re-opens within a test — which is what "saved" has to mean here.
//
// Nothing in here touches memory sections, budget, money, or notes: a contact
// is reference context, not job evidence and not spend.

// Mirrors the backend's documented bounds so the mock can't accept something
// the real API would reject.
const MAX_SITE_ADDRESS = 240
const MAX_NAME = 80
const MAX_ROLE = 60
const MAX_PHONE = 40
const MAX_EMAIL = 120
const MAX_NOTE = 240

let mockContactsByJob: Map<string, JobContact[]> | null = null
let mockSiteAddressByJob: Map<string, string | null> | null = null
let mockContactSeq = 0

function contactsFor(jobId: string): JobContact[] {
  if (!mockContactsByJob) mockContactsByJob = new Map()
  if (!mockContactsByJob.has(jobId)) mockContactsByJob.set(jobId, [])
  return mockContactsByJob.get(jobId)!
}

function siteAddressFor(jobId: string): string | null {
  if (!mockSiteAddressByJob) mockSiteAddressByJob = new Map()
  return mockSiteAddressByJob.get(jobId) ?? null
}

// Optional text field: trimmed, blank becomes null, bounded. Mirrors the
// backend rule that omitted preserves and null/blank clears.
function optionalText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

// Lightweight, like the backend: an address-shaped free-text field, an email
// that at least looks like one, a phone in any practical builder format. No
// RFC validation, no UK-only phone formatting.
function validateEmail(email: string | null): void {
  if (!email) return
  if (!email.includes('@') || /\s/.test(email)) throw new ApiError('That email address does not look right', 400)
}

function validatePhone(phone: string | null): void {
  if (!phone) return
  if (!/\d/.test(phone) || !/^[\d\s+()\-.]+$/.test(phone)) {
    throw new ApiError('That phone number does not look right', 400)
  }
}

function detailsResponse(jobId: string): JobDetailsResponse {
  const job = MOCK_JOBS.find(j => j.id === jobId)
  if (!job) throw new ApiError('Job not found', 404)
  return {
    job: {
      id: job.id,
      title: job.title,
      jobType: job.jobType ?? null,
      status: job.status,
      roughLocationOrLabel: job.roughLocationOrLabel,
      // Deliberately not derived from roughLocationOrLabel: a rough label is
      // not an address, and promoting one would invent a fact Mike never gave.
      siteAddress: siteAddressFor(jobId),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
    contacts: contactsFor(jobId)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
      .map(c => ({ ...c })),
  }
}

export function mockGetJobDetails(jobId: string): JobDetailsResponse {
  return detailsResponse(jobId)
}

export function mockPatchJobDetails(jobId: string, req: PatchJobDetailsRequest): JobDetailsResponse {
  if (!MOCK_JOBS.some(j => j.id === jobId)) throw new ApiError('Job not found', 404)
  if ('siteAddress' in req) {
    if (!mockSiteAddressByJob) mockSiteAddressByJob = new Map()
    mockSiteAddressByJob.set(jobId, optionalText(req.siteAddress, MAX_SITE_ADDRESS))
  }
  return detailsResponse(jobId)
}

export function mockCreateJobContact(jobId: string, req: CreateJobContactRequest): JobContact {
  if (!MOCK_JOBS.some(j => j.id === jobId)) throw new ApiError('Job not found', 404)
  // Cheap failure path for tests: a contact named fail rejects like a 500.
  if (req.name?.trim().toLowerCase() === 'fail') throw new ApiError('Could not save contact', 500)
  const name = req.name?.trim()
  if (!name) throw new ApiError('A name is required', 400)
  const phone = optionalText(req.phone, MAX_PHONE)
  const email = optionalText(req.email, MAX_EMAIL)?.toLowerCase() ?? null
  validatePhone(phone)
  validateEmail(email)
  const contacts = contactsFor(jobId)
  const now = new Date().toISOString()
  const contact: JobContact = {
    id: `contact-mock-${++mockContactSeq}`,
    jobId,
    name: name.slice(0, MAX_NAME),
    role: optionalText(req.role, MAX_ROLE),
    phone,
    email,
    note: optionalText(req.note, MAX_NOTE),
    sortOrder: contacts.length,
    createdAt: now,
    updatedAt: now,
  }
  contacts.push(contact)
  return { ...contact }
}

export function mockPatchJobContact(jobId: string, contactId: string, req: PatchJobContactRequest): JobContact {
  const contact = contactsFor(jobId).find(c => c.id === contactId)
  if (!contact) throw new ApiError('Contact not found', 404)
  if (req.name !== undefined) {
    const name = req.name.trim()
    // Name is the one field a contact cannot lose — a nameless contact is not
    // a contact, it's an orphan phone number.
    if (!name) throw new ApiError('A name is required', 400)
    contact.name = name.slice(0, MAX_NAME)
  }
  if ('role' in req) contact.role = optionalText(req.role, MAX_ROLE)
  if ('phone' in req) {
    const phone = optionalText(req.phone, MAX_PHONE)
    validatePhone(phone)
    contact.phone = phone
  }
  if ('email' in req) {
    const email = optionalText(req.email, MAX_EMAIL)?.toLowerCase() ?? null
    validateEmail(email)
    contact.email = email
  }
  if ('note' in req) contact.note = optionalText(req.note, MAX_NOTE)
  contact.updatedAt = new Date().toISOString()
  return { ...contact }
}

export function mockRemoveJobContact(jobId: string, contactId: string): void {
  const contacts = contactsFor(jobId)
  const idx = contacts.findIndex(c => c.id === contactId)
  // Soft-deleted server-side; from the client's point of view it is simply
  // gone, and deleting it again is a 404.
  if (idx === -1) throw new ApiError('Contact not found', 404)
  contacts.splice(idx, 1)
}

export function _resetMockJobDetailsForTesting(): void {
  mockContactsByJob = null
  mockSiteAddressByJob = null
  mockContactSeq = 0
}
