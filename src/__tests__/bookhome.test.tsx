import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
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

async function gotoAllJobs(user: ReturnType<typeof userEvent.setup>) {
  await gotoBookHome(user)
  await user.click(screen.getByRole('button', { name: /all jobs/i }))
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

  it('lists in-progress and planning jobs under "Jobs on the book", and finished jobs not at all', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)

    expect(screen.getByText('Jobs on the book')).toBeInTheDocument()
    const list = within(screen.getByRole('list', { name: /jobs on the book/i }))
    for (const j of [HILL, SAMMY, GRANT, VERITY]) {
      expect(list.getByRole('button', { name: new RegExp(j.title) })).toBeInTheDocument()
    }
    expect(list.queryByRole('button', { name: /Whitmore patio/ })).not.toBeInTheDocument()
    expect(list.queryByRole('button', { name: /Okoro loft/ })).not.toBeInTheDocument()
    // Not even as a count: finished work lives behind "All jobs ›", and a
    // second jobs row below Money sent Mike back where he had just been.
    expect(screen.queryByRole('button', { name: /finished jobs/i })).not.toBeInTheDocument()
  })

  it('marks planning rows "Planning" and never repeats "In progress" on ordinary rows', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)

    expect(screen.getByRole('button', { name: /Grant James roof.*Planning/ })).toBeInTheDocument()
    expect(screen.queryByText('In progress')).not.toBeInTheDocument()
  })

  it('shows no Money row when the backend has nothing to show, and no Workshop or "to check" rows', async () => {
    const user = userEvent.setup()
    await launch()
    await gotoBookHome(user)
    // Money is backend-gated: with showMoneyRow false there is no row, and no
    // £0 or "nothing owed" stand-in for it either.
    expect(screen.queryByText(/money/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/workshop/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/to check/i)).not.toBeInTheDocument()
  })

  it('tapping a job on Book Home opens that Job Home and selects it for recording', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, HILL.id)
    await launch()
    await gotoBookHome(user)

    await user.click(screen.getByRole('button', { name: /Sammy garden room/ }))

    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', SAMMY.id))
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)
    expect(screen.getByRole('button', { name: /saves to Sammy garden room/i })).toBeInTheDocument()
  })

  it('returning to Book Home does not change the selected job', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SELECTED_ID_KEY, SAMMY.id)
    await launch()
    await gotoBookHome(user)
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)

    // and coming back into the same job leaves it selected
    await user.click(screen.getByRole('button', { name: /Sammy garden room/ }))
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
    await gotoBookHome(user)
    await user.click(screen.getByRole('button', { name: /Sammy garden room/ }))
    await waitFor(() => expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', SAMMY.id))

    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })

    expect(screen.getByTestId('workspace-screen')).toHaveAttribute('data-job-id', SAMMY.id)
    expect(localStorage.getItem(SELECTED_ID_KEY)).toBe(SAMMY.id)
  })
})
