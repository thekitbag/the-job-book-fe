import { mockDateLabel } from './util'

// One source of truth for when each source cost actually happened (mock only).
//
// A purchase date is display evidence, not money: it is read at read time from
// the source memory item, never snapshotted onto a payment. The real backend
// resolves it live for exactly that reason — a payment covers a set of costs,
// and correcting when one of those costs happened must show up on the receipt
// without touching what the payment covered or what it came to.
//
// This registry mirrors that. The supplier account list and any payment receipt
// both read through it, so the two can never drift into stating different dates
// for the same purchase, and a corrected date lands on both at the next read.
//
// It lives in its own module because both readers need it and neither may
// import the other: `bookMoney` already imports the payment store.

/**
 * "Date not recorded" — said in words rather than left blank, and never filled
 * in from the payment date, the upload date or today. A purchase whose date
 * nobody wrote down is a different thing from one that happened when the
 * payment did.
 */
export const NO_SOURCE_DATE_LABEL = 'Date not recorded'

/** "7 Jul", or the missing-date wording. The one place that choice is made. */
export function mockSourceDateLabel(iso: string | null): string {
  return iso ? mockDateLabel(iso) : NO_SOURCE_DATE_LABEL
}

let dates: Map<string, string | null> | null = null

function store(): Map<string, string | null> {
  if (!dates) dates = new Map()
  return dates
}

/** Seed a source cost's purchase date. Existing entries win, so a correction
 *  made during a test is not undone by the next read re-seeding the fixture. */
export function seedMockSourceDate(sourceMemoryItemId: string, iso: string | null): void {
  const map = store()
  if (!map.has(sourceMemoryItemId)) map.set(sourceMemoryItemId, iso)
}

/** The purchase date, or null when the source cost has no trusted one. */
export function mockSourceDate(sourceMemoryItemId: string): string | null {
  return store().get(sourceMemoryItemId) ?? null
}

/** Whether this source cost is known at all — distinguishes "no date recorded"
 *  from "this id was never seeded", which matters when a receipt outlives the
 *  account line it was built from. */
export function hasMockSourceDate(sourceMemoryItemId: string): boolean {
  return store().has(sourceMemoryItemId)
}

/**
 * Correct a source cost's purchase date, the way fixing the date on the source
 * item does. Deliberately the only mutator: nothing here can reach an amount,
 * an allocation, a paid state or a Budget figure.
 */
export function _setMockSourceDateForTesting(sourceMemoryItemId: string, iso: string | null): void {
  store().set(sourceMemoryItemId, iso)
}

export function _resetMockSourceDatesForTesting(): void {
  dates = null
}
