import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createJob, getJobs } from '../api'
import type { Job } from '../types'

// Book Home / All Jobs / New Job are exercised for real here — only the job
// workspace below them is stubbed, so these tests cover the actual navigation
// level introduced by the book-home-and-job-navigation spec.

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return { ...actual, saveNote: vi.fn(), getNotesForJob: vi.fn(() => Promise.resolve([])) }
})

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    getJobs: vi.fn(),
    createJob: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
    getCurrentUser: vi.fn(() => Promise.resolve({ id: 'u1', email: 'mike@test', name: 'Mike', role: 'PILOT' })),
    onUnauthorized: vi.fn(),
    // Cross-job Money has its own suite (bookmoney.test.tsx). Here the backend
    // says there is nothing to show, which is what proves the row is omitted.
    getBookMoney: vi.fn(() => Promise.resolve({ bookHome: { showMoneyRow: false }, toPayOnAccounts: null, owedToMe: null })),
    // Workshop has its own suite (workshop.test.tsx). Here it is the empty
    // destination: the row exists, with no count and no preview.
    getWorkshop: vi.fn(() => Promise.resolve({
      generatedAt: '2026-08-18T09:00:00.000Z',
      bookHome: { showWorkshopRow: true, availableCount: 0, availableLabel: null, previewItems: [] },
      availableItems: [],
    })),
    ApiError: actual.ApiError,
  }
})

// Stands in for the job workspace: it carries the one Record action in the app
// so "Book Home has no Record" is provable, and reports which job is selected.
vi.mock('../CurrentJobWorkspace', () => ({
  default: ({ job, onOpenBookHome }: { job: Job; onOpenBookHome: () => void }) => (
    <div data-testid="workspace-screen" data-job-id={job.id}>
      <h1>{job.title}</h1>
      <button onClick={onOpenBookHome}>‹ The Job Book</button>
      <button aria-label={`Start recording, saves to ${job.title}`}>Record</button>
    </div>
  ),
}))

vi.mock('../AuthScreen', () => ({
  default: () => <div data-testid="auth-screen" />,
  getResetToken: () => null,
}))

const mockGetJobs = vi.mocked(getJobs)
const mockCreateJob = vi.mocked(createJob)

function job(over: Partial<Job> & { id: string; title: string }): Job {
  return {
    jobType: 'other',
    roughLocationOrLabel: null,
    status: 'started',
    createdAt: '2026-06-01T08:00:00Z',
    updatedAt: '2026-06-01T08:00:00Z',
    ...over,
  }
}

const HILL = job({ id: 'job-hill', title: 'Hill extension', roughLocationOrLabel: '14 Hilltop Road' })
const SAMMY = job({ id: 'job-sammy', title: 'Sammy garden room', roughLocationOrLabel: 'Beech Road' })
const GRANT = job({ id: 'job-grant', title: 'Grant James roof', status: 'planning', roughLocationOrLabel: 'Ash Grove' })
const VERITY = job({ id: 'job-verity', title: 'Verity porch', status: 'planning' })
const WHITMORE = job({ id: 'job-whitmore', title: 'Whitmore patio', status: 'finished', roughLocationOrLabel: 'Elm Close' })
const OKORO = job({ id: 'job-okoro', title: 'Okoro loft', status: 'finished' })

const ALL = [HILL, SAMMY, GRANT, VERITY, WHITMORE, OKORO]

const SELECTED_ID_KEY = 'job-book-selected-job-id'

async function launch() {
  render(<App />)
  await waitFor(() => expect(screen.getByTestId('workspace-screen')).toBeInTheDocument())
}

async function gotoBookHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /the job book/i }))
  await screen.findByRole('heading', { name: 'The Job Book' })
}

// The job index is reached through the Jobs row now — Book Home no longer
// lists jobs itself, so there is no "All jobs ›" link beside a list.
async function gotoAllJobs(user: ReturnType<typeof userEvent.setup>) {
  await gotoBookHome(user)
  await user.click(screen.getByRole('button', { name: /^Jobs/ }))
  await screen.findByRole('heading', { name: /^All jobs/ })
}

function group(name: RegExp) {
  return within(screen.getByRole('region', { name }))
}

describe('Book Home and job navigation', () => {
  beforeEach(() => {
    mockGetJobs.mockResolvedValue(ALL)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  // ── Launch and route ──────────────────────────────────────────────────────

  it('still launches into the last selected job, not Book Home', async () => {
    localStorage.setItem(SELECTED_ID_KEY, SAMMY.id)
    await launch()
    expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', SAMMY.id)
    expect(screen.queryByRole('heading', { name: 'The Job Book' })).not.toBeInTheDocument()
  })

  it('every Job Home has a route labelled "The Job Book"', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)
    expect(screen.getByRole('heading', { name: 'The Job Book' })).toBeInTheDocument()
  })

  // ── Book Home ─────────────────────────────────────────────────────────────

  it('Book Home has no Record action', async () => {
    const user = userEvent.setup()
    await launch()
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    await gotoBookHome(user)
    expect(screen.queryByRole('button', { name: /record/i })).not.toBeInTheDocument()
  })

  it('is three destination rows, and names no individual job', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)

    // The cover says how much of each thing there is and hands over. It used
    // to list the live jobs by name, which put a job list directly above the
    // page that is itself a job list. (Money is backend-gated and off in this
    // suite's fixture — bookmoney.test.tsx owns the row that appears.)
    expect(screen.getByRole('button', { name: /^Jobs/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Workshop/ })).toBeInTheDocument()
    for (const j of ALL) {
      expect(screen.queryByRole('button', { name: new RegExp(j.title) })).not.toBeInTheDocument()
    }
  })

  it('counts the jobs by state, dropping any state there are none of', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)

    // 2 started, 2 planning, 2 finished in the fixture.
    const jobsRow = screen.getByRole('button', { name: /^Jobs/ })
    expect(jobsRow).toHaveTextContent('2 in progress')
    expect(jobsRow).toHaveTextContent('2 planning · 2 finished')

    mockGetJobs.mockResolvedValue([HILL, SAMMY])
    localStorage.clear()
    cleanup()
    await launch()
    await gotoBookHome(user)
    const onlyLive = screen.getByRole('button', { name: /^Jobs/ })
    expect(onlyLive).toHaveTextContent('2 in progress')
    // No "0 planning", no "0 finished" — a zero is a fact about nothing.
    expect(onlyLive).not.toHaveTextContent('0')
  })

  it('the Jobs row opens All Jobs, which is where a job is now opened', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, HILL.id)
    await launch()
    await gotoBookHome(user)

    await user.click(screen.getByRole('button', { name: /^Jobs/ }))
    await screen.findByRole('heading', { name: /^All jobs/ })
    // Reaching the index changed nothing about what Record would save to.
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(HILL.id)
  })

  it('holds the Jobs "things to check" line until a cross-job count exists', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)
    // The design puts a to-check count under Jobs. stillToCheck is per-job on
    // memory-view only, so there is nothing cross-job to count — and a number
    // derived here would disagree with the jobs it claims to summarise.
    expect(screen.queryByText(/to check/i)).not.toBeInTheDocument()
  })

  it('shows no Money row when the backend has nothing to show', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)
    // Money is backend-gated: with showMoneyRow false there is no row, and no
    // £0 or "nothing owed" stand-in for it either.
    expect(screen.queryByText(/money/i)).not.toBeInTheDocument()
  })

  it('keeps the Workshop row when the workshop is empty, with no count and no explanation', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)
    // Workshop is a destination now, so the route stays learnable even with
    // nothing in there — but an empty workshop says nothing about stock: no
    // "0 things", no explanation of how leftovers get there, no Record.
    expect(screen.getByRole('button', { name: /Workshop/ })).toBeInTheDocument()
    expect(screen.queryByText(/0 things/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record/i })).not.toBeInTheDocument()
  })

  it('returning to Book Home does not change the selected job', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, SAMMY.id)
    await launch()
    await gotoBookHome(user)
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)

    // and coming back down through All Jobs leaves it selected
    await user.click(screen.getByRole('button', { name: /^Jobs/ }))
    await user.click(await screen.findByRole('button', { name: /Sammy garden room/ }))
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', SAMMY.id))
  })

  // ── All Jobs ──────────────────────────────────────────────────────────────

  it('All Jobs is one grouped index with a total and per-group counts', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoAllJobs(user)

    expect(screen.getByRole('heading', { name: 'All jobs 6' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'In progress 2' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Planning 2' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Finished 2' })).toBeInTheDocument()
    // grouped index, not tabs
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('shows every job exactly once, in its own group, with its where line', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoAllJobs(user)

    for (const j of ALL) {
      expect(screen.getAllByRole('button', { name: new RegExp(j.title) })).toHaveLength(1)
    }
    expect(group(/in progress/i).getByRole('button', { name: /Hill extension/ })).toBeInTheDocument()
    expect(group(/planning/i).getByRole('button', { name: /Grant James roof/ })).toBeInTheDocument()
    expect(group(/finished/i).getByRole('button', { name: /Whitmore patio/ })).toBeInTheDocument()
    expect(screen.getByText('14 Hilltop Road')).toBeInTheDocument()
  })

  it('opening a job from All Jobs selects it for recording', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoAllJobs(user)

    await user.click(screen.getByRole('button', { name: /Okoro loft/ }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', OKORO.id))
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(OKORO.id)
  })

  it('reaches the finished work through All jobs, which lists it under its own heading', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoAllJobs(user)

    expect(screen.getByRole('heading', { name: 'Finished 2' })).toBeInTheDocument()
    expect(group(/finished/i).getByRole('button', { name: /Okoro loft/ })).toBeInTheDocument()
  })

  it('All Jobs goes back to Book Home without changing the selected job', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, SAMMY.id)
    await launch()
    await gotoAllJobs(user)

    await user.click(screen.getByRole('button', { name: /back to the job book/i }))

    await screen.findByRole('heading', { name: 'The Job Book' })
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)
  })

  // ── New Job ───────────────────────────────────────────────────────────────

  async function openNewJob(user: ReturnType<typeof userEvent.setup>) {
    await gotoAllJobs(user)
    await user.click(screen.getByRole('button', { name: /new job/i }))
    return within(await screen.findByRole('dialog', { name: /new job/i }))
  }

  it('New job is a command on All Jobs that opens the form', async () => {
    const user = userEvent.setup()
    await launch()
    const form = await openNewJob(user)

    expect(form.getByLabelText(/job name/i)).toBeInTheDocument()
    expect(form.getByLabelText(/where \(optional\)/i)).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Add job' })).toBeInTheDocument()
    // the design's "Start the job" copy is overridden by the product handoff
    expect(form.queryByRole('button', { name: /start the job/i })).not.toBeInTheDocument()
  })

  it('defaults to In progress and creates one job, opening it as the selected job', async () => {
    const user = userEvent.setup()
    const created = job({ id: 'job-new', title: 'Verity porch 2' })
    mockCreateJob.mockResolvedValue(created)
    await launch()
    const form = await openNewJob(user)

    expect(form.getByRole('radio', { name: 'In progress' })).toBeChecked()
    await user.type(form.getByLabelText(/job name/i), 'Verity porch 2')
    await user.type(form.getByLabelText(/where \(optional\)/i), 'Elm Close')
    await user.click(form.getByRole('button', { name: 'Add job' }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', created.id))
    expect(mockCreateJob).toHaveBeenCalledTimes(1)
    expect(mockCreateJob).toHaveBeenCalledWith({
      title: 'Verity porch 2',
      roughLocationOrLabel: 'Elm Close',
      status: 'started',
    })
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(created.id)
  })

  it('creates a Planning job when Planning is chosen, and it lands in the Planning group', async () => {
    const user = userEvent.setup()
    const created = job({ id: 'job-new-planning', title: 'Quote for barn', status: 'planning' })
    mockCreateJob.mockResolvedValue(created)
    await launch()
    const form = await openNewJob(user)

    await user.type(form.getByLabelText(/job name/i), 'Quote for barn')
    await user.click(form.getByRole('radio', { name: 'Planning' }))
    await user.click(form.getByRole('button', { name: 'Add job' }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', created.id))
    expect(mockCreateJob).toHaveBeenCalledWith({ title: 'Quote for barn', roughLocationOrLabel: null, status: 'planning' })

    await gotoAllJobs(user)
    expect(group(/planning/i).getByRole('button', { name: /Quote for barn/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All jobs 7' })).toBeInTheDocument()
  })

  it('a double tap on Add job creates exactly one job', async () => {
    const user = userEvent.setup()
    let resolveCreate: (j: Job) => void = () => {}
    mockCreateJob.mockImplementation(() => new Promise<Job>(res => { resolveCreate = res }))
    await launch()
    const form = await openNewJob(user)

    await user.type(form.getByLabelText(/job name/i), 'Slow job')
    const submit = form.getByRole('button', { name: /add(ing)? job/i })
    await user.click(submit)
    await user.click(submit)

    expect(mockCreateJob).toHaveBeenCalledTimes(1)
    await act(async () => { resolveCreate(job({ id: 'job-slow', title: 'Slow job' })) })
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', 'job-slow'))
    expect(mockCreateJob).toHaveBeenCalledTimes(1)
  })

  it('cancelling creates no job and preserves the previously selected job', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, SAMMY.id)
    await launch()
    const form = await openNewJob(user)

    await user.type(form.getByLabelText(/job name/i), 'Never created')
    await user.click(form.getByRole('button', { name: /cancel/i }))

    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Never created/ })).not.toBeInTheDocument()
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)
  })

  it('a failed create keeps the entered details, shows a retryable error, and adds no fake job', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, SAMMY.id)
    mockCreateJob.mockRejectedValue(new Error('network error'))
    await launch()
    const form = await openNewJob(user)

    await user.type(form.getByLabelText(/job name/i), 'Barn conversion')
    await user.type(form.getByLabelText(/where \(optional\)/i), 'Mill Lane')
    await user.click(form.getByRole('button', { name: 'Add job' }))

    expect(await form.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(form.getByLabelText(/job name/i)).toHaveValue('Barn conversion')
    expect(form.getByLabelText(/where \(optional\)/i)).toHaveValue('Mill Lane')
    expect(screen.queryByTestId('workspace-screen')).not.toBeInTheDocument()
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)

    // the job is not in the index either
    await user.click(form.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('button', { name: /Barn conversion/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All jobs 6' })).toBeInTheDocument()
  })

  it('offers a route to New job when there are no jobs at all', async () => {
    const user = userEvent.setup()
    mockGetJobs.mockResolvedValue([])
    const created = job({ id: 'job-first', title: 'First job' })
    mockCreateJob.mockResolvedValue(created)
    render(<App />)

    await screen.findByRole('heading', { name: /^All jobs/ })
    // Nowhere to go back to yet, so no back route is offered.
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new job/i }))
    const form = within(await screen.findByRole('dialog', { name: /new job/i }))
    await user.type(form.getByLabelText(/job name/i), 'First job')
    await user.click(form.getByRole('button', { name: 'Add job' }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', created.id))
  })

  // ── Navigation safety ─────────────────────────────────────────────────────

  it('a browser Back gesture does not loop or switch to the wrong job', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, HILL.id)
    await launch()
    await gotoAllJobs(user)
    await user.click(screen.getByRole('button', { name: /Sammy garden room/ }))
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', SAMMY.id))

    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })

    expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', SAMMY.id)
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)
  })
})
