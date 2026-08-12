import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthScreen from '../AuthScreen'
import AllJobsScreen from '../AllJobsScreen'
import { login, signup, requestPasswordReset, createJob } from '../api'
import { identifyAnalyticsUser, track } from '../analytics'
import type { AuthUser, Job } from '../types'

// Components call the wrapper, never posthog-js directly — so mocking the
// wrapper proves both that events fire and that nothing bypasses the guard.
vi.mock('../analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../analytics')>()
  return {
    ...actual,
    track: vi.fn(),
    identifyAnalyticsUser: vi.fn(),
    resetAnalyticsUser: vi.fn(),
  }
})

vi.mock('../api', () => ({
  login: vi.fn(),
  signup: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  createJob: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  },
}))

const USER: AuthUser = { id: 'user-abc', email: 'mike@test.example', name: 'Mike', role: 'PILOT' }

function allTrackedPayloads(): string {
  return JSON.stringify(vi.mocked(track).mock.calls)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('analytics — auth events', () => {
  it('successful login identifies by id+role and tracks auth_login_succeeded without email or name', async () => {
    vi.mocked(login).mockResolvedValue(USER)
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={() => {}} />)
    await user.type(screen.getByLabelText(/email/i), 'mike@test.example')
    await user.type(screen.getByLabelText(/password/i), 'hunter2secret')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('auth_login_succeeded', { role: 'PILOT' }))
    expect(identifyAnalyticsUser).toHaveBeenCalledWith(USER)
    expect(allTrackedPayloads()).not.toMatch(/mike@test\.example|hunter2secret|Mike/)
  })

  it('successful signup tracks auth_signup_succeeded with role only', async () => {
    vi.mocked(signup).mockResolvedValue(USER)
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={() => {}} />)
    await user.click(screen.getByRole('button', { name: /sign up/i }))
    await user.type(screen.getByLabelText(/email/i), 'mike@test.example')
    await user.type(screen.getByLabelText(/password/i), 'hunter2secret')
    await user.click(screen.getByRole('button', { name: /^sign up$/i }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('auth_signup_succeeded', { role: 'PILOT' }))
    expect(allTrackedPayloads()).not.toMatch(/mike@test\.example|hunter2secret/)
  })

  it('failed login tracks nothing', async () => {
    vi.mocked(login).mockRejectedValue(new Error('nope'))
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={() => {}} />)
    await user.type(screen.getByLabelText(/email/i), 'mike@test.example')
    await user.type(screen.getByLabelText(/password/i), 'hunter2secret')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(track).not.toHaveBeenCalled()
    expect(identifyAnalyticsUser).not.toHaveBeenCalled()
  })

  it('password reset request tracks the event with no properties (no email)', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={() => {}} />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText(/email/i), 'mike@test.example')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('auth_password_reset_requested'))
    expect(allTrackedPayloads()).not.toMatch(/mike@test\.example/)
  })
})

describe('analytics — job creation', () => {
  it('creating a job tracks job_created with safe properties but never the title or where', async () => {
    const created: Job = {
      id: 'job-new-1', title: 'Mrs Patel garden room', jobType: 'garden_room',
      roughLocationOrLabel: null, status: 'planning', createdAt: '', updatedAt: '',
    }
    vi.mocked(createJob).mockResolvedValue(created)
    const user = userEvent.setup()
    render(
      <AllJobsScreen jobs={[]} online={true} onOpenJob={() => {}} onJobAdded={() => {}} onBack={() => {}} hideBack={true} />,
    )
    await user.click(screen.getByRole('button', { name: 'New job' }))
    await user.type(screen.getByLabelText(/job name/i), 'Mrs Patel garden room')
    await user.type(screen.getByLabelText(/where \(optional\)/i), 'Beech Road')
    await user.click(screen.getByRole('button', { name: /^add job$/i }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('job_created', { job_id: 'job-new-1', job_status: 'planning', has_where: true }))
    expect(allTrackedPayloads()).not.toMatch(/Mrs Patel/)
    expect(allTrackedPayloads()).not.toMatch(/Beech Road/)
  })
})
