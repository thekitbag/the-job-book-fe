import { test, expect } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — lightweight job status editing.
// Statuses: Planning / Started / Finished / Archived.

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

async function openStatusEditor(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /status:.*change status/i }).click()
}

test.describe('Job status update', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page)
  })

  test('header shows the current status label', async ({ page }) => {
    await expect(page.locator('.ws-header-titles')).toContainText('Started')
  })

  test('changing status to Planning updates the header and keeps Record visible', async ({ page }) => {
    await openStatusEditor(page)
    await page.getByRole('button', { name: 'Planning', exact: true }).click()
    await page.waitForTimeout(500)

    await expect(page.locator('.ws-header-titles')).toContainText('Planning')
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('a planning job stays visible and selectable in Switch', async ({ page }) => {
    await openStatusEditor(page)
    await page.getByRole('button', { name: 'Planning', exact: true }).click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: /switch job/i }).click()
    const item = page.getByRole('button', { name: /Garden Room/ })
    await expect(item).toBeVisible()
    await expect(item).toContainText('Planning')
  })

  test('changing status to Finished keeps the job selected', async ({ page }) => {
    await openStatusEditor(page)
    await page.getByRole('button', { name: 'Finished', exact: true }).click()
    await page.waitForTimeout(500)

    await expect(page.locator('.ws-header-titles')).toContainText('Finished')
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
  })

  test('cancelling the status editor makes no change', async ({ page }) => {
    await openStatusEditor(page)
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.locator('.ws-header-titles')).toContainText('Started')
  })

  test('archiving requires confirmation — dismissing leaves the job unchanged', async ({ page }) => {
    page.once('dialog', dialog => dialog.dismiss())
    await openStatusEditor(page)
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await page.waitForTimeout(300)

    // still on the same job, still Started — no navigation happened
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
    await expect(page.locator('.ws-header-titles')).toContainText('Started')
  })

  test('archiving with confirmation removes the job from Switch and moves to another job', async ({ page }) => {
    page.once('dialog', dialog => dialog.accept())
    await openStatusEditor(page)
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await page.waitForTimeout(700)

    // moved to the other seeded job, not stuck on a broken/archived view
    await expect(page.locator('.ws-job-title')).toHaveText('Kitchen Extension')
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()

    await page.getByRole('button', { name: /switch job/i }).click()
    await expect(page.getByRole('button', { name: /Garden Room/ })).toHaveCount(0)
  })
})
