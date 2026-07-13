import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import posthog from 'posthog-js'
import {
  _resetAnalyticsForTests,
  analyticsClient,
  stripUrlQueryStrings,
  durationBucket,
  identifyAnalyticsUser,
  initAnalytics,
  isAnalyticsConfigured,
  mimeTypeFamily,
  resetAnalyticsUser,
  safeErrorKind,
  sanitizeProperties,
  sizeBucket,
  track,
} from '../analytics'

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}))

const TOKEN_VAR = 'VITE_POSTHOG_PROJECT_TOKEN'
const HOST_VAR = 'VITE_POSTHOG_HOST'

function configureEnv() {
  vi.stubEnv(TOKEN_VAR, 'phc_test_token')
  vi.stubEnv(HOST_VAR, 'https://eu.i.posthog.com')
}

beforeEach(() => {
  _resetAnalyticsForTests()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('analytics init gating', () => {
  it('is not configured and does not init when env vars are missing', () => {
    vi.stubEnv(TOKEN_VAR, '')
    vi.stubEnv(HOST_VAR, '')
    expect(isAnalyticsConfigured()).toBe(false)
    expect(initAnalytics()).toBe(false)
    expect(posthog.init).not.toHaveBeenCalled()
    expect(analyticsClient()).toBeNull()
  })

  it('does not init with only the token and no host', () => {
    vi.stubEnv(TOKEN_VAR, 'phc_test_token')
    vi.stubEnv(HOST_VAR, '')
    expect(initAnalytics()).toBe(false)
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it('inits exactly once with conservative privacy config when configured', () => {
    configureEnv()
    expect(initAnalytics()).toBe(true)
    expect(initAnalytics()).toBe(true)
    expect(posthog.init).toHaveBeenCalledTimes(1)
    const [token, config] = vi.mocked(posthog.init).mock.calls[0]
    expect(token).toBe('phc_test_token')
    expect(config).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      disable_session_recording: true,
      enable_heatmaps: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      logs: { captureConsoleLogs: false },
    })
    // URL auto-properties are sanitized so the reset-token query string never leaves the app
    expect((config as { sanitize_properties?: unknown }).sanitize_properties).toBe(stripUrlQueryStrings)
  })

  it('stripUrlQueryStrings removes the reset token from URL-shaped auto properties', () => {
    const out = stripUrlQueryStrings({
      $current_url: 'https://app.thejobbook.example/?token=rt_super_secret_123',
      $referrer: 'https://mail.example/inbox?msg=42#frag',
      $pathname: '/',
      job_id: 'j1',
    })
    expect(out.$current_url).toBe('https://app.thejobbook.example/')
    expect(out.$referrer).toBe('https://mail.example/inbox')
    expect(out.job_id).toBe('j1')
    expect(JSON.stringify(out)).not.toContain('rt_super_secret_123')
  })

  it('track/identify/reset all no-op before init', () => {
    track('job_created', { job_id: 'j1' })
    identifyAnalyticsUser({ id: 'u1', role: 'PILOT' })
    resetAnalyticsUser()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.reset).not.toHaveBeenCalled()
  })
})

describe('identify and reset', () => {
  beforeEach(() => {
    configureEnv()
    initAnalytics()
  })

  it('identifies with user id and role only — never email or name', () => {
    identifyAnalyticsUser({ id: 'user-123', role: 'PILOT' })
    expect(posthog.identify).toHaveBeenCalledWith('user-123', { role: 'PILOT' })
    const props = vi.mocked(posthog.identify).mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(props)).toEqual(['role'])
  })

  it('identify ignores extra fields on the user object', () => {
    const user = { id: 'user-123', role: 'INTERNAL', email: 'mike@example.com', name: 'Mike' }
    identifyAnalyticsUser(user as never)
    const props = vi.mocked(posthog.identify).mock.calls[0][1] as Record<string, unknown>
    expect(props).toEqual({ role: 'INTERNAL' })
  })

  it('reset calls posthog.reset', () => {
    resetAnalyticsUser()
    expect(posthog.reset).toHaveBeenCalledTimes(1)
  })
})

describe('track sanitization', () => {
  beforeEach(() => {
    configureEnv()
    initAnalytics()
  })

  it('captures safe enum/boolean/bucket/id properties untouched', () => {
    track('review_decision_submitted', {
      job_id: 'job-uuid-1',
      section_key: 'ordered_materials',
      action: 'confirm',
      memory_type: 'ordered_material',
      has_correction: false,
    })
    expect(posthog.capture).toHaveBeenCalledWith('review_decision_submitted', {
      job_id: 'job-uuid-1',
      section_key: 'ordered_materials',
      action: 'confirm',
      memory_type: 'ordered_material',
      has_correction: false,
    })
  })

  it('strips known-dangerous property keys', () => {
    track('job_created', {
      job_id: 'j1',
      email: 'mike@example.com',
      name: 'Mike',
      title: 'Garden Room',
      summary: 'Kurt worked 6 hours',
      transcript: 'ordered 40 sheets',
      descriptor: 'Jewson receipt',
      materialName: 'plasterboard',
      supplierName: 'Jewson',
      personName: 'Kurt',
      taskName: 'Footings',
      storageKey: 's3://bucket/key',
      token: 'abc123',
      password: 'hunter2',
      fileName: 'IMG_1234.jpg',
      imageUrl: 'https://cdn/x.jpg',
      roughLocationOrLabel: 'Mrs Patel - back garden',
      customerName: 'Mrs Patel',
    })
    expect(posthog.capture).toHaveBeenCalledWith('job_created', { job_id: 'j1' })
  })

  it('drops non-primitive values and long or email-like strings even under safe keys', () => {
    track('note_upload_failed', {
      job_id: 'j1',
      error_kind: 'HTTP_500',
      detail: { nested: 'object' },
      items: ['a'],
      long_kind: 'x'.repeat(65),
      contact_kind: 'someone@example.com',
    })
    expect(posthog.capture).toHaveBeenCalledWith('note_upload_failed', {
      job_id: 'j1',
      error_kind: 'HTTP_500',
    })
  })

  it('never sends a payload containing sensitive builder content', () => {
    track('memory_edit_saved', {
      job_id: 'j1',
      memory_type: 'labour',
      summary: '6 hours on footings with Kurt',
      labourPersonName: 'Kurt',
      labourTaskName: 'Footings',
    })
    const sent = JSON.stringify(vi.mocked(posthog.capture).mock.calls)
    expect(sent).not.toMatch(/Kurt|Footings|6 hours/)
  })
})

describe('sanitizeProperties directly', () => {
  it('returns an empty object for undefined input', () => {
    expect(sanitizeProperties()).toEqual({})
  })

  it('keeps null, numbers, and booleans', () => {
    expect(sanitizeProperties({ a: null, b: 3, c: true })).toEqual({ a: null, b: 3, c: true })
  })
})

describe('bucket helpers', () => {
  it('durationBucket matches the spec buckets', () => {
    expect(durationBucket(5_000)).toBe('<30s')
    expect(durationBucket(29_999)).toBe('<30s')
    expect(durationBucket(30_000)).toBe('30-120s')
    expect(durationBucket(119_999)).toBe('30-120s')
    expect(durationBucket(120_000)).toBe('2-5m')
    expect(durationBucket(299_999)).toBe('2-5m')
    expect(durationBucket(300_000)).toBe('5m+')
  })

  it('sizeBucket buckets bytes', () => {
    expect(sizeBucket(50_000)).toBe('<100KB')
    expect(sizeBucket(500_000)).toBe('100KB-1MB')
    expect(sizeBucket(2_000_000)).toBe('1-5MB')
    expect(sizeBucket(10_000_000)).toBe('5MB+')
  })

  it('mimeTypeFamily strips codec details and never includes a file name', () => {
    expect(mimeTypeFamily('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(mimeTypeFamily('image/jpeg')).toBe('image/jpeg')
  })

  it('safeErrorKind passes CODE_LIKE tokens and collapses free text', () => {
    expect(safeErrorKind('HTTP_500')).toBe('HTTP_500')
    expect(safeErrorKind('UPLOAD_FAILED')).toBe('UPLOAD_FAILED')
    expect(safeErrorKind('Failed to fetch: https://api/x?token=abc')).toBe('UNKNOWN')
    expect(safeErrorKind(null)).toBe('UNKNOWN')
    expect(safeErrorKind(undefined)).toBe('UNKNOWN')
  })
})
