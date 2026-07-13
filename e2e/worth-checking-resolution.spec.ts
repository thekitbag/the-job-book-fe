import { test, expect, type Page } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390px, VITE_USE_MOCK_API=true. The leftover "sand" item has uncertaintyFlags
// (approximate quantity) → a Worth-checking note. It lives on the
// Materials workspace’s Left over tab.

async function openUsedTab(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await goToSection(page, 'Materials', 'Left over')
  await page.waitForTimeout(800)
}

const sandCard = (page: Page) => page.locator('.mem-card', { hasText: 'in the van' })

test.describe('Worth checking resolution', () => {
  test('verify as right removes Worth checking but keeps the item and approximate wording', async ({ page }) => {
    await openUsedTab(page)
    const card = sandCard(page)
    await expect(card.getByText('Worth checking')).toBeVisible()

    await card.getByRole('button', { name: /this is right/i }).click()
    await page.waitForTimeout(400)

    await expect(card.getByText('Worth checking')).not.toBeVisible()
    await expect(card.getByText(/about half/i)).toBeVisible()
  })

  test('Fix memory clears Worth checking and updates the card', async ({ page }) => {
    await openUsedTab(page)
    await sandCard(page).getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="locationOrUse"]').fill('in the lockup')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(500)

    const updated = page.locator('.mem-card', { hasText: 'in the lockup' })
    await expect(updated.getByText('Worth checking')).not.toBeVisible()
  })

  test('Still unsure keeps the Worth checking warning', async ({ page }) => {
    await openUsedTab(page)
    const card = sandCard(page)
    await card.getByRole('button', { name: /still unsure/i }).click()
    await page.waitForTimeout(200)

    await expect(card.getByText('Worth checking')).toBeVisible()
    await expect(card.getByRole('button', { name: /this is right/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /fix memory/i })).toBeVisible()
  })
})
