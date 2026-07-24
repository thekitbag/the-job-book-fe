import { test, expect } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


test.describe('Pilot feedback: memory detail and costs', () => {
  test('queue card shows labelled cost rows without expanding source', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const card = page.locator('.queue-item-card').first()
    await expect(card.getByText('8 bags · hardcore')).toBeVisible()
    await expect(card.getByText(/£5 each · £40 total/)).toBeVisible()
    // source text still collapsed
    await expect(page.getByText(/five pounds each/i)).not.toBeVisible()
  })

  test('Fix 2: Worth checking absent when no uncertainty flags', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const card = page.locator('.queue-item-card').first()
    await expect(card.getByText('Worth checking')).not.toBeVisible()
  })

  test('Fix 1: corrected structured fields update visible card after save', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const card = page.locator('.queue-item-card').first()
    await page.getByRole('button', { name: /fix details/i }).first().click()

    const form = page.getByRole('form', { name: /edit correction/i })
    // Edit structured fields — V2 makes these the primary display, not the prose summary
    await form.locator('input[name="quantity"]').fill('10')
    await form.locator('input[name="costAmount"]').fill('4.50')
    await page.getByRole('button', { name: /save correction/i }).click()
    await page.waitForTimeout(1000)

    // Corrected structured values must be visible in the scannable card
    await expect(card.getByText('10 bags · hardcore')).toBeVisible()
    await expect(card.getByText(/£4.50 each/)).toBeVisible()
    await expect(card.getByText('Saved to trusted memory')).toBeVisible()
    // Stale prose summary must not appear as a headline
    await expect(card.getByText('Ordered 8 bags of hardcore from Jewson at £5 each')).not.toBeVisible()
  })

  test('Fix 4: already remembered material cards show type label and structured rows', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const remembered = page.getByRole('region', { name: /already remembered/i })
    // Already remembered is collapsed by default — expand it first
    await remembered.getByRole('button', { name: /show remembered items/i }).click()
    // V2: material type shows structured rows, not prose summary as headline
    await expect(remembered.locator('dd').getByText('scaffolding', { exact: true })).toBeVisible()
    await expect(remembered.locator('dd').getByText('TCS', { exact: true })).toBeVisible()
    await expect(remembered.locator('dd').getByText('Friday morning', { exact: true })).toBeVisible()
    // Prose summary must not be the prominent headline for material types with structured fields
    await expect(remembered.getByText('Ordered scaffolding from TCS')).not.toBeVisible()
  })

  test('Fix 3: bought tab renders Known spend and bought notes with cost', async ({ page }) => {
    await page.goto('/')
    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)

    await expect(page.getByRole('region', { name: /^budget$/i }).getByText(/£2270/)).toBeVisible()
    const hardcore = page.getByRole('region', { name: /uncategorised cost/i }).locator('.mem-card', { hasText: 'hardcore' })
    await expect(hardcore.locator('.mem-row-tap-price')).toHaveText('£40')
  })
})
