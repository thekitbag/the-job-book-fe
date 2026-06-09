import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PasscodeScreen from '../PasscodeScreen'
import { pilotLogin, ApiError } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    pilotLogin: vi.fn(),
    ApiError: actual.ApiError,
  }
})

const mockPilotLogin = vi.mocked(pilotLogin)
const mockOnLoginSuccess = vi.fn()

describe('PasscodeScreen', () => {
  it('renders the passcode form', () => {
    render(<PasscodeScreen onLoginSuccess={mockOnLoginSuccess} />)

    expect(screen.getByText('Job Book')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: /pilot login/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/passcode/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter/i })).toBeInTheDocument()
  })

  it('submit button is disabled when passcode is empty', () => {
    render(<PasscodeScreen onLoginSuccess={mockOnLoginSuccess} />)
    expect(screen.getByRole('button', { name: /enter/i })).toBeDisabled()
  })

  it('calls onLoginSuccess after successful login', async () => {
    mockPilotLogin.mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<PasscodeScreen onLoginSuccess={mockOnLoginSuccess} />)

    await user.type(screen.getByLabelText(/passcode/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => {
      expect(mockPilotLogin).toHaveBeenCalledWith('secret123')
    })
    expect(mockOnLoginSuccess).toHaveBeenCalled()
  })

  it('shows wrong-passcode error on 401', async () => {
    mockPilotLogin.mockRejectedValue(new ApiError('Wrong passcode', 401))
    const user = userEvent.setup()

    render(<PasscodeScreen onLoginSuccess={mockOnLoginSuccess} />)

    await user.type(screen.getByLabelText(/passcode/i), 'wrongcode')
    await user.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/wrong passcode/i)
    })
    expect(mockOnLoginSuccess).not.toHaveBeenCalled()
  })

  it('shows retryable server error on network failure', async () => {
    mockPilotLogin.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()

    render(<PasscodeScreen onLoginSuccess={mockOnLoginSuccess} />)

    await user.type(screen.getByLabelText(/passcode/i), 'anycode')
    await user.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i)
    })
    expect(mockOnLoginSuccess).not.toHaveBeenCalled()
  })

  it('re-enables the form and clears error state after a failure so the user can retry', async () => {
    mockPilotLogin.mockRejectedValue(new ApiError('Wrong passcode', 401))
    const user = userEvent.setup()

    render(<PasscodeScreen onLoginSuccess={mockOnLoginSuccess} />)

    await user.type(screen.getByLabelText(/passcode/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    // Form must still be usable — not stuck in submitting state
    expect(screen.getByRole('button', { name: /enter/i })).not.toBeDisabled()
    expect(screen.getByLabelText(/passcode/i)).toBeInTheDocument()
  })
})
