import { FormEvent, useState } from 'react'
import { signup, login, requestPasswordReset, confirmPasswordReset, ApiError } from './api'
import type { AuthUser } from './types'

type Mode = 'login' | 'signup' | 'reset-request' | 'reset-confirm'

const NETWORK_ERROR = 'Could not reach the server — tap to retry'

function readResetToken(): string | null {
  return new URLSearchParams(window.location.search).get('reset_token')
}

export default function AuthScreen({ onAuthSuccess }: { onAuthSuccess: (user: AuthUser) => void }) {
  const [resetToken] = useState(readResetToken)
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset-confirm' : 'login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetRequestSent, setResetRequestSent] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setResetRequestSent(false)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await login(email.trim(), password)
      onAuthSuccess(user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await signup(email.trim(), password, name.trim() || undefined)
      onAuthSuccess(user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetRequest = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Backend always resolves here — never reveals whether the email exists.
      await requestPasswordReset(email.trim())
      setResetRequestSent(true)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetConfirm = async (e: FormEvent) => {
    e.preventDefault()
    if (!resetToken) return
    setError(null)
    setSubmitting(true)
    try {
      // A successful confirm sets the session cookie — log straight in.
      const user = await confirmPasswordReset(resetToken, newPassword)
      onAuthSuccess(user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">The Job Book</h1>

        {mode === 'login' && (
          <form className="auth-form" aria-label="Log in" onSubmit={handleLogin}>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input className="auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-submit" disabled={submitting || !email || !password}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => switchMode('reset-request')}>Forgot password?</button>
              <button type="button" className="auth-link" onClick={() => switchMode('signup')}>Sign up</button>
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form className="auth-form" aria-label="Sign up" onSubmit={handleSignup}>
            <label className="auth-field">
              <span className="auth-label">Name</span>
              <input className="auth-input" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Optional" />
            </label>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input className="auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-submit" disabled={submitting || !email || !password}>
              {submitting ? 'Signing up…' : 'Sign up'}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => switchMode('login')}>Log in</button>
            </div>
          </form>
        )}

        {mode === 'reset-request' && (
          <form className="auth-form" aria-label="Reset password" onSubmit={handleResetRequest}>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {resetRequestSent && (
              <p className="auth-status" role="status">If an account exists for that email, we've sent a link to reset the password.</p>
            )}
            <button type="submit" className="auth-submit" disabled={submitting || !email}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => switchMode('login')}>Log in</button>
            </div>
          </form>
        )}

        {mode === 'reset-confirm' && (
          <form className="auth-form" aria-label="Choose new password" onSubmit={handleResetConfirm}>
            <label className="auth-field">
              <span className="auth-label">New password</span>
              <input className="auth-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-submit" disabled={submitting || !newPassword}>
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => switchMode('reset-request')}>Request a new link</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
