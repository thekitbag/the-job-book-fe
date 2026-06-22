import { test, expect, type Page } from '@playwright/test'

// 390px (playwright.config.ts), VITE_USE_MOCK_API=true.
// Mock memory-view has a leftover "sand" item with uncertaintyFlags
// (approximate quantity) → a Worth-checking remembered item.

async function openJobMemoryDetail(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await page.getByRole('button', { name: 'Job memory' }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /show details/i }).click()
}

function unresolvedCard(page: Page) {
  // The Worth-checking item is the leftover sand ("in the van")
  return page.locator('.mem-card', { hasText: 'in the van' })
}

test.describe('Worth checking resolution', () => {
  test('verify as right removes Worth checking but keeps the item and approximate wording', async ({ page }) => {
    await openJobMemoryDetail(page)
    const card = unresolvedCard(page)
    await expect(card.getByText('Worth checking')).toBeVisible()

    await card.getByRole('button', { name: /this is right/i }).click()
    await page.waitForTimeout(400)

    // Warning gone, item still remembered with approximate quantity visible
    await expect(card.getByText('Worth checking')).not.toBeVisible()
    await expect(card.getByText(/about half/i)).toBeVisible()
    // and gone from the scan Worth-checking roll-up
    const scan = page.getByRole('region', { name: /memory scan/i })
    await expect(scan.getByText('Worth checking')).not.toBeVisible()
  })

  test('Fix memory clears Worth checking and updates summary + detail together', async ({ page }) => {
    await openJobMemoryDetail(page)
    const card = unresolvedCard(page)
    await card.getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="locationOrUse"]').fill('in the lockup')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(500)

    const updated = page.locator('.mem-card', { hasText: 'in the lockup' })
    await expect(updated.getByText('Worth checking')).not.toBeVisible()
    const scan = page.getByRole('region', { name: /memory scan/i })
    await expect(scan.getByText('Worth checking')).not.toBeVisible()
    await expect(scan.getByText('in the lockup')).toBeVisible()
  })

  test('Still unsure keeps the Worth checking warning', async ({ page }) => {
    await openJobMemoryDetail(page)
    const card = unresolvedCard(page)
    await card.getByRole('button', { name: /still unsure/i }).click()
    await page.waitForTimeout(200)

    await expect(card.getByText('Worth checking')).toBeVisible()
    await expect(card.getByRole('button', { name: /this is right/i })).toHaveCount(0)
    // Fix memory remains available for an item left unsure
    await expect(card.getByRole('button', { name: /fix memory/i })).toBeVisible()
  })
})
