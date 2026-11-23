import { test, expect, type Page } from '@playwright/test'

// Explicit HTTP fixtures against the built, real-API frontend, never mock mode.
// This is contract/browser evidence, not a claim of a real-backend integration.
test.use({
  baseURL: 'https://localhost:5176',
  storageState: { cookies: [], origins: [] },
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--ignore-certificate-errors',
    ],
  },
  permissions: ['microphone'],
})
const JOB = {
  id: 'foundation-job',
  title: 'Garden Room',
  status: 'started',
  jobType: 'garden_room',
  roughLocationOrLabel: null,
  createdAt: '',
  updatedAt: '',
}
const USER = {
  id: 'builder-a',
  name: 'Mike',
  email: 'mike@example.test',
  role: 'PILOT',
}

async function fixture(
  page: Page,
  options: {
    hangJobs?: boolean
    failJobs?: boolean
    cached?: boolean
    owner?: string | null
    failMe?: boolean
  } = {},
) {
  const uploads: { url: string; body: string }[] = []
  await page.addInitScript(
    ({ job, cached, owner }) => {
      if (!sessionStorage.getItem('foundation-seeded')) {
        if (owner !== null)
          localStorage.setItem('job-book-owner-user-id', owner)
        if (cached)
          localStorage.setItem('job-book-cached-jobs', JSON.stringify([job]))
        sessionStorage.setItem('foundation-seeded', '1')
      }
    },
    {
      job: JOB,
      cached: options.cached ?? true,
      owner: options.owner === undefined ? USER.id : options.owner,
    },
  )
  // Context routes also cover requests sent by the service worker's client.
  await page.context().route('**/api/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    if (path === '/api/auth/me' && options.failMe)
      return route.abort('internetdisconnected')
    if ((path === '/api/jobs' || path === '/api/home') && options.hangJobs)
      return // intentionally unresolved until context closes
    if ((path === '/api/jobs' || path === '/api/home') && options.failJobs)
      return route.abort('internetdisconnected')
    if (
      (path === '/api/notes' || path.endsWith('/notes')) &&
      req.method() === 'POST'
    ) {
      uploads.push({ url: path, body: req.postDataBuffer()?.toString() ?? '' })
      if (path === '/api/notes') {
        const jobId = uploads[uploads.length - 1].body.includes('name="jobId"')
          ? JOB.id
          : null
        return route.fulfill({
          json: {
            note: {
              id: 'server-note-exact',
              clientNoteId: 'unused',
              jobId,
              filedAt: jobId ? 'now' : null,
              captureContext: 'home',
              serverStatus: 'UPLOADED',
            },
          },
        })
      }
      return route.fulfill({
        json: {
          noteId: 'server-note-exact',
          clientNoteId: 'unused',
          status: 'uploaded',
          isDuplicate: false,
        },
      })
    }
    if (path.endsWith('/draft'))
      return route.fulfill({
        json: {
          noteId: 'server-note-exact',
          jobId: JOB.id,
          state: 'ready',
          transcriptText: '',
          items: [],
          moreToCheckCount: 0,
        },
      })
    if (path.endsWith('/file') && req.method() === 'POST')
      return route.fulfill({
        json: {
          note: {
            id: 'server-note-exact',
            clientNoteId: 'unused',
            jobId: JOB.id,
            filedAt: 'now',
            captureContext: 'home',
            serverStatus: 'UPLOADED',
          },
        },
      })
    const body =
      path === '/api/home'
        ? {
            inProgressJobs: [
              {
                id: JOB.id,
                title: JOB.title,
                lastActivityAt: new Date().toISOString(),
                toCheckCount: 0,
              },
            ],
            otherJobs: { planningCount: 0, finishedCount: 0 },
            unfiledCount: 0,
            lastRecordedJobId: null,
            workshop: { availableCount: 0, preview: [] },
          }
        : path === '/api/unfiled'
          ? { notes: [], photos: [] }
          : path === '/api/auth/me'
            ? { user: USER }
            : path === '/api/jobs'
              ? [JOB]
              : path.endsWith('/memory-view')
                ? {
                    job: JOB,
                    generatedAt: '',
                    sections: [],
                    hours: { totalHours: '0', people: [], days: [] },
                    stillToCheck: { count: 0, items: [] },
                  }
                : path.endsWith('/review-queue')
                  ? {
                      jobId: JOB.id,
                      generatedAt: '',
                      sections: [],
                      alreadyRemembered: [],
                    }
                  : path.endsWith('/log')
                    ? { entries: [] }
                    : path === '/api/workshop'
                      ? {
                          generatedAt: '',
                          availableItems: [],
                          bookHome: {
                            showWorkshopRow: true,
                            availableCount: 0,
                            availableLabel: null,
                            previewItems: [],
                          },
                        }
                      : []
    await route.fulfill({ json: body })
  })
  return uploads
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('job-book')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    const rows = await new Promise<
      {
        clientNoteId: string
        jobId: string | null
        ownerUserId: string | null
        captureSessionId: string
        blob: Blob
        localState: string
        serverNoteId: string | null
      }[]
    >((resolve, reject) => {
      const r = db.transaction('notes').objectStore('notes').getAll()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    return Promise.all(
      rows.map(async (n) => ({
        id: n.clientNoteId,
        jobId: n.jobId,
        owner: n.ownerUserId,
        boundary: n.captureSessionId,
        state: n.localState,
        serverId: n.serverNoteId,
        size: n.blob.size,
        mime: n.blob.type,
        bytes: Array.from(new Uint8Array(await n.blob.arrayBuffer())),
      })),
    )
  })
}
async function record(page: Page, screenshot?: string) {
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByRole('button', { name: 'Stop recording' }),
  ).toBeVisible()
  if (screenshot) await page.screenshot({ path: screenshot })
  await page.waitForTimeout(350) // Allow MediaRecorder to produce actual audio bytes.
  await page.getByRole('button', { name: 'Stop recording' }).click()
}
async function noClipping(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}

test('offline recording survives an offline reload and uploads once from Book Home on reconnect', async ({
  page,
  context,
}) => {
  const uploads = await fixture(page)
  await page.goto('/')
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  await context.setOffline(true)
  await record(page)
  await expect
    .poll(async () => (await stored(page))[0]?.state)
    .toBe('saved_local')
  const [before] = await stored(page)
  expect(before.size).toBeGreaterThan(0)
  expect(before.mime).toMatch(/^audio\/webm/)
  expect(before.owner).toBe(USER.id)
  await page.reload()
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await expect(
    page.getByRole('button', { name: 'Start recording' }),
  ).toBeVisible()
  const [after] = await stored(page)
  expect(after).toEqual(before)
  await page.getByRole('button', { name: /the job book/i }).click()
  await context.setOffline(false)
  await expect.poll(async () => (await stored(page))[0]?.state).toBe('uploaded')
  expect(uploads).toHaveLength(1)
  expect(['/api/notes', `/api/jobs/${JOB.id}/notes`]).toContain(uploads[0].url)
  expect(uploads[0].body).toContain(before.id)
  const [uploaded] = await stored(page)
  expect(uploaded.serverId).toBe('server-note-exact')
  expect(uploaded.bytes).toEqual(before.bytes)
})

test('cached Record works while GET /api/jobs never resolves', async ({
  page,
}) => {
  await fixture(page, { hangJobs: true })
  await page.goto('/')
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await page.screenshot({
    path: 'docs/verification/capture-foundation/cached-job-390.png',
  })
  await record(page, 'docs/verification/capture-foundation/recording-390.png')
  await expect.poll(async () => (await stored(page))[0]?.state).toBe('uploaded')
})

test('offline without jobs still records locally without inventing a job or upload', async ({
  page,
}) => {
  const uploads = await fixture(page, { failJobs: true, cached: false })
  await page.goto('/')
  await record(page)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  const [note] = await stored(page)
  expect(note.jobId).toBeNull()
  expect(note.owner).toBe(USER.id)
  await expect.poll(async () => (await stored(page))[0]?.state).toBe('uploaded')
  expect(uploads).toHaveLength(1)
  await noClipping(page)
  await page.screenshot({
    path: 'docs/verification/capture-foundation/no-jobs-390.png',
  })
})

test('write failure holds audio in memory for an exact-byte retry after navigation', async ({
  page,
}) => {
  const uploads = await fixture(page)
  await page.goto('/')
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toBeVisible()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'notes' && value.blob) {
        IDBObjectStore.prototype.put = original
        // Read the held bytes independently of the retry result.
        ;(
          window as unknown as {
            failedAudio: Promise<{ id: string; bytes: number[] }>
          }
        ).failedAudio = value.blob
          .arrayBuffer()
          .then((buffer: ArrayBuffer) => ({
            id: value.clientNoteId,
            bytes: Array.from(new Uint8Array(buffer)),
          }))
        throw new DOMException('Full', 'QuotaExceededError')
      }
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key)
    }
  })
  await record(page)
  await expect(page.getByRole('alert')).toContainText('wasn’t saved')
  expect(uploads).toHaveLength(0)
  expect(await stored(page)).toHaveLength(0)
  await page.setViewportSize({ width: 320, height: 740 })
  await noClipping(page)
  await page.screenshot({
    path: 'docs/verification/capture-foundation/save-failed-320.png',
  })
  await page.getByRole('button', { name: /the job book/i }).click()
  await page.getByRole('button', { name: 'Try saving again' }).click()
  await expect.poll(async () => (await stored(page))[0]?.state).toBe('uploaded')
  const before = await page.evaluate(
    () =>
      (
        window as unknown as {
          failedAudio: Promise<{ id: string; bytes: number[] }>
        }
      ).failedAudio,
  )
  const [after] = await stored(page)
  expect(after.id).toBe(before.id)
  expect(after.bytes).toEqual(before.bytes)
  expect(uploads).toHaveLength(1)
})

test('old v1 tab blocks upgrade visibly; close and retry preserves existing audio', async ({
  page,
  context,
}) => {
  await fixture(page)
  const old = await context.newPage()
  await old.goto('/favicon.svg')
  await old.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('job-book', 1)
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('notes', {
          keyPath: 'clientNoteId',
        })
        s.createIndex('by-jobId', 'jobId')
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    ;(window as unknown as { oldDb: IDBDatabase }).oldDb = db
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite')
      tx.objectStore('notes').put({
        clientNoteId: 'legacy',
        jobId: 'old-job',
        blob: new Blob(['legacy audio']),
        localState: 'upload_needs_attention',
        capturedAt: '2026-01-01',
        mimeType: 'audio/webm',
        sizeBytes: 12,
        uploadAttemptCount: 5,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toBeVisible()
  await record(page)
  await expect(page.getByRole('alert')).toContainText(
    'Close other open Job Book pages',
  )
  await old.close()
  await page.getByRole('button', { name: 'Try saving again' }).click()
  await expect
    .poll(async () => (await stored(page)).some((n) => n.state === 'uploaded'))
    .toBe(true)
  const legacy = (await stored(page)).find((n) => n.id === 'legacy')!
  expect(legacy.state).toBe('upload_needs_attention')
  expect(Buffer.from(legacy.bytes).toString()).toBe('legacy audio')
})

test('unknown-owner job recording is stamped, listed and uploaded after closing and reopening a new page', async ({
  page,
  context,
}) => {
  const options = { cached: false, owner: null, failMe: true }
  const uploads = await fixture(page, options)
  const meFailed = page.waitForEvent(
    'requestfailed',
    (request) => new URL(request.url()).pathname === '/api/auth/me',
  )
  await page.goto('/')
  await meFailed
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('job-book-owner-user-id')),
  ).toBeNull()
  await context.setOffline(true)
  await record(page)
  await expect
    .poll(async () => (await stored(page))[0]?.state)
    .toBe('saved_local')
  const [before] = await stored(page)
  expect(before.owner).toBeNull()
  expect(before.jobId).toBe(JOB.id)
  expect(uploads).toHaveLength(0)
  await page.close()
  options.failMe = false
  await context.setOffline(false)
  const reopened = await context.newPage()
  await reopened.goto('https://localhost:5176/')
  expect(
    await reopened.evaluate(() => sessionStorage.getItem('foundation-seeded')),
  ).toBeNull()
  await expect
    .poll(async () => (await stored(reopened))[0]?.owner)
    .toBe(USER.id)
  await expect
    .poll(async () => (await stored(reopened))[0]?.state)
    .toBe('uploaded')
  const [after] = await stored(reopened)
  expect(after.boundary).toBe(before.boundary)
  expect(after.id).toBe(before.id)
  expect(after.bytes).toEqual(before.bytes)
  expect(uploads).toHaveLength(1)
  expect(['/api/notes', `/api/jobs/${JOB.id}/notes`]).toContain(uploads[0].url)
  await reopened.getByRole('button', { name: /^Garden Room/ }).click()
  await reopened.getByRole('button', { name: 'Open Job log' }).click()
  await expect(
    reopened
      .getByRole('list', { name: 'Job log' })
      .getByText('Voice note saved'),
  ).toBeVisible()
})

test('another account signing in after a new-page launch cannot claim an ownerless unfiled recording', async ({
  page,
  context,
}) => {
  const uploads = await fixture(page, {
    cached: false,
    owner: null,
    failMe: true,
    hangJobs: true,
  })
  const meFailed = page.waitForEvent(
    'requestfailed',
    (request) => new URL(request.url()).pathname === '/api/auth/me',
  )
  await page.goto('/')
  await meFailed
  await record(page)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  const [before] = await stored(page)
  expect(before.owner).toBeNull()
  expect(before.jobId).toBeNull()
  await page.close()
  const otherUser = {
    ...USER,
    id: 'builder-b',
    name: 'Dave',
    email: 'dave@example.test',
  }
  let signedIn = false
  await context.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      json: signedIn ? { user: otherUser } : { code: 'UNAUTHORIZED' },
    }),
  )
  await context.route('**/api/auth/login', (route) => {
    signedIn = true
    return route.fulfill({ json: { user: otherUser } })
  })
  await context.route('**/api/jobs', (route) => route.fulfill({ json: [] }))
  const reopened = await context.newPage()
  await reopened.goto('https://localhost:5176/')
  await reopened.getByLabel('Email', { exact: true }).fill(otherUser.email)
  await reopened
    .getByLabel('Password', { exact: true })
    .fill('example-password')
  await reopened.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect
    .poll(() =>
      reopened.evaluate(() => localStorage.getItem('job-book-owner-user-id')),
    )
    .toBe(otherUser.id)
  await expect(
    reopened.getByRole('heading', { name: 'The Job Book' }),
  ).toBeVisible()
  const [after] = await stored(reopened)
  expect(after).toEqual(before)
  expect(uploads).toHaveLength(0)
  await expect(
    reopened.getByRole('heading', { name: 'Unmatched recordings' }),
  ).toBeVisible()
  await expect(
    reopened.getByRole('button', { name: 'This is mine' }),
  ).toBeVisible()
  await expect(reopened.locator('audio')).toHaveCount(0)
  await expect(reopened.getByText('Saved — not filed yet')).toHaveCount(0)
})

test('uncached pending jobs stay unknown while Record remains usable', async ({
  page,
}) => {
  await fixture(page, { cached: false, hangJobs: true })
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Start recording' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'All jobs' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New job' })).toHaveCount(0)
  await record(page)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await noClipping(page)
  await page.screenshot({
    path: 'docs/verification/capture-foundation/jobs-loading-390.png',
  })
})

test('offline Home capture survives closing the page before choosing a job and files later', async ({
  page,
  context,
}) => {
  const uploads = await fixture(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Garden Room/ })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  await context.setOffline(true)
  await record(page)
  await expect(page.getByRole('dialog', { name: 'Which job?' })).toBeVisible()
  const [before] = await stored(page)
  expect(before.jobId).toBeNull()
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('https://localhost:5176/')
  await expect(
    reopened.getByRole('heading', { name: 'The Job Book' }),
  ).toBeVisible()
  await reopened.getByRole('button', { name: /Not filed yet/ }).click()
  expect((await stored(reopened))[0]).toEqual(before)
  await expect(
    reopened.getByText('Saved on this phone', { exact: true }),
  ).toBeVisible()
  await context.setOffline(false)
  await expect
    .poll(async () => (await stored(reopened))[0]?.state)
    .toBe('uploaded')
  expect(uploads).toHaveLength(1)
  await reopened.getByRole('button', { name: 'Choose job' }).click()
  await reopened
    .getByRole('dialog', { name: 'Which job?' })
    .getByRole('button', { name: 'Garden Room', exact: true })
    .click()
  await expect(
    reopened.getByText('Saved to Garden Room', { exact: true }),
  ).toBeVisible()
})

test('choosing a job while the unfiled upload is in flight files the exact returned server id', async ({
  page,
  context,
}) => {
  await fixture(page)
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  let started!: () => void
  const began = new Promise<void>((r) => {
    started = r
  })
  const filed: string[] = []
  await context.route('**/api/notes', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    started()
    await gate
    await route.fulfill({
      json: {
        note: {
          id: 'racing-server-id',
          clientNoteId: 'unused',
          jobId: null,
          filedAt: null,
          captureContext: 'home',
          serverStatus: 'UPLOADED',
        },
      },
    })
  })
  await context.route('**/api/notes/*/file', async (route) => {
    filed.push(new URL(route.request().url()).pathname)
    await route.fulfill({
      json: {
        note: {
          id: 'racing-server-id',
          clientNoteId: 'unused',
          jobId: JOB.id,
          filedAt: 'now',
          captureContext: 'home',
          serverStatus: 'UPLOADED',
        },
      },
    })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Garden Room/ })).toBeVisible()
  await record(page)
  await began
  await page
    .getByRole('dialog', { name: 'Which job?' })
    .getByRole('button', { name: 'Garden Room', exact: true })
    .click()
  await expect.poll(async () => (await stored(page))[0]?.jobId).toBe(JOB.id)
  release()
  await expect.poll(async () => (await stored(page))[0]?.state).toBe('uploaded')
  expect((await stored(page))[0].serverId).toBe('racing-server-id')
  expect(filed).toEqual(['/api/notes/racing-server-id/file'])
})
