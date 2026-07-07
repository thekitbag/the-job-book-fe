import type { AuthUser } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { AUTH_ERROR_COPY, authErrorMessage } from './authErrors'
import { mockConfirmPasswordReset, mockGetCurrentUser, mockLogin, mockLogout, mockRequestPasswordReset, mockSignup } from './mock/auth'

// ── Email/password auth ──────────────────────────────────────────────────────

// POST /api/auth/signup — 201 on success.
export async function signup(email: string, password: string, name?: string): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase()
  if (USE_MOCK) return mockSignup(normalized, password, name)
  const res = await apiFetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized, password, name }),
  })
  if (!res.ok) throw new ApiError(await authErrorMessage(res, 'Could not create account — check details and try again'), res.status)
  return ((await res.json()) as { user: AuthUser }).user
}

// POST /api/auth/login
export async function login(email: string, password: string): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase()
  if (USE_MOCK) return mockLogin(normalized, password)
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized, password }),
  })
  if (!res.ok) throw new ApiError(await authErrorMessage(res, AUTH_ERROR_COPY.INVALID_CREDENTIALS), res.status)
  return ((await res.json()) as { user: AuthUser }).user
}

// POST /api/auth/logout — clears jobbook_session (and any legacy pilot_session).
export async function logout(): Promise<void> {
  if (USE_MOCK) return mockLogout()
  const res = await apiFetch('/api/auth/logout', { method: 'POST' })
  if (!res.ok) throw new ApiError(`POST /api/auth/logout → ${res.status}`, res.status)
}

// GET /api/auth/me — 401 when unauthenticated (or the session's user no longer exists).
export async function getCurrentUser(): Promise<AuthUser> {
  if (USE_MOCK) return mockGetCurrentUser()
  const res = await apiFetch('/api/auth/me')
  if (res.status === 401) throw new ApiError('Unauthorized', 401)
  if (!res.ok) throw new ApiError(`GET /api/auth/me → ${res.status}`, res.status)
  return ((await res.json()) as { user: AuthUser }).user
}

// POST /api/auth/password-reset/request — backend always returns { ok: true },
// even on internal failure, so it never reveals whether the email exists.
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (USE_MOCK) return mockRequestPasswordReset(normalized)
  await apiFetch('/api/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized }),
  })
}

// POST /api/auth/password-reset/confirm — success sets the session cookie and
// returns the now-logged-in user; callers should treat it exactly like login.
export async function confirmPasswordReset(token: string, password: string): Promise<AuthUser> {
  if (USE_MOCK) return mockConfirmPasswordReset(token, password)
  const res = await apiFetch('/api/auth/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  if (!res.ok) throw new ApiError(await authErrorMessage(res, AUTH_ERROR_COPY.RESET_TOKEN_INVALID), res.status)
  return ((await res.json()) as { user: AuthUser }).user
}
