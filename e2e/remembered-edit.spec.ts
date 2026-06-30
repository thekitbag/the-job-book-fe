import { test, expect, type Page } from '@playwright/test'

// 390px (playwright.config.ts), VITE_USE_MOCK_API=true.
// Mock memory view: Ordered (hardcore) + Used (OSB).
// Mock review queue remembered: scaffolding (ordered) + uneven floor (watch-out).

async function signIn(page: Page) {
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

test.describe('Remembered-memory edit & focus', () => {
  test('Job memory: Fix memory updates a bought note in place', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Job memory' }).click()
    await page.waitForTimeout(800)

    // hardcore is the uncategorised counted bought note.
    const hardcore = page.getByRole('region', { name: /uncategorised bought/i }).locator('.mem-card', { hasText: 'hardcore' })
    await hardcore.getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="quantity"]').fill('10')
    await form.locator('input[name="costAmount"]').fill('4.50')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(600)

    await expect(page.getByText('10 bags').first()).toBeVisible()
    await expect(page.getByText('£4.50 each').first()).toBeVisible()
    await expect(page.getByRole('form', { name: /edit memory/i })).toHaveCount(0)
  })

  test('Job memory: changing a bought note type moves it to the Notes tab', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Job memory' }).click()
    await page.waitForTimeout(800)

    const hardcore = page.getByRole('region', { name: /uncategorised bought/i }).locator('.mem-card', { hasText: 'hardcore' })
    await hardcore.getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.getByLabel('Type').selectOption('customer_change')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(600)

    // It left the bought tab; it now appears under the Notes tab's Customer changes.
    await page.getByRole('tab', { name: /notes/i }).click()
    await expect(page.getByRole('heading', { name: 'Customer changes' })).toBeVisible()
  })

  test('Things to check: remembered context follows category focus', async ({ page }) => {
    await signIn(page)
    await page.locator('.btn-things-to-check').click()
    await page.waitForTimeout(700)

    // Focus Ordered, expand remembered → ordered context (scaffolding) shows
    await page.getByRole('button', { name: 'Ordered 2' }).click()
    await page.getByRole('button', { name: /show remembered items/i }).click()
    const remembered = page.getByRole('region', { name: /already remembered/i })
    await expect(remembered.getByText('scaffolding')).toBeVisible()

    // Focus Used → no used remembered context, section disappears
    await page.getByRole('button', { name: 'Used 1' }).click()
    await expect(page.getByRole('region', { name: /already remembered/i })).toHaveCount(0)
  })

  test('Things to check: Fix memory corrects a remembered card in place', async ({ page }) => {
    await signIn(page)
    await page.locator('.btn-things-to-check').click()
    await page.waitForTimeout(700)
    await expect(page.getByText('6 waiting')).toBeVisible()

    // Expand remembered, fix the first remembered card
    await page.getByRole('button', { name: /show remembered items/i }).click()
    const remembered = page.getByRole('region', { name: /already remembered/i })
    await remembered.getByRole('button', { name: /fix memory/i }).first().click()

    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="supplierName"]').fill('Travis Perkins')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(600)

    // updated in place, and no new pending queue item was created
    await expect(remembered.getByText('Travis Perkins')).toBeVisible()
    await expect(page.getByText('6 waiting')).toBeVisible()
  })
})
