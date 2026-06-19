import { FormEvent, useState } from 'react'
import { pilotLogin, ApiError } from './api'

export default function PasscodeScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await pilotLogin(passcode)
      onLoginSuccess()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Wrong passcode — check and try again')
      } else {
        setError('Could not reach the server — tap to retry')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="passcode-page">
      <div className="passcode-card">
        <h1 className="passcode-title">The Job Book</h1>
        <p className="passcode-subtitle">Enter the pilot passcode to continue</p>
        <form className="passcode-form" onSubmit={handleSubmit} aria-label="Pilot login">
          <label className="passcode-field">
            <span className="passcode-label">Passcode</span>
            <input
              className="passcode-input"
              type="password"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="passcode-error" role="alert">{error}</p>}
          <button
            type="submit"
            className="passcode-submit"
            disabled={submitting || !passcode}
          >
            {submitting ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
