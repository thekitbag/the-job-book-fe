import posthog from 'posthog-js'
import type { AuthUser } from './types'

/**
 * Central product-analytics wrapper (PostHog). Every component goes through
 * this module — never import posthog-js directly elsewhere. That keeps the
 * privacy guard in one place, lets analytics no-op cleanly when unconfigured,
 * and keeps a future migration away from PostHog cheap.
 *
 * Privacy position (see tech spec posthog-product-analytics-spec.md): The Job
 * Book holds commercially sensitive job content. Only explicit custom events
 * with safe enum/boolean/bucket properties are sent. Autocapture, pageviews,
 * session recording, heatmaps, console capture, and dead clicks are all off.
 */

let initialized = false

// Query strings can carry secrets (the password-reset link is `/?token=…`),
// so no URL-valued property ever keeps one. Exported for tests.
export function stripUrlQueryStrings(properties: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && /url|referrer|href/i.test(key) && (value.includes('?') || value.includes('#'))) {
      properties[key] = value.split(/[?#]/)[0]
    }
  }
  return properties
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN && import.meta.env.VITE_POSTHOG_HOST)
}

export function initAnalytics(): boolean {
  if (initialized) return true
  if (!isAnalyticsConfigured()) return false
  posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string, {
    api_host: import.meta.env.VITE_POSTHOG_HOST as string,
    defaults: '2026-05-30',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    disable_session_recording: true,
    enable_heatmaps: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    logs: { captureConsoleLogs: false },
    // PostHog auto-attaches $current_url/$referrer to every event. The
    // password-reset flow carries `?token=<reset token>` in the URL, so query
    // strings are stripped from every URL-shaped auto property before send.
    sanitize_properties: stripUrlQueryStrings,
  })
  initialized = true
  return true
}

/** The initialized client, for PostHogProvider at the app root. Null when unconfigured. */
export function analyticsClient() {
  return initialized ? posthog : null
}

// Key-based blocklist: any property whose name suggests free text, identity,
// content, or secrets is dropped before capture. Deny-by-pattern rather than
// an allowlist so a future event with a mistyped property fails closed for
// the risky names we know about.
const BLOCKED_KEY_PATTERN =
  /email|name|title|summary|transcript|descriptor|material|supplier|person|task|storage|token|password|secret|label|location|address|customer|text|url|file|phone/i

// Values must be short primitives — enums, booleans, buckets, opaque ids.
// Anything string-shaped that could be free text (long, or email-like) is
// dropped even if its key looks safe.
const MAX_STRING_VALUE_LENGTH = 64

function isSafeValue(value: unknown): value is string | number | boolean | null {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return true
  if (typeof value !== 'string') return false
  return value.length <= MAX_STRING_VALUE_LENGTH && !value.includes('@')
}

export function sanitizeProperties(properties?: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {}
  if (!properties) return safe
  for (const [key, value] of Object.entries(properties)) {
    if (BLOCKED_KEY_PATTERN.test(key)) continue
    if (!isSafeValue(value)) continue
    safe[key] = value
  }
  return safe
}

export function track(eventName: string, properties?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.capture(eventName, sanitizeProperties(properties))
}

// Identify by opaque user id and role only — never email or display name.
// The property set is hard-coded here so a caller cannot widen it.
export function identifyAnalyticsUser(user: Pick<AuthUser, 'id' | 'role'>): void {
  if (!initialized) return
  posthog.identify(user.id, { role: user.role })
}

export function resetAnalyticsUser(): void {
  if (!initialized) return
  posthog.reset()
}

// ── Bucket helpers ───────────────────────────────────────────────────────────
// Raw durations/sizes are fine, but buckets are what the spec asks for and
// they keep payloads boring.

export function durationBucket(ms: number): '<30s' | '30-120s' | '2-5m' | '5m+' {
  if (ms < 30_000) return '<30s'
  if (ms < 120_000) return '30-120s'
  if (ms < 300_000) return '2-5m'
  return '5m+'
}

export function sizeBucket(bytes: number): '<100KB' | '100KB-1MB' | '1-5MB' | '5MB+' {
  if (bytes < 100_000) return '<100KB'
  if (bytes < 1_000_000) return '100KB-1MB'
  if (bytes < 5_000_000) return '1-5MB'
  return '5MB+'
}

/** "audio/webm;codecs=opus" → "audio/webm" — never a file name. */
export function mimeTypeFamily(mimeType: string): string {
  return mimeType.split(';')[0].trim()
}

/** Upload failures carry backend error codes; anything that isn't a plain
 *  CODE_LIKE_THIS token could be a free-text message, so collapse it. */
export function safeErrorKind(code: string | null | undefined): string {
  if (code && /^[A-Z0-9_]{1,40}$/.test(code)) return code
  return 'UNKNOWN'
}

/** Test-only: clears module init state so env-var gating can be re-exercised. */
export function _resetAnalyticsForTests(): void {
  initialized = false
}
