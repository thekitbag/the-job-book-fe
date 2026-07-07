// Production fetch mechanics shared by every domain API module. Mock fixtures
// and state live under ./mock — nothing in this file should know about them.

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
// Mock is opt-in only — real backend is the default
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK_API as string | undefined) === 'true'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

// Any apiFetch 401 notifies this listener, regardless of which endpoint expired
// — the app registers one on mount so a session lapsing mid-use clears stale
// job data everywhere, not just on the initial load.
let unauthorizedListener: (() => void) | null = null
export function onUnauthorized(listener: (() => void) | null): void {
  unauthorizedListener = listener
}

// All real-mode API calls go through apiFetch so credentials are always included.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include' })
  if (res.status === 401) unauthorizedListener?.()
  return res
}
