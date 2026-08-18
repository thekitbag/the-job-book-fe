export function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Backend-shaped money and date labels (mock only) ────────────────────────
// Cross-job Money and supplier settlement send labels, not just amounts, so the
// figure on Book Home and the figure in a receipt are provably the same string.
// These helpers are the mock's stand-in for that server-side formatting; no
// component may use them.

/** "£3,868" / "£12.50" — thousands separated, pennies only when there are any. */
export function mockMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return `£${rounded.toLocaleString('en-GB', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

/** The decimal-string form the API carries amounts in. */
export function mockAmountString(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}

/** "21 Jun" — a recorded cost's date. */
export function mockDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

/** "Mon 10 Aug" — a payment date, which Mike thinks of by the day of the week. */
export function mockDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(iso))
}

/** Date-only values land on UK local noon, so a payment never drifts a day. */
export function mockNoonISO(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00.000Z`
  return new Date(value).toISOString()
}
