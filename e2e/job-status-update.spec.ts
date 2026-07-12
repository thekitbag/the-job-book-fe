import { test, expect } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — job status editing via the Change status
// bottom sheet. API statuses: planning / started / finished / archived;
// 'started' renders to users as 'In progress'.

async function gotoApp(page: import('@playwright/test').Page) {
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

async function openStatusSheet(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /change job status/i }).click()
  await expect(page.getByRole('dialog', { name: /change status/i })).toBeVisible()
}

test.describe('Job status update', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page)
  })

  test('header shows STATUS label and the started job as "In progress"', async ({ page }) => {
    await expect(page.locator('.ws-status-label')).toHaveText('Status')
    await expect(page.locator('.ws-status-chip')).toHaveText(/In progress/)
  })

  test('the chip opens a bottom sheet with three statuses and a separated archive action', async ({ page }) => {
    await openStatusSheet(page)
    const sheet = page.getByRole('dialog', { name: /change status/i })
    for (const label of ['Planning', 'In progress', 'Finished']) {
      await expect(sheet.getByRole('button', { name: label })).toBeVisible()
    }
    await expect(sheet.getByRole('button', { name: /archive job…/i })).toBeVisible()
    // current status is marked
    await expect(sheet.getByRole('button', { name: /in progress/i })).toHaveAttribute('aria-pressed', 'true')
  })

  test('changing status to Planning updates the header and keeps Record visible', async ({ page }) => {
    await openStatusSheet(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Planning', exact: true }).click()
    await page.waitForTimeout(500)

    await expect(page.locator('.ws-status-chip')).toHaveText(/Planning/)
    await expect(page.getByRole('dialog', { name: /change status/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('a planning job stays visible and selectable in Switch', async ({ page }) => {
    await openStatusSheet(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Planning', exact: true }).click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: /switch job/i }).click()
    const item = page.getByRole('button', { name: /Garden Room/ })
    await expect(item).toBeVisible()
    await expect(item).toContainText('Planning')
  })

  test('changing status to Finished keeps the job selected', async ({ page }) => {
    await openStatusSheet(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Finished', exact: true }).click()
    await page.waitForTimeout(500)

    await expect(page.locator('.ws-status-chip')).toHaveText(/Finished/)
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
  })

  test('closing the sheet makes no change', async ({ page }) => {
    await openStatusSheet(page)
    await page.getByRole('button', { name: /^close$/i }).click()
    await expect(page.getByRole('dialog', { name: /change status/i })).toHaveCount(0)
    await expect(page.locator('.ws-status-chip')).toHaveText(/In progress/)
  })

  test('archiving requires confirmation — cancelling leaves the job unchanged', async ({ page }) => {
    await openStatusSheet(page)
    await page.getByRole('button', { name: /archive job…/i }).click()
    // confirmation step, no request yet
    await expect(page.getByText(/removed from your normal job list/i)).toBeVisible()
    await page.getByRole('button', { name: /cancel/i }).click()
    // back on the options; close and confirm nothing changed
    await page.getByRole('button', { name: /^close$/i }).click()

    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
    await expect(page.locator('.ws-status-chip')).toHaveText(/In progress/)
  })

  test('archiving with confirmation removes the job from Switch and moves to another job', async ({ page }) => {
    await openStatusSheet(page)
    await page.getByRole('button', { name: /archive job…/i }).click()
    await page.getByRole('button', { name: 'Archive job', exact: true }).click()
    await page.waitForTimeout(700)

    // moved to the other seeded job, not stuck on a broken/archived view
    await expect(page.locator('.ws-job-title')).toHaveText('Kitchen Extension')
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()

    await page.getByRole('button', { name: /switch job/i }).click()
    await expect(page.getByRole('button', { name: /Garden Room/ })).toHaveCount(0)
  })
})
