import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { _resetDbForTesting } from '../db'
import { _resetLocalOwnerForTesting } from '../localOwner'

// Under CPU load (parallel workers, CI) async UI work can take over the 1 s
// default. Waiting longer only slows a failing test; passing tests finish early.
configure({ asyncUtilTimeout: 5000 })

// happy-dom's localStorage isn't fully initialised in all environments.
// Replace it with a plain in-memory implementation for reliability.
const _store: Record<string, string> = {}
const localStorageMock: Storage = {
  getItem:    (k)    => _store[k] ?? null,
  setItem:    (k, v) => { _store[k] = String(v) },
  removeItem: (k)    => { delete _store[k] },
  clear:      ()     => { for (const k in _store) delete _store[k] },
  key:        (i)    => Object.keys(_store)[i] ?? null,
  get length()       { return Object.keys(_store).length },
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true })

beforeEach(async () => {
  // Fresh IndexedDB for each test; other IDB globals stay from the auto-import above
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).indexedDB = new IDBFactory()
  _resetDbForTesting()
  localStorageMock.clear()
  _resetLocalOwnerForTesting()
  const { _resetCapturePersistenceForTesting } = await import('../capturePersistence')
  _resetCapturePersistenceForTesting()
  // Reset mock call history AND implementations so each test starts with a clean slate
  vi.resetAllMocks()
})

afterEach(() => {
  cleanup()
})
