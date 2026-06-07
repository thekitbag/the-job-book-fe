import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { _resetDbForTesting } from '../db'

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

beforeEach(() => {
  // Fresh IndexedDB for each test; other IDB globals stay from the auto-import above
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).indexedDB = new IDBFactory()
  _resetDbForTesting()
  localStorageMock.clear()
  // Reset mock call history AND implementations so each test starts with a clean slate
  vi.resetAllMocks()
})

afterEach(() => {
  cleanup()
})
