/** Local ownership is independent of selected jobs. A sign-in starts a new
 * durable capture boundary so a delayed identity lookup cannot claim earlier audio. */
export const LOCAL_OWNER_KEY = 'job-book-owner-user-id'
const BOUNDARY_KEY = 'job-book-capture-boundary-id'
let memorySession: string | null = null
let memoryOwner: string | null = null
let ownerStorageFailed = false
const listeners = new Set<() => void>()

export function getLocalOwnerId(): string | null {
  if (ownerStorageFailed) return memoryOwner
  try {
    return localStorage.getItem(LOCAL_OWNER_KEY)
  } catch {
    return memoryOwner
  }
}
// Keep the existing record field/API name; this id now lasts across app launches.
export function getCaptureSessionId(): string {
  try {
    const stored = localStorage.getItem(BOUNDARY_KEY)
    if (stored) return (memorySession = stored)
  } catch {
    /* Storage unavailable: retain identity in memory for this page. */
  }
  memorySession ??= crypto.randomUUID()
  persistBoundary(memorySession)
  return memorySession
}
function persistBoundary(id: string) {
  try {
    localStorage.setItem(BOUNDARY_KEY, id)
  } catch {
    /* in-memory fallback when browser storage is unavailable */
  }
}
function rotateSession() {
  memorySession = crypto.randomUUID()
  persistBoundary(memorySession)
}
function emit() {
  for (const listener of listeners) listener()
}
function storeOwner(id: string | null) {
  memoryOwner = id
  try {
    if (id === null) localStorage.removeItem(LOCAL_OWNER_KEY)
    else localStorage.setItem(LOCAL_OWNER_KEY, id)
    ownerStorageFailed = false
  } catch {
    ownerStorageFailed = true
  }
}
export function clearLocalOwner(): void {
  rotateSession()
  storeOwner(null)
  emit()
}
export function beginSignedInSession(id: string): void {
  rotateSession()
  storeOwner(id)
  emit()
}
export function establishLocalOwner(
  id: string,
  expectedSessionId: string,
): boolean {
  if (getCaptureSessionId() !== expectedSessionId) return false
  const before = getLocalOwnerId()
  if (before !== null && before !== id) rotateSession()
  storeOwner(id)
  emit()
  return true
}
export function captureIdentity() {
  return {
    ownerUserId: getLocalOwnerId(),
    captureSessionId: getCaptureSessionId(),
  }
}
export function isCurrentCaptureSession(session: string): boolean {
  return session === getCaptureSessionId()
}
export function canListCapture(item: {
  ownerUserId?: string | null
  captureSessionId?: string
  jobId: string | null
}): boolean {
  if (item.ownerUserId) return item.ownerUserId === getLocalOwnerId()
  // Every ownerless job recording, including an older tagged boundary, uses
  // that job's server ownership check. Never turn it into an unfiled capture.
  if (item.jobId !== null) return true
  return (
    !!item.captureSessionId && item.captureSessionId === getCaptureSessionId()
  )
}
export function canSyncCapture(item: {
  ownerUserId?: string | null
  captureSessionId?: string
  jobId: string | null
}): boolean {
  return item.ownerUserId
    ? item.ownerUserId === getLocalOwnerId()
    : item.jobId !== null
}
function onStorage(event: StorageEvent) {
  if (
    event.key !== LOCAL_OWNER_KEY &&
    event.key !== BOUNDARY_KEY &&
    event.key !== null
  )
    return
  ownerStorageFailed = false
  // The tab handling the auth transition already persisted the new boundary.
  // Observers adopt it, rather than rotating again or rotating on /me discovery.
  emit()
}
export function subscribeLocalOwner(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}
export function localOwnerSnapshot(): string {
  return `${getCaptureSessionId()}:${getLocalOwnerId() ?? ''}`
}
export function _resetLocalOwnerForTesting(): void {
  memorySession = null
  memoryOwner = null
  ownerStorageFailed = false
}
