import { test, expect, type Page } from '@playwright/test'

// 390px, VITE_USE_MOCK_API=true.
// Mock memory-view costSummary: £1240 known spend (hardcore £40 + plasterboard
// 2×£600), timber has no cost remembered (missing = 1).

async function openJobMemory(page: Page) {
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
}

test.describe('Cost capture & Known spend', () => {
  test('shows Known spend (not Total spend) with a missing-cost note', async ({ page }) => {
    await openJobMemory(page)
    const region = page.getByRole('region', { name: /known spend/i })
    await expect(region.getByText('£1240')).toBeVisible()
    await expect(region.getByText(/no cost remembered/i)).toBeVisible()
    await expect(page.getByText(/total spend/i)).toHaveCount(0)
  })

  test('a bought/ordered detail card shows unit cost and total, not a bare number', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('button', { name: /show details/i }).click()
    const hardcore = page.locator('.mem-card', { hasText: 'hardcore' })
    await expect(hardcore.getByText('£5 each')).toBeVisible()
    await expect(hardcore.getByText('Unit cost')).toBeVisible()
    await expect(hardcore.getByText('Total')).toBeVisible()
  })

  test('adding cost to a missing-cost item grows Known spend and clears the note', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('button', { name: /show details/i }).click()

    const timber = page.locator('.mem-card', { hasText: 'timber' })
    await timber.getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="costAmount"]').fill('10')
    await form.locator('select').nth(1).selectOption('each') // cost qualifier
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(500)

    const region = page.getByRole('region', { name: /known spend/i })
    // 1240 + (6 × £10) = 1300, and nothing is missing a cost anymore
    await expect(region.getByText('£1300')).toBeVisible()
    await expect(region.getByText(/no cost remembered/i)).toHaveCount(0)
  })

  test('source context remains available on a cost-bearing item', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('button', { name: /show details/i }).click()
    const hardcore = page.locator('.mem-card', { hasText: 'hardcore' })
    await hardcore.getByRole('button', { name: /show source/i }).click()
    await expect(page.getByText('This came from your note')).toBeVisible()
  })
})
