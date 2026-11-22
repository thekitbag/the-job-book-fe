/** Local ownership is independent of selected jobs. A sign-in starts a new
 * capture session so a delayed identity lookup cannot claim earlier audio. */
export const LOCAL_OWNER_KEY = 'job-book-owner-user-id'
const SESSION_KEY = 'job-book-capture-session-id'
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
export function getCaptureSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) return stored
  } catch {
    /* Keep an in-memory identity if browser storage is unavailable. */
  }
  memorySession ??= crypto.randomUUID()
  try {
    sessionStorage.setItem(SESSION_KEY, memorySession)
  } catch {
    /* best effort */
  }
  return memorySession
}
function rotateSession() {
  memorySession = crypto.randomUUID()
  try {
    sessionStorage.setItem(SESSION_KEY, memorySession)
  } catch {
    /* best effort */
  }
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
  if (item.captureSessionId)
    return item.captureSessionId === getCaptureSessionId()
  // v1 records have no ownership metadata. Their job route remains the
  // authority; never reinterpret these records as new unfiled captures.
  return item.jobId !== null
}
export function canSyncCapture(item: {
  ownerUserId?: string | null
  captureSessionId?: string
  jobId: string | null
}): boolean {
  return item.ownerUserId
    ? item.ownerUserId === getLocalOwnerId()
    : !item.captureSessionId && item.jobId !== null
}
function onStorage(event: StorageEvent) {
  if (event.key !== LOCAL_OWNER_KEY && event.key !== null) return
  ownerStorageFailed = false
  rotateSession()
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
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* test/browser storage may be unavailable */
  }
}
