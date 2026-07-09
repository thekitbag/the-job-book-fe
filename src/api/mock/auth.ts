import type { AuthUser } from '../../types'
import { ApiError } from '../client'
import { AUTH_ERROR_COPY } from '../authErrors'
import { delay } from './util'

// Mock mode mirrors per-account job ownership without a real backend: Mike is
// the seeded pilot account and owns the seeded jobs; anyone who signs up fresh
// in mock mode starts with no jobs (see the session check in mock/jobs.ts).
//
// Mock mode starts already signed in as Mike — every existing mock-mode e2e
// spec across the app (spend, direct-add, review queue, etc.) relies on
// landing straight on the workspace with no login step. A spec that wants a
// genuinely unauthenticated start should call logout() first.
export const MOCK_MIKE_EMAIL = 'mike@thejobbook.test'
const MOCK_MIKE_USER: AuthUser = { id: 'user-mock-mike', email: MOCK_MIKE_EMAIL, name: 'Mike', role: 'PILOT' }
// Seeded INTERNAL account for exercising Founder Support Mode in mock mode.
export const MOCK_FOUNDER_EMAIL = 'founder@thejobbook.test'
const MOCK_FOUNDER_USER: AuthUser = { id: 'user-mock-founder', email: MOCK_FOUNDER_EMAIL, name: 'Founder', role: 'INTERNAL' }
// A second pilot with no jobs, so the support surface has a real empty state.
export const MOCK_DAVE_EMAIL = 'dave@thejobbook.test'
const MOCK_DAVE_USER: AuthUser = { id: 'user-mock-dave', email: MOCK_DAVE_EMAIL, name: 'Dave', role: 'PILOT' }
const MOCK_RESET_TOKEN = 'mock-reset-token'
const mockAccounts = new Map<string, { password: string; user: AuthUser }>([
  [MOCK_MIKE_EMAIL, { password: 'demo', user: MOCK_MIKE_USER }],
  [MOCK_FOUNDER_EMAIL, { password: 'demo', user: MOCK_FOUNDER_USER }],
  [MOCK_DAVE_EMAIL, { password: 'demo', user: MOCK_DAVE_USER }],
])
// The mock session persists across full page loads via sessionStorage (a real
// backend session is a cookie and survives navigation — e.g. following the
// internal /internal/support link). A fresh browser context still starts
// signed in as Mike, which every existing mock-mode e2e spec relies on.
const MOCK_SESSION_KEY = 'job-book-mock-session'
function loadMockSession(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(MOCK_SESSION_KEY)
    if (raw === 'null') return null
    return raw ? (JSON.parse(raw) as AuthUser) : MOCK_MIKE_USER
  } catch {
    return MOCK_MIKE_USER
  }
}
function persistMockSession(session: AuthUser | null): void {
  try { sessionStorage.setItem(MOCK_SESSION_KEY, session ? JSON.stringify(session) : 'null') } catch { /* non-browser env */ }
}
let mockSession: AuthUser | null = loadMockSession()

// The seeded users the mock support endpoints list (role visible, no secrets).
export const MOCK_SUPPORT_DIRECTORY: AuthUser[] = [MOCK_MIKE_USER, MOCK_DAVE_USER, MOCK_FOUNDER_USER]

export function getMockSession(): AuthUser | null {
  return mockSession
}

export async function mockSignup(email: string, password: string, name?: string): Promise<AuthUser> {
  await delay(300)
  if (mockAccounts.has(email)) throw new ApiError(AUTH_ERROR_COPY.EMAIL_IN_USE, 409)
  const user: AuthUser = { id: `user-mock-${Date.now()}`, email, name: name?.trim() || 'Builder', role: 'PILOT' }
  mockAccounts.set(email, { password, user })
  mockSession = user
  persistMockSession(mockSession)
  return user
}

export async function mockLogin(email: string, password: string): Promise<AuthUser> {
  await delay(300)
  const account = mockAccounts.get(email)
  if (!account || account.password !== password) throw new ApiError(AUTH_ERROR_COPY.INVALID_CREDENTIALS, 401)
  mockSession = account.user
  persistMockSession(mockSession)
  return account.user
}

export async function mockLogout(): Promise<void> {
  await delay(150)
  mockSession = null
  persistMockSession(null)
}

export async function mockGetCurrentUser(): Promise<AuthUser> {
  await delay(150)
  if (!mockSession) throw new ApiError('Unauthorized', 401)
  return mockSession
}

export async function mockRequestPasswordReset(email: string): Promise<void> {
  await delay(300)
  if (import.meta.env.DEV) console.info(`[mock] password reset requested for ${email} — token: ${MOCK_RESET_TOKEN}`)
}

export async function mockConfirmPasswordReset(token: string, password: string): Promise<AuthUser> {
  await delay(300)
  if (token !== MOCK_RESET_TOKEN) throw new ApiError(AUTH_ERROR_COPY.RESET_TOKEN_INVALID, 400)
  const account = mockAccounts.get(MOCK_MIKE_EMAIL)!
  account.password = password
  mockSession = account.user
  persistMockSession(mockSession)
  return account.user
}
