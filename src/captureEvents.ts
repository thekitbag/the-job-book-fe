import { useSyncExternalStore } from 'react'
let revision = 0
const listeners = new Set<() => void>()
export function announceCaptureChange() {
  revision++
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function useCaptureUpdates() {
  return useSyncExternalStore(subscribe, () => revision)
}
