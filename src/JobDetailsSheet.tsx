import { useCallback, useEffect, useRef, useState } from 'react'
import { createJobContact, getJobDetails, patchJobContact, patchJobDetails, removeJobContact } from './api'
import { track } from './analytics'
import { mailtoHref, telHref } from './contactLinks'
import BottomSheet from './BottomSheet'
import type { CreateJobContactRequest, JobContact, JobDetailsResponse } from './types'

// Job details: one site address and the people involved in this job.
//
// This is job context, not CRM. Contacts are scoped to this job, entered by
// hand, never reused across jobs, never created from voice capture, and never
// searched or deduplicated. Nothing here is a customer record, a lead, or a
// directory — which is why it lives behind the header menu rather than taking
// a home card, and why no money, memory, or evidence is touched by any action.

// Sub-states share one sheet, in the app's established push/replace shape: a
// Back affordance returns to the details list, no stacked second sheet.
type Sub =
  | { kind: 'details' }
  | { kind: 'address' }
  | { kind: 'contact'; contact: JobContact | null }
  | { kind: 'remove'; contact: JobContact }

const SHEET_TITLES: Record<Sub['kind'], string> = {
  details: 'Job details',
  address: 'Site address',
  contact: 'Contact',
  remove: 'Remove contact',
}

// Counts only, never who: analytics may know that a job has a couple of
// contacts, never their names, numbers, or addresses.
function contactCountBucket(count: number): string {
  if (count === 0) return '0'
  if (count === 1) return '1'
  if (count <= 3) return '2-3'
  return '4+'
}

// One contact's saved details. Phone and email are explicit tap targets — a
// link Mike chooses to press — so nothing dials or composes on its own.
function ContactCard({ contact, onEdit }: { contact: JobContact; onEdit: () => void }) {
  const tel = telHref(contact.phone)
  const mailto = mailtoHref(contact.email)
  return (
    <div className="jd-contact">
      <div className="jd-contact-head">
        <span className="jd-contact-name">{contact.name}</span>
        {/* Named in the accessible label, not in visible text: with several
            contacts on a job, "Edit" alone is ambiguous out of context. */}
        <button type="button" className="jd-contact-edit" aria-label={`Edit ${contact.name}`} onClick={onEdit}>
          Edit
        </button>
      </div>
      {contact.role && <p className="jd-contact-role">{contact.role}</p>}
      {contact.phone && (
        tel ? (
          <a
            className="jd-contact-link"
            href={tel}
            aria-label={`Call ${contact.name} on ${contact.phone}`}
            onClick={() => track('job_contact_phone_tapped', {})}
          >
            {contact.phone}
          </a>
        ) : (
          <p className="jd-contact-plain">{contact.phone}</p>
        )
      )}
      {contact.email && (
        mailto ? (
          <a
            className="jd-contact-link"
            href={mailto}
            aria-label={`Email ${contact.name} at ${contact.email}`}
            onClick={() => track('job_contact_email_tapped', {})}
          >
            {contact.email}
          </a>
        ) : (
          <p className="jd-contact-plain">{contact.email}</p>
        )
      )}
      {contact.note && <p className="jd-contact-note">{contact.note}</p>}
    </div>
  )
}

export default function JobDetailsSheet({ jobId, jobTitle, onClose }: {
  jobId: string
  jobTitle: string
  onClose: () => void
}) {
  const [details, setDetails] = useState<JobDetailsResponse | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sub, setSub] = useState<Sub>({ kind: 'details' })

  // Ignore a load that resolves after the sheet moved to another job.
  const currentJobIdRef = useRef(jobId)
  currentJobIdRef.current = jobId

  const load = useCallback(async () => {
    const requestedJobId = jobId
    setLoadFailed(false)
    try {
      const res = await getJobDetails(requestedJobId)
      if (currentJobIdRef.current === requestedJobId) setDetails(res)
    } catch {
      if (currentJobIdRef.current === requestedJobId) setLoadFailed(true)
    }
  }, [jobId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { track('job_details_opened', { job_id: jobId }) }, [jobId])

  const contacts = details?.contacts ?? []
  const siteAddress = details?.job.siteAddress ?? null
  const backToDetails = () => setSub({ kind: 'details' })

  // ── Site address ──────────────────────────────────────────────────────────
  const [addressDraft, setAddressDraft] = useState('')
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)

  const openAddress = () => {
    setAddressDraft(siteAddress ?? '')
    setAddressError(null)
    setSub({ kind: 'address' })
  }

  // Save, then adopt the authoritative response — the backend trims and bounds
  // the value, so the sheet must show what was actually stored. A failure keeps
  // the typed address on screen for a one-tap retry.
  const saveAddress = async (next: string | null) => {
    if (savingAddress) return
    setSavingAddress(true)
    setAddressError(null)
    try {
      const updated = await patchJobDetails(jobId, { siteAddress: next })
      setDetails(updated)
      track('job_site_address_saved', { job_id: jobId, cleared: next === null })
      backToDetails()
    } catch {
      setAddressError('Could not save — try again')
    } finally {
      setSavingAddress(false)
    }
  }

  // ── Contact add/edit ──────────────────────────────────────────────────────
  const [form, setForm] = useState({ name: '', role: '', phone: '', email: '', note: '' })
  const [savingContact, setSavingContact] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)

  const openContact = (contact: JobContact | null) => {
    setForm({
      name: contact?.name ?? '',
      role: contact?.role ?? '',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
      note: contact?.note ?? '',
    })
    setContactError(null)
    setSub({ kind: 'contact', contact })
  }

  const saveContact = async (existing: JobContact | null) => {
    const name = form.name.trim()
    if (!name || savingContact) return
    setSavingContact(true)
    setContactError(null)
    // Blank clears: an emptied optional field is sent as null rather than
    // omitted, so Mike can take a wrong number off a contact.
    const body: CreateJobContactRequest = {
      name,
      role: form.role.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      note: form.note.trim() || null,
    }
    const safeProps = {
      job_id: jobId,
      has_role: body.role !== null,
      has_phone: body.phone !== null,
      has_email: body.email !== null,
      has_note: body.note !== null,
    }
    try {
      if (existing) {
        await patchJobContact(jobId, existing.id, body)
        track('job_contact_updated', safeProps)
      } else {
        await createJobContact(jobId, body)
        track('job_contact_added', safeProps)
      }
      // Refetch rather than splice: the list the backend returns (order,
      // trimming, normalised email) is the one Mike should be looking at.
      await load()
      backToDetails()
    } catch {
      setContactError('Could not save — try again')
    } finally {
      setSavingContact(false)
    }
  }

  // ── Contact removal ───────────────────────────────────────────────────────
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  // The contact stays on screen until the backend confirms, so a failed remove
  // never looks like it worked.
  const confirmRemove = async (contact: JobContact) => {
    if (removing) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await removeJobContact(jobId, contact.id)
      track('job_contact_removed', { job_id: jobId, contact_count_bucket: contactCountBucket(contacts.length - 1) })
      await load()
      backToDetails()
    } catch {
      setRemoveError('Could not remove — try again')
    } finally {
      setRemoving(false)
    }
  }

  const BackRow = (
    <button type="button" className="row-sheet-back" onClick={backToDetails}>‹ Back</button>
  )

  const title = sub.kind === 'contact'
    ? (sub.contact ? 'Edit contact' : 'Add contact')
    : SHEET_TITLES[sub.kind]

  return (
    <BottomSheet title={title} onClose={onClose}>
      {sub.kind === 'details' && (
        <div className="jd-details">
          <p className="row-sheet-sub">{jobTitle}</p>

          {loadFailed && !details && (
            <div className="mem-known-spend-refresh" role="alert">
              <span>Couldn’t load job details.</span>
              <button type="button" className="mem-known-spend-retry" onClick={() => void load()}>Try again</button>
            </div>
          )}
          {!details && !loadFailed && <p className="mem-loading">Loading…</p>}

          {details && (
            <>
              <div className="jd-block">
                <div className="lens-add-head">
                  <span className="lens-add-label">Site address</span>
                  <button type="button" className="btn-lens-add-text" onClick={openAddress}>
                    {siteAddress ? 'Edit site address' : 'Add site address'}
                  </button>
                </div>
                {siteAddress
                  ? <p className="jd-address">{siteAddress}</p>
                  : <p className="mem-section-empty">No site address yet.</p>}
              </div>

              <div className="jd-block">
                <div className="lens-add-head">
                  <span className="lens-add-label">Contacts</span>
                  <button type="button" className="btn-lens-add-text" onClick={() => openContact(null)}>
                    Add contact
                  </button>
                </div>
                {contacts.length === 0
                  ? <p className="mem-section-empty">No contacts yet. Add whoever you need to reach on this job.</p>
                  : contacts.map(contact => (
                    <ContactCard key={contact.id} contact={contact} onEdit={() => openContact(contact)} />
                  ))}
              </div>
            </>
          )}

          <button type="button" className="row-sheet-cancel" onClick={onClose}>Close</button>
        </div>
      )}

      {sub.kind === 'address' && (
        <div className="row-sheet-substate">
          {BackRow}
          <form className="queue-edit-form" aria-label="Site address" onSubmit={e => { e.preventDefault(); void saveAddress(addressDraft.trim() || null) }}>
            <label className="queue-field">
              <span className="queue-field-label">Site address</span>
              <textarea
                className="queue-field-input jd-address-input"
                name="siteAddress"
                value={addressDraft}
                maxLength={240}
                rows={3}
                onChange={e => setAddressDraft(e.target.value)}
                placeholder="e.g. 14 Elm Road, Reading RG1 5QT"
              />
            </label>
            <div className="queue-edit-actions">
              <button type="submit" className="btn-queue-save" disabled={savingAddress}>
                {savingAddress ? 'Saving…' : 'Save address'}
              </button>
              <button type="button" className="btn-queue-cancel" onClick={backToDetails} disabled={savingAddress}>Cancel</button>
            </div>
            {siteAddress && (
              <button
                type="button"
                className="jd-clear"
                disabled={savingAddress}
                onClick={() => void saveAddress(null)}
              >
                Clear site address
              </button>
            )}
            {addressError && <p className="queue-item-error" role="alert">{addressError}</p>}
          </form>
        </div>
      )}

      {sub.kind === 'contact' && (
        <div className="row-sheet-substate">
          {BackRow}
          <form
            className="queue-edit-form"
            aria-label={sub.contact ? 'Edit contact' : 'Add contact'}
            onSubmit={e => { e.preventDefault(); void saveContact(sub.contact) }}
          >
            <label className="queue-field">
              <span className="queue-field-label">Contact</span>
              <input
                className="queue-field-input"
                name="name"
                value={form.name}
                maxLength={80}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Mrs Patel"
              />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Role (optional)</span>
              <input
                className="queue-field-input"
                name="role"
                value={form.role}
                maxLength={60}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="e.g. Customer, electrician, building control"
              />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Phone (optional)</span>
              <input
                className="queue-field-input"
                name="phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                maxLength={40}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Email (optional)</span>
              <input
                className="queue-field-input"
                name="email"
                type="email"
                inputMode="email"
                value={form.email}
                maxLength={120}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">Note (optional)</span>
              <input
                className="queue-field-input"
                name="note"
                value={form.note}
                maxLength={240}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Best after 4pm"
              />
            </label>
            <div className="queue-edit-actions">
              <button type="submit" className="btn-queue-save" disabled={savingContact || form.name.trim() === ''}>
                {savingContact ? 'Saving…' : 'Save contact'}
              </button>
              <button type="button" className="btn-queue-cancel" onClick={backToDetails} disabled={savingContact}>Cancel</button>
            </div>
            {sub.contact && (
              <button
                type="button"
                className="jd-clear jd-clear--danger"
                disabled={savingContact}
                onClick={() => { setRemoveError(null); setSub({ kind: 'remove', contact: sub.contact! }) }}
              >
                Remove contact
              </button>
            )}
            {contactError && <p className="queue-item-error" role="alert">{contactError}</p>}
          </form>
        </div>
      )}

      {sub.kind === 'remove' && (
        <div className="row-sheet-substate">
          {BackRow}
          <div className="mem-remove-confirm">
            <p className="mem-remove-question">Remove {sub.contact.name}?</p>
            <p className="mem-remove-consequence">They’ll be taken off this job’s details.</p>
            {/* Named consequences: a contact was never evidence or money, so
                removing one moves nothing else. */}
            <p className="mem-remove-consequence">Your notes, photos, Budget, and Money are not changed.</p>
            <div className="mem-remove-actions">
              <button type="button" className="btn-mem-remove-confirm" disabled={removing} onClick={() => void confirmRemove(sub.contact)}>
                {removing ? 'Removing…' : 'Remove'}
              </button>
              <button type="button" className="btn-mem-cancel" disabled={removing} onClick={backToDetails}>Cancel</button>
            </div>
            {removeError && <p className="queue-item-error" role="alert">{removeError}</p>}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
