import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — the book level: Book Home, All Jobs and
// New job, plus the invariant that recording always belongs to a named job.
// Seeded mock book: 2 in progress, 2 planning, 2 finished, 1 archived.

async function gotoApp(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
}

async function openBookHome(page: Page) {
  await page.getByRole('button', { name: /the job book/i }).click()
  await expect(page.getByRole('heading', { name: 'The Job Book' })).toBeVisible()
}

async function openAllJobs(page: Page) {
  await openBookHome(page)
  await page.getByRole('button', { name: 'All jobs', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^All jobs/ })).toBeVisible()
}

test.describe('Book Home and job navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page)
  })

  test('the app still launches into a Job Home, not Book Home', async ({ page }) => {
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('Book Home lists live jobs, omits finished ones, and has no Record', async ({ page }) => {
    await openBookHome(page)

    await expect(page.getByRole('button', { name: /Garden Room/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Grant James Roof/ })).toContainText('Planning')
    // Finished work is not on the cover at all — not as rows, not as a count.
    // "All jobs ›" above is the one route to it.
    await expect(page.getByRole('button', { name: /Whitmore Patio/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /finished jobs/i })).toHaveCount(0)

    // No global Record: recording always belongs to a named job. Money is now a
    // real destination (see cross-job-money.spec.ts); Workshop and "to check"
    // are still design-pack futures with nothing behind them.
    await expect(page.getByRole('button', { name: /record/i })).toHaveCount(0)
    await expect(page.getByText(/workshop/i)).toHaveCount(0)
    await expect(page.getByText(/to check/i)).toHaveCount(0)
  })

  test('opening another job from Book Home changes the Record destination', async ({ page }) => {
    await expect(page.locator('.ws-record-sub')).toContainText('Garden Room')
    await openBookHome(page)
    await page.getByRole('button', { name: /Kitchen Extension/ }).click()

    await expect(page.locator('.ws-job-title')).toHaveText('Kitchen Extension')
    await expect(page.locator('.ws-record-sub')).toContainText('Kitchen Extension')
  })

  test('All Jobs groups every job once, with counts, and no archived job', async ({ page }) => {
    await openAllJobs(page)

    await expect(page.getByRole('heading', { name: 'All jobs 6' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'In progress 2' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Planning 2' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Finished 2' })).toBeVisible()

    for (const title of ['Garden Room', 'Kitchen Extension', 'Grant James Roof', 'Whitmore Patio', 'Okoro Loft']) {
      await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(1)
    }
    await expect(page.getByRole('button', { name: /Old Shed Rebuild/ })).toHaveCount(0)

    // where lines show when known and are simply absent when not
    await expect(page.getByText('Ash Grove')).toBeVisible()
  })

  test('the finished work is reachable through All jobs', async ({ page }) => {
    await openBookHome(page)
    await page.getByRole('button', { name: 'All jobs', exact: true }).click()

    // Listed under its own heading with its own count — no scroll-to-group
    // trick now that nothing deep-links into a group.
    const finished = page.getByRole('region', { name: 'Finished' })
    await expect(page.getByRole('heading', { name: 'Finished 2' })).toBeVisible()
    await expect(finished.getByRole('button', { name: /Okoro Loft/ })).toBeVisible()
  })

  test('New job creates one In progress job and opens it as the recording destination', async ({ page }) => {
    await openAllJobs(page)
    await page.getByRole('button', { name: 'New job' }).click()

    const sheet = page.getByRole('dialog', { name: 'New job' })
    await sheet.getByLabel(/job name/i).fill('Verity Porch')
    await sheet.getByLabel(/where \(optional\)/i).fill('Elm Close')
    await sheet.getByRole('button', { name: /^add job$/i }).click()
    await page.waitForTimeout(700)

    await expect(page.locator('.ws-job-title')).toHaveText('Verity Porch')
    await expect(page.locator('.ws-status-chip')).toHaveText(/In progress/)
    await expect(page.locator('.ws-record-sub')).toContainText('Verity Porch')

    await openAllJobs(page)
    await expect(page.getByRole('heading', { name: 'All jobs 7' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'In progress 3' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Verity Porch/ })).toHaveCount(1)
  })

  test('New job can start a Planning job, and it lands in the Planning group', async ({ page }) => {
    await openAllJobs(page)
    await page.getByRole('button', { name: 'New job' }).click()

    const sheet = page.getByRole('dialog', { name: 'New job' })
    await sheet.getByLabel(/job name/i).fill('Barn Quote')
    // The radio itself is visually hidden; its label is the 56px tap target.
    await sheet.locator('.new-job-state-option', { hasText: 'Planning' }).click()
    await expect(sheet.getByRole('radio', { name: 'Planning' })).toBeChecked()
    await sheet.getByRole('button', { name: /^add job$/i }).click()
    await page.waitForTimeout(700)

    await expect(page.locator('.ws-job-title')).toHaveText('Barn Quote')
    await expect(page.locator('.ws-status-chip')).toHaveText(/Planning/)

    await openAllJobs(page)
    const planning = page.getByRole('region', { name: 'Planning' })
    await expect(planning.getByRole('button', { name: /Barn Quote/ })).toBeVisible()
  })

  test('cancelling New job creates nothing and leaves the selected job alone', async ({ page }) => {
    await openAllJobs(page)
    await page.getByRole('button', { name: 'New job' }).click()
    const sheet = page.getByRole('dialog', { name: 'New job' })
    await sheet.getByLabel(/job name/i).fill('Never Created')
    await sheet.getByRole('button', { name: /cancel/i }).click()

    await expect(page.getByRole('heading', { name: 'All jobs 6' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Never Created/ })).toHaveCount(0)
    await page.getByRole('button', { name: /back to the job book/i }).click()
    await page.getByRole('button', { name: /Garden Room/ }).click()
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
  })

  test('browser Back does not trap the app or switch to the wrong job', async ({ page }) => {
    await openBookHome(page)
    await page.getByRole('button', { name: /Kitchen Extension/ }).click()
    await expect(page.locator('.ws-job-title')).toHaveText('Kitchen Extension')

    // The book level is app state, not URL history — the app pushes no
    // entries, so Back leaves the app rather than walking a view stack. What
    // matters is that coming back in resumes the job Mike chose, never
    // another one, and never a blank screen.
    await page.goBack()
    await page.goForward()
    await page.waitForTimeout(800)

    await expect(page.locator('.ws-job-title')).toHaveText('Kitchen Extension')
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })
})
