import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CurrentJobWorkspace from '../CurrentJobWorkspace'
import JobPickerScreen from '../JobPickerScreen'
import { mailtoHref, telHref } from '../contactLinks'
import { track } from '../analytics'
import * as api from '../api'
import type { Job, JobContact, JobDetailsResponse, MemoryViewResponse } from '../types'

// Job contacts are job context, not CRM. The rules under test: details are
// reachable from the current job without a new home card, a contact can be
// saved with a name alone, optional fields can be cleared, removal is
// confirmed, and phone/email are links Mike taps — never an automatic call,
// send, or a payload carrying who he called.

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getMemoryView: vi.fn(),
    getBudgetSummary: vi.fn(),
    getReviewQueue: vi.fn(() => Promise.resolve({ jobId: 'job-contacts-001', generatedAt: '', sections: [], alreadyRemembered: [] })),
    getDraftFacts: vi.fn(() => Promise.resolve([])),
    getJobNoteStatuses: vi.fn(() => Promise.resolve([])),
    getJobPhotos: vi.fn(() => Promise.resolve({ jobId: 'job-contacts-001', photos: [] })),
    getJobReceipts: vi.fn(() => Promise.resolve({ jobId: 'job-contacts-001', receipts: [] })),
    getJobDetails: vi.fn(),
    patchJobDetails: vi.fn(),
    createJobContact: vi.fn(),
    patchJobContact: vi.fn(),
    removeJobContact: vi.fn(),
  }
})

// Components call the analytics wrapper, never posthog-js directly — mocking
// the wrapper shows exactly what a contact event would carry.
vi.mock('../analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../analytics')>()
  return { ...actual, track: vi.fn() }
})

vi.mock('../useSync', () => ({ useSync: () => ({ syncAll: vi.fn(), retryNote: vi.fn() }) }))
vi.mock('../useTranscriptPoll', () => ({ useTranscriptPoll: () => ({ refreshNow: vi.fn() }) }))

const mockGetMemoryView = vi.mocked(api.getMemoryView)
const mockGetBudgetSummary = vi.mocked(api.getBudgetSummary)
const mockGetJobDetails = vi.mocked(api.getJobDetails)
const mockPatchJobDetails = vi.mocked(api.patchJobDetails)
const mockCreateJobContact = vi.mocked(api.createJobContact)
const mockPatchJobContact = vi.mocked(api.patchJobContact)
const mockRemoveJobContact = vi.mocked(api.removeJobContact)

const JOB: Job = {
  id: 'job-contacts-001', title: 'Garden Room', jobType: 'garden_room',
  roughLocationOrLabel: null, status: 'started', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-10T09:00:00Z',
}

function memoryView(): MemoryViewResponse {
  return {
    job: JOB, generatedAt: '',
    sections: [{ key: 'general_notes', label: 'Notes', items: [] }],
    stillToCheck: { count: 0, items: [] },
    costSummary: {
      orderedMaterials: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, includedMemoryItemIds: [], missingCostCount: 0, uncertainCostCount: 0, excludedMemoryItemIds: [], rows: [], excludedRows: [] },
      totalKnownCost: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, includedMemoryItemIds: [] },
    },
  }
}

function contact(over: Partial<JobContact> = {}): JobContact {
  return {
    id: 'contact-1', jobId: JOB.id, name: 'Mrs Patel', role: null, phone: null, email: null, note: null,
    sortOrder: 0, createdAt: '2026-07-01T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z',
    ...over,
  }
}

function details(over: Partial<JobDetailsResponse['job']> = {}, contacts: JobContact[] = []): JobDetailsResponse {
  return {
    job: {
      id: JOB.id, title: JOB.title, jobType: JOB.jobType, status: JOB.status,
      roughLocationOrLabel: null, siteAddress: null,
      createdAt: JOB.createdAt, updatedAt: JOB.updatedAt,
      ...over,
    },
    contacts,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMemoryView.mockResolvedValue(memoryView())
  mockGetBudgetSummary.mockResolvedValue({
    jobId: JOB.id, generatedAt: '', categories: [],
    uncategorized: { knownSpendAmount: null, knownSpendCurrency: null, knownSpendLabel: null, rows: [] },
    totals: { budgetAmount: null, budgetCurrency: null, knownSpendAmount: null, knownSpendCurrency: null, remainingAmount: null, remainingLabel: null, overBudget: false },
  })
  mockGetJobDetails.mockResolvedValue(details())
})

function renderWorkspace() {
  return render(<CurrentJobWorkspace job={JOB} onOpenReviewQueue={vi.fn()} onSwitchJob={vi.fn()} />)
}

// The everyday route: a visible, labelled control on the job screen. Founder
// testing found the overflow menu too hidden, so this — not "More actions" —
// is the path the flow tests exercise.
async function openJobDetails() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Job details' })[0])
  return await screen.findByRole('dialog', { name: 'Job details' })
}

async function openContactForm(name: 'Add contact' | RegExp) {
  const sheet = screen.getByRole('dialog')
  fireEvent.click(within(sheet).getByRole('button', { name }))
  return await screen.findByRole('form', { name: /contact/i })
}

function fill(form: HTMLElement, field: string, value: string) {
  fireEvent.change(form.querySelector(`[name="${field}"]`)!, { target: { value } })
}

describe('Job details — placement', () => {
  it('is reachable from a visible labelled control on job home, not only the overflow menu', async () => {
    renderWorkspace()
    await screen.findByRole('navigation', { name: 'Job sections' })

    // Visible on the job screen without opening anything first: a new user can
    // find site address and contacts without knowing to inspect "⋯".
    const control = screen.getByRole('button', { name: 'Job details' })
    expect(control).toBeVisible()
    expect(control.closest('.ws-header-menu')).toBeNull()

    fireEvent.click(control)
    expect(await screen.findByRole('dialog', { name: 'Job details' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add contact' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add site address' })).toBeInTheDocument()
  })

  it('is reachable from a section header, without returning to job home', async () => {
    renderWorkspace()
    await screen.findByRole('navigation', { name: 'Job sections' })
    fireEvent.click(screen.getByRole('button', { name: 'Open Budget' }))

    // The section header carries the same labelled control — looking up a
    // number from Budget costs no navigation.
    fireEvent.click(screen.getByRole('button', { name: 'Job details' }))
    expect(await screen.findByRole('dialog', { name: 'Job details' })).toBeInTheDocument()
  })

  it('remains available from the header overflow menu as well', async () => {
    renderWorkspace()
    await screen.findByRole('navigation', { name: 'Job sections' })
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Job details' }))
    expect(await screen.findByRole('dialog', { name: 'Job details' })).toBeInTheDocument()
  })

  it('adds no Contacts card to job home and uses no CRM language', async () => {
    renderWorkspace()
    await screen.findByRole('navigation', { name: 'Job sections' })

    // The stable section nav is unchanged: no Contacts/Customer card or tab.
    const nav = screen.getByRole('navigation', { name: 'Job sections' })
    expect(within(nav).queryByText(/contact|customer|client|directory/i)).toBeNull()

    const sheet = await openJobDetails()
    // Job context, not a customer record — none of the CRM vocabulary.
    expect(within(sheet).queryByText(/customer profile|lead|pipeline|directory|account record/i)).toBeNull()
    expect(await within(sheet).findByText('No contacts yet. Add whoever you need to reach on this job.')).toBeInTheDocument()
    expect(within(sheet).getByText('No site address yet.')).toBeInTheDocument()
  })

  it('Add job asks for a title and job type only — no contact or address fields', () => {
    render(
      <JobPickerScreen jobs={[JOB]} selectedJobId={JOB.id} online onSelect={vi.fn()} onJobAdded={vi.fn()} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add job' }))
    const form = screen.getByRole('form', { name: 'Add job' })
    expect(form.querySelector('[name="phone"]')).toBeNull()
    expect(form.querySelector('[name="email"]')).toBeNull()
    expect(form.querySelector('[name="siteAddress"]')).toBeNull()
    expect(within(form).queryByText(/contact|site address/i)).toBeNull()
  })
})

describe('Job details — site address', () => {
  it('adds, edits, and clears the site address, adopting the backend response', async () => {
    mockPatchJobDetails.mockResolvedValue(details({ siteAddress: '14 Elm Road, Reading RG1 5QT' }))
    renderWorkspace()
    const sheet = await openJobDetails()
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Add site address' }))

    const form = await screen.findByRole('form', { name: 'Site address' })
    fill(form, 'siteAddress', '  14 Elm Road, Reading RG1 5QT  ')
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))

    await waitFor(() => expect(mockPatchJobDetails).toHaveBeenCalledWith(JOB.id, { siteAddress: '14 Elm Road, Reading RG1 5QT' }))
    expect(await screen.findByText('14 Elm Road, Reading RG1 5QT')).toBeInTheDocument()

    // Editing starts from the saved value; clearing sends an explicit null.
    mockPatchJobDetails.mockResolvedValue(details({ siteAddress: null }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit site address' }))
    const editForm = await screen.findByRole('form', { name: 'Site address' })
    expect((editForm.querySelector('[name="siteAddress"]') as HTMLTextAreaElement).value).toBe('14 Elm Road, Reading RG1 5QT')
    fireEvent.click(screen.getByRole('button', { name: 'Clear site address' }))

    await waitFor(() => expect(mockPatchJobDetails).toHaveBeenLastCalledWith(JOB.id, { siteAddress: null }))
    expect(await screen.findByText('No site address yet.')).toBeInTheDocument()
  })

  it('keeps the typed address and offers a retry when the save fails', async () => {
    mockPatchJobDetails.mockRejectedValue(new Error('offline'))
    renderWorkspace()
    const sheet = await openJobDetails()
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Add site address' }))
    const form = await screen.findByRole('form', { name: 'Site address' })
    fill(form, 'siteAddress', '14 Elm Road')
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save — try again')
    expect((form.querySelector('[name="siteAddress"]') as HTMLTextAreaElement).value).toBe('14 Elm Road')
  })
})

describe('Job details — contacts', () => {
  it('saves a contact with a name only', async () => {
    mockCreateJobContact.mockResolvedValue(contact())
    renderWorkspace()
    await openJobDetails()
    const form = await openContactForm('Add contact')

    // Name is the only requirement; everything else is explicitly optional.
    expect(screen.getByRole('button', { name: 'Save contact' })).toBeDisabled()
    fill(form, 'name', 'Mrs Patel')
    mockGetJobDetails.mockResolvedValue(details({}, [contact()]))
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))

    await waitFor(() => expect(mockCreateJobContact).toHaveBeenCalledWith(JOB.id, {
      name: 'Mrs Patel', role: null, phone: null, email: null, note: null,
    }))
    expect(await screen.findByText('Mrs Patel')).toBeInTheDocument()
  })

  it('saves a full contact and shows role, note, and tappable phone/email links', async () => {
    const full = contact({
      role: 'Customer', phone: '07700 900118', email: 'patel@example.com', note: 'Best after 4pm',
    })
    mockCreateJobContact.mockResolvedValue(full)
    renderWorkspace()
    await openJobDetails()
    const form = await openContactForm('Add contact')
    fill(form, 'name', 'Mrs Patel')
    fill(form, 'role', 'Customer')
    fill(form, 'phone', '07700 900118')
    fill(form, 'email', 'patel@example.com')
    fill(form, 'note', 'Best after 4pm')
    mockGetJobDetails.mockResolvedValue(details({}, [full]))
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))

    await waitFor(() => expect(mockCreateJobContact).toHaveBeenCalledWith(JOB.id, {
      name: 'Mrs Patel', role: 'Customer', phone: '07700 900118', email: 'patel@example.com', note: 'Best after 4pm',
    }))

    const sheet = screen.getByRole('dialog')
    expect(await within(sheet).findByText('Customer')).toBeInTheDocument()
    expect(within(sheet).getByText('Best after 4pm')).toBeInTheDocument()

    // Phone and email are links Mike has to tap — the number keeps its saved
    // formatting on screen while the dial target is stripped.
    const call = within(sheet).getByRole('link', { name: 'Call Mrs Patel on 07700 900118' })
    expect(call).toHaveAttribute('href', 'tel:07700900118')
    expect(call).toHaveTextContent('07700 900118')
    const mail = within(sheet).getByRole('link', { name: 'Email Mrs Patel at patel@example.com' })
    expect(mail).toHaveAttribute('href', 'mailto:patel%40example.com')
  })

  it('edits a contact and clears its optional fields with explicit nulls', async () => {
    const existing = contact({ role: 'Customer', phone: '07700 900118', email: 'patel@example.com', note: 'Best after 4pm' })
    mockGetJobDetails.mockResolvedValue(details({}, [existing]))
    mockPatchJobContact.mockResolvedValue(contact({ name: 'Mrs A Patel' }))
    renderWorkspace()
    await openJobDetails()
    const form = await openContactForm(/^Edit/)

    // The form opens on the saved values, so an edit is a correction and not a
    // retype from blank.
    expect((form.querySelector('[name="phone"]') as HTMLInputElement).value).toBe('07700 900118')

    fill(form, 'name', 'Mrs A Patel')
    fill(form, 'phone', '')
    fill(form, 'email', '')
    fill(form, 'note', '')
    fill(form, 'role', '')
    mockGetJobDetails.mockResolvedValue(details({}, [contact({ name: 'Mrs A Patel' })]))
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))

    await waitFor(() => expect(mockPatchJobContact).toHaveBeenCalledWith(JOB.id, existing.id, {
      name: 'Mrs A Patel', role: null, phone: null, email: null, note: null,
    }))
    const sheet = screen.getByRole('dialog')
    expect(await within(sheet).findByText('Mrs A Patel')).toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: /call/i })).toBeNull()
  })

  it('removes a contact only after a confirmation, and keeps it on a failure', async () => {
    const existing = contact({ phone: '07700 900118' })
    mockGetJobDetails.mockResolvedValue(details({}, [existing]))
    mockRemoveJobContact.mockRejectedValueOnce(new Error('offline'))
    renderWorkspace()
    await openJobDetails()
    await openContactForm(/^Edit/)
    fireEvent.click(screen.getByRole('button', { name: 'Remove contact' }))

    // Nothing is sent until the confirmation itself is tapped.
    expect(await screen.findByText('Remove Mrs Patel?')).toBeInTheDocument()
    expect(mockRemoveJobContact).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove — try again')
    // The failed removal left the contact exactly where it was.
    fireEvent.click(screen.getByRole('button', { name: '‹ Back' }))
    expect(await screen.findByText('Mrs Patel')).toBeInTheDocument()

    mockRemoveJobContact.mockResolvedValueOnce(undefined)
    mockGetJobDetails.mockResolvedValue(details({}, []))
    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove contact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(mockRemoveJobContact).toHaveBeenCalledWith(JOB.id, existing.id))
    expect(await screen.findByText('No contacts yet. Add whoever you need to reach on this job.')).toBeInTheDocument()
  })

  it('keeps entered values and offers a retry when a contact save fails', async () => {
    mockCreateJobContact.mockRejectedValue(new Error('offline'))
    renderWorkspace()
    await openJobDetails()
    const form = await openContactForm('Add contact')
    fill(form, 'name', 'Dave the sparky')
    fill(form, 'phone', '07700 900999')
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save — try again')
    expect((form.querySelector('[name="name"]') as HTMLInputElement).value).toBe('Dave the sparky')
    expect((form.querySelector('[name="phone"]') as HTMLInputElement).value).toBe('07700 900999')
  })

  it('offers a retry when job details fail to load', async () => {
    mockGetJobDetails.mockRejectedValue(new Error('offline'))
    renderWorkspace()
    await openJobDetails()
    expect(await screen.findByText('Couldn’t load job details.')).toBeInTheDocument()

    mockGetJobDetails.mockResolvedValue(details({}, [contact()]))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Mrs Patel')).toBeInTheDocument()
  })
})

describe('Job details — analytics privacy', () => {
  it('contact events carry presence flags only — never a name, number, email, note, or address', async () => {
    const full = contact({ role: 'Customer', phone: '07700 900118', email: 'patel@example.com', note: 'Best after 4pm' })
    mockCreateJobContact.mockResolvedValue(full)
    mockPatchJobDetails.mockResolvedValue(details({ siteAddress: '14 Elm Road, Reading RG1 5QT' }))
    renderWorkspace()
    await openJobDetails()

    const addressForm = await (async () => {
      fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Add site address' }))
      return await screen.findByRole('form', { name: 'Site address' })
    })()
    fill(addressForm, 'siteAddress', '14 Elm Road, Reading RG1 5QT')
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(mockPatchJobDetails).toHaveBeenCalled())

    const form = await openContactForm('Add contact')
    fill(form, 'name', 'Mrs Patel')
    fill(form, 'role', 'Customer')
    fill(form, 'phone', '07700 900118')
    fill(form, 'email', 'patel@example.com')
    fill(form, 'note', 'Best after 4pm')
    mockGetJobDetails.mockResolvedValue(details({}, [full]))
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('job_contact_added', {
      job_id: JOB.id, has_role: true, has_phone: true, has_email: true, has_note: true,
    }))
    const sent = JSON.stringify(vi.mocked(track).mock.calls)
    expect(sent).not.toMatch(/Patel|07700|example\.com|Elm Road|Best after/)
  })
})

describe('contact link targets', () => {
  it('strips formatting from tel: and keeps a leading +', () => {
    expect(telHref('07700 900 118')).toBe('tel:07700900118')
    expect(telHref('+44 (0)7700 900-118')).toBe('tel:+4407700900118')
    expect(telHref('ask on site')).toBeNull()
    expect(telHref(null)).toBeNull()
  })

  it('encodes mailto: and never carries anything but the address', () => {
    expect(mailtoHref('Patel+Jobs@example.com')).toBe('mailto:Patel%2BJobs%40example.com')
    expect(mailtoHref('not-an-email')).toBeNull()
  })
})
