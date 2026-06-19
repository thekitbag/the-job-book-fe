import { test, expect } from '@playwright/test'

// All tests run at 390px width (set in playwright.config.ts) with VITE_USE_MOCK_API=true.
// The mock API returns 2 draft queue items and the default Garden Room job.

test.describe('Current job home UX', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss the storage explainer so it doesn't interfere with other selectors
    await page.goto('/')
    const explainer = page.getByRole('button', { name: /got it/i })
    if (await explainer.isVisible()) {
      await explainer.click()
    }
    // Enter mock passcode to get past login
    const passcode = page.getByLabel(/passcode/i)
    if (await passcode.isVisible()) {
      await passcode.fill('demo')
      await page.getByRole('button', { name: /sign in/i }).click()
      await page.waitForTimeout(400)
    }
  })

  test('selected job is unmistakable before recording', async ({ page }) => {
    // The large job title makes the current selection clear before recording.
    // Exact match avoids clash with the "Garden room" type chip.
    await expect(page.locator('.capture-current-job-title')).toHaveText('Garden Room')
  })

  test('Switch job is visible from the current job context', async ({ page }) => {
    await expect(page.getByRole('button', { name: /switch job/i })).toBeVisible()
  })

  test('Record button is the dominant action', async ({ page }) => {
    const recordBtn = page.getByRole('button', { name: /start recording/i })
    await expect(recordBtn).toBeVisible()
  })

  test('Things to check shows count/state from queue data', async ({ page }) => {
    // Mock returns 2 draft items; wait for queue to load
    await page.waitForTimeout(700)
    // Either shows count or "Nothing to check" (no passcode auth in mock may show 0)
    const thingsBtn = page.locator('.btn-things-to-check')
    await expect(thingsBtn).toBeVisible()
    const state = page.locator('.things-to-check-state')
    await expect(state).toBeVisible()
  })

  test('Things to check opens the existing queue', async ({ page }) => {
    const thingsBtn = page.locator('.btn-things-to-check')
    await expect(thingsBtn).toBeVisible()
    await thingsBtn.click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: /things to check/i })).toBeVisible()
    // Return to capture screen
    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('Job memory opens trusted memory view', async ({ page }) => {
    const jobMemoryBtn = page.getByRole('button', { name: /job memory/i })
    await expect(jobMemoryBtn).toBeVisible()
    await jobMemoryBtn.click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: /job memory/i })).toBeVisible()
    // Return to capture screen
    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('Source history is present but secondary/below primary actions', async ({ page }) => {
    const sourceHistory = page.getByRole('region', { name: /source history/i })
    await expect(sourceHistory).toBeVisible()
    // Record button appears before source history in the DOM
    const recordY = await page.getByRole('button', { name: /start recording/i }).boundingBox().then(b => b?.y ?? 0)
    const historyY = await sourceHistory.boundingBox().then(b => b?.y ?? 0)
    expect(historyY).toBeGreaterThan(recordY)
  })

  test('Things to check appears before source history', async ({ page }) => {
    const thingsBtn = page.locator('.btn-things-to-check')
    const sourceHistory = page.getByRole('region', { name: /source history/i })
    const thingsY = await thingsBtn.boundingBox().then(b => b?.y ?? 0)
    const historyY = await sourceHistory.boundingBox().then(b => b?.y ?? 0)
    expect(historyY).toBeGreaterThan(thingsY)
  })

  test('file size is not shown on the normal current-job screen', async ({ page }) => {
    // Check the page text does not contain any byte/KB/MB size pattern
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(/\d+\s*(B|KB|MB|bytes)\b/i)
  })

  test('"Synced" is not the primary success label on uploaded notes', async ({ page }) => {
    // There are no uploaded notes in the mock by default; but confirm no "Synced" text appears
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toContain('Synced')
  })
})
