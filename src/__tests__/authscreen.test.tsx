import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthScreen from '../AuthScreen'
import { signup, login, requestPasswordReset, confirmPasswordReset, ApiError } from '../api'
import type { AuthUser } from '../types'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    signup: vi.fn(),
    login: vi.fn(),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
    ApiError: actual.ApiError,
  }
})

const mockSignup = vi.mocked(signup)
const mockLogin = vi.mocked(login)
const mockRequestPasswordReset = vi.mocked(requestPasswordReset)
const mockConfirmPasswordReset = vi.mocked(confirmPasswordReset)
const mockOnAuthSuccess = vi.fn()

const MIKE: AuthUser = { id: 'user-mike', email: 'mike@thejobbook.test', name: 'Mike', role: 'PILOT' }

function setLocationSearch(search: string) {
  window.history.pushState({}, '', `/${search}`)
}

describe('AuthScreen — log in', () => {
  beforeEach(() => setLocationSearch(''))

  it('renders the login form by default, with no passcode language', () => {
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    expect(screen.getByRole('form', { name: /log in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^log in$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument()
    expect(screen.queryByText(/passcode/i)).toBeNull()
  })

  it('logs in and calls onAuthSuccess with the returned user', async () => {
    mockLogin.mockResolvedValue(MIKE)
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)

    await user.type(screen.getByLabelText(/email/i), 'mike@thejobbook.test')
    await user.type(screen.getByLabelText(/^password$/i), 'demo')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('mike@thejobbook.test', 'demo'))
    expect(mockOnAuthSuccess).toHaveBeenCalledWith(MIKE)
  })

  it('shows a retryable, non-enumerating error on wrong credentials', async () => {
    mockLogin.mockRejectedValue(new ApiError('Invalid email or password', 401))
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)

    await user.type(screen.getByLabelText(/email/i), 'mike@thejobbook.test')
    await user.type(screen.getByLabelText(/^password$/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i))
    expect(mockOnAuthSuccess).not.toHaveBeenCalled()
    // Form must still be usable — not stuck in submitting state.
    expect(screen.getByRole('button', { name: /^log in$/i })).not.toBeDisabled()
  })

  it('shows a generic retryable error on network failure', async () => {
    mockLogin.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)

    await user.type(screen.getByLabelText(/email/i), 'mike@thejobbook.test')
    await user.type(screen.getByLabelText(/^password$/i), 'demo')
    await user.click(screen.getByRole('button', { name: /^log in$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i))
  })

  it('switches to the signup form', async () => {
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /^sign up$/i }))
    expect(screen.getByRole('form', { name: /^sign up$/i })).toBeInTheDocument()
  })

  it('switches to the reset-request form', async () => {
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByRole('form', { name: /reset password/i })).toBeInTheDocument()
  })
})

describe('AuthScreen — sign up', () => {
  beforeEach(() => setLocationSearch(''))

  it('renders the signup form with email, password, and an optional name', async () => {
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /^sign up$/i }))

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign up$/i, hidden: false })).toBeInTheDocument()
  })

  it('signs up a new builder and calls onAuthSuccess', async () => {
    const NEW_BUILDER: AuthUser = { id: 'user-new', email: 'new@builder.test', name: 'New Builder', role: 'PILOT' }
    mockSignup.mockResolvedValue(NEW_BUILDER)
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /^sign up$/i }))

    await user.type(screen.getByLabelText(/name/i), 'New Builder')
    await user.type(screen.getByLabelText(/email/i), 'new@builder.test')
    await user.type(screen.getByLabelText(/^password$/i), 'a-strong-password')
    await user.click(screen.getByRole('form', { name: /^sign up$/i }).querySelector('button[type="submit"]')!)

    await waitFor(() => expect(mockSignup).toHaveBeenCalledWith('new@builder.test', 'a-strong-password', 'New Builder'))
    expect(mockOnAuthSuccess).toHaveBeenCalledWith(NEW_BUILDER)
  })

  it('shows a retryable error for a duplicate email', async () => {
    mockSignup.mockRejectedValue(new ApiError('That email is already registered', 409))
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /^sign up$/i }))

    await user.type(screen.getByLabelText(/email/i), 'mike@thejobbook.test')
    await user.type(screen.getByLabelText(/^password$/i), 'a-strong-password')
    await user.click(screen.getByRole('form', { name: /^sign up$/i }).querySelector('button[type="submit"]')!)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already registered/i))
    expect(mockOnAuthSuccess).not.toHaveBeenCalled()
  })

  it('switches back to the login form', async () => {
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /^sign up$/i }))
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(screen.getByRole('form', { name: /^log in$/i })).toBeInTheDocument()
  })
})

describe('AuthScreen — forgot password (request)', () => {
  beforeEach(() => setLocationSearch(''))

  it('shows the same generic success copy whether or not the email exists', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))

    await user.type(screen.getByLabelText(/email/i), 'anyone@example.test')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(mockRequestPasswordReset).toHaveBeenCalledWith('anyone@example.test'))
    expect(screen.getByRole('status')).toHaveTextContent(/if an account exists/i)
  })

  it('shows a retryable error only for an actual network/server failure, not for a missing account', async () => {
    mockRequestPasswordReset.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))

    await user.type(screen.getByLabelText(/email/i), 'anyone@example.test')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i))
  })

  it('can return to the login form', async () => {
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    await user.click(screen.getByRole('button', { name: /^log in$/i }))
    expect(screen.getByRole('form', { name: /^log in$/i })).toBeInTheDocument()
  })
})

describe('AuthScreen — reset confirm', () => {
  afterEach(() => setLocationSearch(''))

  it('starts directly in reset-confirm mode when a reset token is present in the URL', () => {
    setLocationSearch('?reset_token=mock-reset-token')
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)
    expect(screen.getByRole('form', { name: /choose new password/i })).toBeInTheDocument()
  })

  it('confirms a new password and returns to login with a success message', async () => {
    setLocationSearch('?reset_token=mock-reset-token')
    mockConfirmPasswordReset.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)

    await user.type(screen.getByLabelText(/new password/i), 'a-new-strong-password')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    await waitFor(() => expect(mockConfirmPasswordReset).toHaveBeenCalledWith('mock-reset-token', 'a-new-strong-password'))
    expect(screen.getByRole('form', { name: /^log in$/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/password updated/i)
  })

  it('shows a specific error for an invalid or expired reset link', async () => {
    setLocationSearch('?reset_token=stale-token')
    mockConfirmPasswordReset.mockRejectedValue(new ApiError('This reset link is no longer valid', 400))
    const user = userEvent.setup()
    render(<AuthScreen onAuthSuccess={mockOnAuthSuccess} />)

    await user.type(screen.getByLabelText(/new password/i), 'a-new-strong-password')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no longer valid/i))
  })
})
