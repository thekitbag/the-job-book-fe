// Safe href construction for job contacts. The saved value is what Mike sees;
// these functions only build the link target, and never carry anything else
// (note, site address) into a URL.

/**
 * `tel:` target for a saved phone number. The display keeps Mike's formatting
 * ("07700 900 118"); the dialler wants it without spaces and punctuation, so
 * only digits and a leading + survive. Returns null when there is nothing
 * dialable, so the UI can show plain text instead of a dead link.
 */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const plus = phone.trim().startsWith('+')
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `tel:${plus ? '+' : ''}${digits}`
}

/**
 * `mailto:` target for a saved email address. Encoded, so an address with
 * unusual characters can't break out of the URL; no subject or body is added —
 * tapping opens a blank compose window and nothing is ever sent automatically.
 */
export function mailtoHref(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.trim()
  if (!trimmed || !trimmed.includes('@')) return null
  return `mailto:${encodeURIComponent(trimmed)}`
}
