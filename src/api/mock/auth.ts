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
const MOCK_RESET_TOKEN = 'mock-reset-token'
const mockAccounts = new Map<string, { password: string; user: AuthUser }>([
  [MOCK_MIKE_EMAIL, { password: 'demo', user: MOCK_MIKE_USER }],
])
let mockSession: AuthUser | null = MOCK_MIKE_USER

export function getMockSession(): AuthUser | null {
  return mockSession
}

export async function mockSignup(email: string, password: string, name?: string): Promise<AuthUser> {
  await delay(300)
  if (mockAccounts.has(email)) throw new ApiError(AUTH_ERROR_COPY.EMAIL_IN_USE, 409)
  const user: AuthUser = { id: `user-mock-${Date.now()}`, email, name: name?.trim() || 'Builder', role: 'PILOT' }
  mockAccounts.set(email, { password, user })
  mockSession = user
  return user
}

export async function mockLogin(email: string, password: string): Promise<AuthUser> {
  await delay(300)
  const account = mockAccounts.get(email)
  if (!account || account.password !== password) throw new ApiError(AUTH_ERROR_COPY.INVALID_CREDENTIALS, 401)
  mockSession = account.user
  return account.user
}

export async function mockLogout(): Promise<void> {
  await delay(150)
  mockSession = null
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
  return account.user
}
