import { test, expect, type Page } from '@playwright/test'
import { openRowOverflow } from './helpers'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390px, VITE_USE_MOCK_API=true. The stateful mock derives an each-line total
// (quantity × unit cost) on create/patch when totalCostAmount is omitted.

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

test.describe('Auto-total unit cost', () => {
  test('direct-add each shows a derived total, saves it, and Fix Memory recalculates', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Spend')
    await page.waitForTimeout(600)

    await page.getByRole('button', { name: 'Add spend', exact: true }).click()
    const form = page.getByRole('form', { name: 'Add spend' })
    await form.locator('input[name="materialName"]').fill('OSB')
    await form.locator('input[name="quantity"]').fill('5')
    await form.locator('input[name="unit"]').fill('sheets')
    await form.locator('input[name="costAmount"]').fill('20')
    await form.getByLabel('Cost basis').selectOption('each')

    // live preview before save
    await expect(form.getByText(/£100 total/)).toBeVisible()
    await form.getByRole('button', { name: /^Save / }).click()

    // saved item shows unit cost + derived total from the refetched mock
    const osb = page.getByRole('region', { name: /uncategorised spend/i }).locator('.mem-card', { hasText: 'OSB' })
    await expect(osb.getByText('£20 each')).toBeVisible()
    await expect(osb.getByText('£100')).toBeVisible()

    // Fix Memory: change quantity → the total recalculates
    // Uncategorised rows keep fix/source/remove behind the "…" overflow.
    await (await openRowOverflow(osb)).getByRole('menuitem', { name: /fix memory/i }).click()
    const edit = page.getByRole('form', { name: /edit memory/i })
    await edit.locator('input[name="quantity"]').fill('6')
    await expect(edit.getByText(/£120 total/)).toBeVisible()
    await edit.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(700)

    await expect(
      page.getByRole('region', { name: /uncategorised spend/i }).locator('.mem-card', { hasText: 'OSB' }).getByText('£120'),
    ).toBeVisible()
  })

  test('review queue shows the derived line total before confirmation', async ({ page }) => {
    await gotoApp(page)
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /things to check/i }).click()
    await page.waitForTimeout(600)

    // the seeded timber draft is 6 lengths at £20 each → £120 total (derived)
    const timber = page.getByTestId('queue-item-queue-item-mock-004')
    await expect(timber.getByText(/£20 each/)).toBeVisible()
    await expect(timber.getByText(/£120 total/)).toBeVisible()
  })

  test('correcting a draft shows the same derived total as Fix Memory', async ({ page }) => {
    await gotoApp(page)
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /things to check/i }).click()
    await page.waitForTimeout(600)

    // hardcore draft: £5 each × 8 bags → the correction form derives £40 total
    const hardcore = page.getByTestId('queue-item-queue-item-mock-001')
    await hardcore.getByRole('button', { name: 'Fix' }).click()
    const form = page.getByRole('form', { name: /edit correction/i })
    await expect(form.getByText(/£40 total/)).toBeVisible()
    // no manual total field for an each line
    await expect(form.locator('input[placeholder="e.g. 40"]')).toHaveCount(0)
  })
})
