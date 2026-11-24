import { test, expect, type Page } from '@playwright/test'
// No API routes are intercepted: all app requests go to release/job-memory.
const shot = (name: string) =>
  'docs/verification/record-from-home/' + name + '.png'
async function languageGuard(page: Page) {
  const copy = await page.locator('body').evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll('[data-builder-note],script,style')
      .forEach((n) => n.remove())
    return clone.textContent ?? ''
  })
  expect(copy).not.toMatch(
    /\b(budget|spend|cost|paid|to pay|money in|money out|account|settlement|allowance|category|rate)\b|£/i,
  )
}
async function takeShot(
  page: Page,
  options: Parameters<Page['screenshot']>[0],
) {
  await languageGuard(page)
  await page.screenshot(options)
}
async function signup(page: Page, navigate = true) {
  if (navigate) await page.goto('/')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await page
    .getByLabel('Email', { exact: true })
    .fill(
      `ui-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    )
  await page
    .getByLabel('Password', { exact: true })
    .fill('a-strong-test-password')
  const name = page.getByLabel(/name/i)
  if (await name.count()) await name.fill('Mike')
  await page
    .getByRole('form', { name: 'Sign up', exact: true })
    .getByRole('button', { name: 'Sign up', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'The Job Book' }),
  ).toBeVisible()
}
async function addJob(page: Page, title: string) {
  await page.getByRole('button', { name: 'New job', exact: true }).click()
  await page.getByLabel('Job name', { exact: true }).fill(title)
  await page.getByRole('button', { name: 'Add job', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: /the job book/i }).click()
  await expect(
    page.getByRole('button', { name: new RegExp('^' + title + '\\s') }),
  ).toBeVisible()
}
async function record(page: Page) {
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByRole('button', { name: 'Stop recording' }),
  ).toBeVisible()
  await expect(page.locator('.capture-recording-destination')).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  )
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: 'Stop recording' }).click()
}
async function file(page: Page, title: string) {
  const picker = page.getByRole('dialog', { name: 'Which job?' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: title, exact: true }).click()
}
async function home(page: Page) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.count()) await back.click()
  const book = page.getByRole('button', { name: /the job book/i })
  if (await book.count()) await book.click()
}
async function notes(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r, j) => {
      const q = indexedDB.open('job-book')
      q.onsuccess = () => r(q.result)
      q.onerror = () => j(q.error)
    })
    const all = await new Promise<
      {
        clientNoteId: string
        serverNoteId: string | null
        jobId: string | null
        localState: string
        ownerUserId: string | null
        blob: Blob
      }[]
    >((r, j) => {
      const q = db.transaction('notes').objectStore('notes').getAll()
      q.onsuccess = () => r(q.result)
      q.onerror = () => j(q.error)
    })
    db.close()
    return all.map((n) => ({
      id: n.clientNoteId,
      serverId: n.serverNoteId,
      job: n.jobId,
      state: n.localState,
      owner: n.ownerUserId,
      size: n.blob.size,
    }))
  })
}
async function width(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}

test('real UI: Home capture, draft values/uncertainty/more checks, Looks right and refreshed Hours', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Garden Room')
  await takeShot(page, { animations: 'disabled', path: shot('home-empty') })
  await page.request.post('/__test/scenario', { data: { scenario: 'more' } })
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByRole('button', { name: 'Stop recording' }),
  ).toBeVisible()
  await expect(page.locator('.capture-recording-destination')).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  )
  await takeShot(page, { animations: 'disabled', path: shot('recording') })
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(page.getByRole('dialog', { name: 'Which job?' })).toBeVisible()
  await expect(
    page
      .getByRole('dialog', { name: 'Which job?' })
      .getByRole('button', { name: 'Garden Room', exact: true }),
  ).toBeVisible()
  await takeShot(page, { animations: 'disabled', path: shot('picker') })
  await file(page, 'Garden Room')
  await expect(
    page.getByText('Saved to Garden Room', { exact: true }),
  ).toBeVisible()
  await takeShot(page, { animations: 'disabled', path: shot('saved-to-job') })
  const draft = page.getByRole('dialog', { name: "Here's what I got" })
  await expect(draft).toBeVisible()
  await expect(draft.getByText('Not certain — please check')).toBeVisible()
  await expect(draft.getByText(/1 more thing/)).toBeVisible()
  await takeShot(page, {
    animations: 'disabled',
    path: shot('heres-what-i-got'),
  })
  const request = page.waitForRequest((r) => r.url().endsWith('/looks-right'))
  await draft.getByRole('button', { name: 'Looks right' }).click()
  expect((await request).postDataJSON().queueItemIds).toHaveLength(2)
  await expect(draft).toHaveCount(0)
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '2h logged',
  )
  await expect(
    page.getByRole('button', { name: /1 thing to check/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open Materials' }).click()
  await expect(page.getByText('OSB', { exact: true })).toBeVisible()
})

test('real UI: Later, file from Not filed yet, and New job from the picker', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'First job')
  await record(page)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/unfiled')
      return (await response.json()).notes[0]?.transcriptStatus
    })
    .toBe('completed')
  await takeShot(page, { animations: 'disabled', path: shot('home-unfiled') })
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await expect(page.getByRole('button', { name: 'Choose job' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Show transcript' }),
  ).toBeVisible()
  await takeShot(page, { animations: 'disabled', path: shot('not-filed-yet') })
  await page.getByRole('button', { name: 'Choose job' }).click()
  await file(page, 'First job')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: '‹ Home' }).click()
  await record(page)
  await page
    .getByRole('dialog', { name: 'Which job?' })
    .getByRole('button', { name: 'New job', exact: true })
    .click()
  await page.getByLabel('Job name', { exact: true }).fill('New from recording')
  await page.getByRole('button', { name: 'Add job', exact: true }).click()
  await expect(
    page.getByText('Saved to New from recording', { exact: true }),
  ).toBeVisible()
})

test('real UI: Fix drops one shown item and confirms only the rest', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Fix job')
  await record(page)
  await file(page, 'Fix job')
  const draft = page.getByRole('dialog', { name: "Here's what I got" })
  await draft.getByRole('button', { name: 'Fix', exact: true }).click()
  await takeShot(page, { animations: 'disabled', path: shot('fix') })
  await page.getByRole('button', { name: 'Drop OSB' }).click()
  await expect(page.getByText('Bought · OSB', { exact: true })).toHaveCount(0)
  const request = page.waitForRequest((r) => r.url().endsWith('/looks-right'))
  await page.getByRole('button', { name: 'Looks right', exact: true }).click()
  expect((await request).postDataJSON().queueItemIds).toHaveLength(1)
  await page.getByRole('button', { name: /^Fix job/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '2h logged',
  )
})

test('real UI: a changed draft confirms nothing, refreshes, and needs a new tap', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Changed job')
  await record(page)
  await file(page, 'Changed job')
  await expect(
    page.getByRole('dialog', { name: "Here's what I got" }),
  ).toBeVisible()
  const note = (await notes(page))[0]
  const response = await page.request.post('/__test/group/' + note.serverId)
  expect(response.ok()).toBe(true)
  await page.getByRole('button', { name: 'Looks right', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Nothing was confirmed')
  await expect(page.getByText('Bought · OSB', { exact: true })).toHaveCount(0)
  const memory = await page.request.get(
    '/api/jobs/' + note.job + '/memory-view',
  )
  expect((await memory.json()).hours.totalHours).toBe('0')
  await page.getByRole('button', { name: 'Looks right', exact: true }).click()
  await page.getByRole('button', { name: /^Changed job/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '2h logged',
  )
})

test('real UI: silent recording settles without an empty confirmation sheet', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Silent job')
  await page.request.post('/__test/scenario', { data: { scenario: 'silent' } })
  await record(page)
  await file(page, 'Silent job')
  await expect.poll(async () => (await notes(page))[0]?.state).toBe('uploaded')
  await expect(
    page.getByRole('dialog', { name: "Here's what I got" }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: /^Silent job/ }).click()
  await page.getByRole('button', { name: 'Open Job log' }).click()
  await expect(
    page.getByRole('list', { name: 'Job log' }).getByText(/^Voice note ·/),
  ).toBeVisible()
})

test('real UI: photo filing, Later, and move refresh the source and target logs', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Photo source')
  await addJob(page, 'Photo target')
  const png = {
    name: 'site.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg==',
      'base64',
    ),
  }
  await page.locator('#capture-home-photo').setInputFiles(png)
  await expect(page.getByRole('dialog', { name: 'Which job?' })).toBeVisible()
  await takeShot(page, { animations: 'disabled', path: shot('photo-filing') })
  await file(page, 'Photo source')
  await page.getByRole('button', { name: 'Open job', exact: true }).click()
  await page.getByRole('button', { name: 'Open Job log' }).click()
  await expect(page.locator('.job-log-photo')).toHaveCount(1)
  await page.getByRole('button', { name: 'Photo actions' }).click()
  await page.getByRole('button', { name: 'Move to another job' }).click()
  await takeShot(page, { animations: 'disabled', path: shot('move') })
  await page
    .getByRole('dialog', { name: 'Move to which job?' })
    .getByRole('button', { name: 'Photo target', exact: true })
    .click()
  await expect(
    page.getByText('Moved to Photo target', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.job-log-photo')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open job', exact: true }).click()
  await page.getByRole('button', { name: 'Open Job log' }).click()
  await expect(page.locator('.job-log-photo')).toHaveCount(1)
  await home(page)
  await page.locator('#capture-home-photo').setInputFiles(png)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await expect(page.getByRole('button', { name: 'Choose job' })).toBeVisible()
})

test('real UI: inside-job recording keeps its destination after navigation; moves carry confirmed hours', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Original job')
  await addJob(page, 'Other job')
  await page.getByRole('button', { name: /^Original job/ }).click()
  await page.getByRole('button', { name: 'Start recording' }).click()
  await home(page)
  await page.getByRole('button', { name: /^Other job\s/ }).click()
  await expect(page.locator('.capture-recording-destination')).toContainText(
    'to Original job',
  )
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(page.getByRole('dialog', { name: 'Which job?' })).toHaveCount(0)
  await page
    .getByRole('dialog', { name: "Here's what I got" })
    .getByRole('button', { name: 'Looks right' })
    .click()
  await home(page)
  await page.getByRole('button', { name: /^Original job/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '2h logged',
  )
  await page.getByRole('button', { name: 'Open Job log' }).click()
  await page.getByRole('button', { name: 'Voice note actions' }).click()
  await page.getByRole('button', { name: 'Move to another job' }).click()
  await page
    .getByRole('dialog', { name: 'Move to which job?' })
    .getByRole('button', { name: 'Other job', exact: true })
    .click()
  await expect(
    page.getByText('Moved to Other job', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await home(page)
  await page.getByRole('button', { name: /^Original job/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '0h logged',
  )
  await home(page)
  await page.getByRole('button', { name: /^Other job\s/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '2h logged',
  )
})
for (const size of [320, 390])
  test(`real UI: Home, picker and draft fit ${size}px`, async ({ page }) => {
    await page.setViewportSize({ width: size, height: 844 })
    await signup(page)
    await addJob(page, 'A garden room with a long name that needs room to wrap')
    await width(page)
    await record(page)
    await width(page)
    await file(page, 'A garden room with a long name that needs room to wrap')
    await expect(
      page.getByRole('dialog', { name: "Here's what I got" }),
    ).toBeVisible()
    await width(page)
  })

test('real UI: a repeat note upload accepts the server job and displays it in review', async ({
  page,
  context,
}) => {
  await signup(page)
  await addJob(page, 'Chosen room')
  await addJob(page, 'Actual room')
  const jobs = await (await page.request.get('/api/jobs')).json()
  const actual = jobs.find((j: { title: string }) => j.title === 'Actual room')
  await context.setOffline(true)
  await record(page)
  await file(page, 'Chosen room')
  const note = (await notes(page))[0]
  const response = await page.request.post('/api/notes', {
    multipart: {
      audio: {
        name: 'note.webm',
        mimeType: 'audio/webm',
        buffer: Buffer.from('same capture'),
      },
      clientNoteId: note.id,
      capturedAt: new Date().toISOString(),
      durationMs: '3500',
      mimeType: 'audio/webm',
      captureContext: 'home',
      jobId: actual.id,
    },
  })
  expect(response.status()).toBe(201)
  await context.setOffline(false)
  await expect.poll(async () => (await notes(page))[0].job).toBe(actual.id)
  await expect(
    page
      .getByRole('dialog', { name: "Here's what I got" })
      .getByText('Saved to Actual room', { exact: true }),
  ).toBeVisible()
})

test('real UI: a job archived offline leaves the recording safely unfiled', async ({
  page,
  context,
}) => {
  await signup(page)
  await addJob(page, 'Offline room')
  const jobs = await (await page.request.get('/api/jobs')).json()
  await context.setOffline(true)
  await record(page)
  await file(page, 'Offline room')
  await page.request.patch('/api/jobs/' + jobs[0].id, {
    data: { status: 'archived' },
  })
  await context.setOffline(false)
  await expect.poll(async () => (await notes(page))[0]?.state).toBe('uploaded')
  expect((await notes(page))[0].job).toBeNull()
  await expect(
    page.getByText('Saved — not filed yet', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await expect(page.getByRole('button', { name: 'Choose job' })).toBeVisible()
})

async function photos(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r, j) => {
      const q = indexedDB.open('job-book')
      q.onsuccess = () => r(q.result)
      q.onerror = () => j(q.error)
    })
    const result = await new Promise<
      {
        clientPhotoId: string
        serverPhotoId: string | null
        jobId: string | null
        localState: string
      }[]
    >((r, j) => {
      const q = db.transaction('photos').objectStore('photos').getAll()
      q.onsuccess = () => r(q.result)
      q.onerror = () => j(q.error)
    })
    db.close()
    return result
  })
}
const image = () => ({
  name: 'site.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg==',
    'base64',
  ),
})
test('real UI: PHOTO_ALREADY_FILED recovers the local photo’s actual job with an idempotent upload', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Photo choice')
  await addJob(page, 'Photo actual')
  const jobs = await (await page.request.get('/api/jobs')).json(),
    actual = jobs.find((j: { title: string }) => j.title === 'Photo actual')
  await page.locator('#capture-home-photo').setInputFiles(image())
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect
    .poll(async () => (await photos(page))[0]?.localState)
    .toBe('uploaded')
  const local = (await photos(page))[0]
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await page.getByRole('button', { name: 'Choose job' }).click()
  expect(
    (
      await page.request.post('/api/photos/' + local.serverPhotoId + '/file', {
        data: { jobId: actual.id },
      })
    ).ok(),
  ).toBe(true)
  const recovery = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/photos'),
  )
  await file(page, 'Photo choice')
  expect((await recovery).headers()['content-type']).toContain(
    'multipart/form-data',
  )
  await expect(
    page.getByText('Saved to Photo actual', { exact: true }),
  ).toBeVisible()
  expect((await photos(page))[0].serverPhotoId).toBe(local.serverPhotoId)
  expect((await photos(page))[0].jobId).toBe(actual.id)
})
test('real UI: remote-only PHOTO_ALREADY_FILED is neutral and disappears from Not filed yet', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Remote choice')
  await addJob(page, 'Remote actual')
  const jobs = await (await page.request.get('/api/jobs')).json(),
    actual = jobs.find((j: { title: string }) => j.title === 'Remote actual')
  const upload = await page.request.post('/api/photos', {
      multipart: {
        file: image(),
        clientPhotoId: crypto.randomUUID(),
        captureContext: 'home',
      },
    }),
    photo = (await upload.json()).photo
  await page.reload()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await page.getByRole('button', { name: 'Choose job' }).click()
  await page.request.post('/api/photos/' + photo.id + '/file', {
    data: { jobId: actual.id },
  })
  await file(page, 'Remote choice')
  await expect(
    page.getByText('This photo has already been filed', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Nothing waiting to be filed.')).toBeVisible()
  await expect(page.getByText(/^Saved to/)).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
test('real UI: Fix corrects hours without hidden financial properties', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Correct job')
  await record(page)
  await file(page, 'Correct job')
  await page
    .getByRole('dialog', { name: "Here's what I got" })
    .getByRole('button', { name: 'Fix', exact: true })
    .click()
  await page.getByRole('button', { name: 'Edit Mike' }).click()
  await page.getByLabel('Hours', { exact: true }).fill('4')
  const request = page.waitForRequest((r) =>
    r.url().endsWith('/review-queue-decisions'),
  )
  await page.getByRole('button', { name: 'Save fix', exact: true }).click()
  const body = (await request).postDataJSON()
  expect(body.corrected).not.toHaveProperty('costAmount')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: /^Correct job/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '4h logged',
  )
})

test('real UI: a repeat photo upload accepts the server job after an offline choice', async ({
  page,
  context,
}) => {
  await signup(page)
  await addJob(page, 'Photo chosen')
  await addJob(page, 'Photo canonical')
  const jobs = await (await page.request.get('/api/jobs')).json(),
    actual = jobs.find((j: { title: string }) => j.title === 'Photo canonical')
  await context.setOffline(true)
  await page.locator('#capture-home-photo').setInputFiles(image())
  await file(page, 'Photo chosen')
  const local = (await photos(page))[0]
  expect(
    (
      await page.request.post('/api/photos', {
        multipart: {
          file: image(),
          clientPhotoId: local.clientPhotoId,
          captureContext: 'home',
          jobId: actual.id,
        },
      })
    ).status(),
  ).toBe(201)
  await context.setOffline(false)
  await expect.poll(async () => (await photos(page))[0].jobId).toBe(actual.id)
  await expect(
    page.getByText('Saved to Photo canonical', { exact: true }),
  ).toBeVisible()
})

test('real UI: offline photo bytes and preview survive reload and upload on reconnect', async ({
  page,
  context,
}) => {
  await signup(page)
  await addJob(page, 'Photo reconnect')
  await context.setOffline(true)
  await page.locator('#capture-home-photo').setInputFiles(image())
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await expect(page.getByAltText('Saved on this phone')).toBeVisible()
  await context.setOffline(false)
  await page.reload()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await expect
    .poll(async () => (await photos(page))[0]?.localState)
    .toBe('uploaded')
  await page.getByRole('button', { name: 'Choose job' }).click()
  await file(page, 'Photo reconnect')
  await expect(
    page.getByText('Saved to Photo reconnect', { exact: true }),
  ).toBeVisible()
})

test('real UI: picker order stays fixed during a Home refresh', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Order A')
  await addJob(page, 'Order B')
  await record(page)
  const picker = page.getByRole('dialog', { name: 'Which job?' })
  await expect(picker).toBeVisible()
  const buttons = picker.locator('.capture-job-choice')
  await expect(buttons).toHaveCount(2)
  const before = await buttons.allTextContents()
  await page.request.post('/api/jobs', {
    data: { title: 'Order C', jobType: 'other' },
  })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect
    .poll(async () => page.getByRole('button', { name: /^Order C\s/ }).count())
    .toBe(1)
  expect(await buttons.allTextContents()).toEqual(before)
  await picker.getByRole('button', { name: 'Later', exact: true }).click()
})

test('real UI: another account cannot see or upload a previous account’s pending unfiled recording', async ({
  page,
  context,
}) => {
  await signup(page)
  await context.setOffline(true)
  await record(page)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  const before = (await notes(page))[0]
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Log in', exact: true }),
  ).toBeVisible()
  await context.setOffline(false)
  let uploads = 0
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/notes')) uploads++
  })
  await signup(page, false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('button', { name: /Not filed yet/ })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('heading', { name: 'Unmatched recordings' }),
  ).toHaveCount(0)
  expect((await notes(page))[0]).toEqual(before)
  expect(uploads).toBe(0)
})

test('real UI: refused note move displays the backend message and leaves both jobs unchanged', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Blocked source')
  await addJob(page, 'Blocked target')
  await record(page)
  await file(page, 'Blocked source')
  await page
    .getByRole('dialog', { name: "Here's what I got" })
    .getByRole('button', { name: 'Done', exact: true })
    .click()
  const note = (await notes(page))[0]
  expect(
    (await page.request.post('/__test/block-move/' + note.serverId)).ok(),
  ).toBe(true)
  await page.getByRole('button', { name: /^Blocked source/ }).click()
  await page.getByRole('button', { name: 'Open Job log' }).click()
  await page.getByRole('button', { name: 'Voice note actions' }).click()
  await page.getByRole('button', { name: 'Move to another job' }).click()
  await page
    .getByRole('dialog', { name: 'Move to which job?' })
    .getByRole('button', { name: 'Blocked target', exact: true })
    .click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect((await notes(page))[0].job).toBe(note.job)
  const source = await (
    await page.request.get('/api/jobs/' + note.job + '/log')
  ).json()
  expect(
    source.entries.some((e: { noteId: string }) => e.noteId === note.serverId),
  ).toBe(true)
})

test('real UI: a remote-only removed photo is neutral and never claims a destination', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Removed choice')
  const jobs = await (await page.request.get('/api/jobs')).json()
  const response = await page.request.post('/api/photos', {
      multipart: {
        file: image(),
        clientPhotoId: crypto.randomUUID(),
        captureContext: 'home',
      },
    }),
    photo = (await response.json()).photo
  await page.reload()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await page.getByRole('button', { name: 'Choose job' }).click()
  expect(
    (
      await page.request.post('/api/photos/' + photo.id + '/file', {
        data: { jobId: jobs[0].id },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await page.request.delete(
        '/api/jobs/' + jobs[0].id + '/photos/' + photo.id,
      )
    ).ok(),
  ).toBe(true)
  await file(page, 'Removed choice')
  await expect(
    page.getByText('This photo is no longer here', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Nothing waiting to be filed.')).toBeVisible()
  await expect(page.getByText(/^Saved to/)).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('real UI: NOTE_ALREADY_FILED rereads the draft and shows the actual job without moving it', async ({
  page,
}) => {
  await signup(page)
  await addJob(page, 'Note choice')
  await addJob(page, 'Note actual')
  const jobs = await (await page.request.get('/api/jobs')).json(),
    actual = jobs.find((j: { title: string }) => j.title === 'Note actual')
  await record(page)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect.poll(async () => (await notes(page))[0]?.state).toBe('uploaded')
  const local = (await notes(page))[0]
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await page.getByRole('button', { name: 'Choose job' }).click()
  expect(
    (
      await page.request.post('/api/notes/' + local.serverId + '/file', {
        data: { jobId: actual.id },
      })
    ).ok(),
  ).toBe(true)
  await file(page, 'Note choice')
  await expect.poll(async () => (await notes(page))[0].job).toBe(actual.id)
  await expect(
    page
      .getByRole('dialog', { name: "Here's what I got" })
      .getByText('Saved to Note actual', { exact: true }),
  ).toBeVisible()
})

test('real UI: losing signal during review restores saved confirmation and Done prevents reopening', async ({
  page,
  context,
}) => {
  await signup(page)
  await addJob(page, 'Review offline')
  await record(page)
  await file(page, 'Review offline')
  await expect(
    page.getByRole('dialog', { name: "Here's what I got" }),
  ).toBeVisible()
  await context.setOffline(true)
  await expect(
    page.getByRole('dialog', { name: "Here's what I got" }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Saved to Review offline', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await context.setOffline(false)
  await expect(
    page.getByRole('heading', { name: 'The Job Book' }),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog', { name: "Here's what I got" }),
  ).toHaveCount(0)
})
