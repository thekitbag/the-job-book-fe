import { test, expect, type Page } from '@playwright/test'
import { openNotCounted } from './helpers'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390px, VITE_USE_MOCK_API=true. Regression for: a no-price bought item →
// Add price → enter a total → it enters Known spend (not stuck in "No price yet").

async function openSpend(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await goToSection(page, 'Spend')
  await page.waitForTimeout(700)
}

test.describe('Add price to a no-price item', () => {
  test('defaults to a total and enters Known spend', async ({ page }) => {
    await openSpend(page)
    const area = await openNotCounted(page)

    // membrane rolls have no price
    const row = area.locator('.cost-check-item', { hasText: 'membrane' }).first()
    await expect(row.getByText(/No price yet/i)).toBeVisible()
    await row.getByRole('button', { name: 'Add price' }).click()

    // the price form defaults to an explicit total
    const form = page.getByRole('form', { name: 'Add price' })
    await expect(form.getByLabel('Price basis')).toHaveValue('total')
    await form.locator('input[name="price"]').fill('80')
    await form.getByRole('button', { name: /save price/i }).click()
    await page.waitForTimeout(900)

    // the £80 is now counted, and that membrane row is no longer "No price yet"
    await expect(page.getByRole('region', { name: /^known spend$/i }).getByText(/£80|£2350/)).toBeVisible()
  })

  test('offers a per-item basis with a derived total for a quantity-known item', async ({ page }) => {
    await openSpend(page)
    const area = await openNotCounted(page)
    const row = area.locator('.cost-check-item', { hasText: 'membrane' }).first()
    await row.getByRole('button', { name: 'Add price' }).click()

    const form = page.getByRole('form', { name: 'Add price' })
    await form.getByLabel('Price basis').selectOption('each')
    await form.locator('input[name="price"]').fill('10')
    // 5 rolls × £10 = £50 total
    await expect(form.getByText(/£50 total/)).toBeVisible()
  })
})
