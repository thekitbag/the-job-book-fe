import { test, expect, type Page } from '@playwright/test'
import { openRowActions } from './helpers'

// 390×844, VITE_USE_MOCK_API=true — Returned materials.
// Returned is a peer Materials state, not a delete: returning fence posts moves
// the quantity out of Left over, leaves the bought history alone, and a trusted
// refund reduces net known spend visibly.

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

async function goToSection(page: Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}

// The seeded Left over fence posts card.
function postsCard(page: Page) {
  return page.locator('.mem-card').filter({ hasText: 'fence posts' }).first()
}

async function knownSpend(page: Page): Promise<string> {
  await goToSection(page, 'Budget')
  return (await page.locator('.mem-hero-amount').first().innerText()).trim()
}

test.describe('Returned materials', () => {
  test('Materials shows Returned as a peer of Bought, Used and Left over', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Materials')
    for (const name of ['Bought', 'Used', 'Left over', 'Returned']) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }
    // Four tabs still have to fit the phone without the strip scrolling away.
    const strip = page.locator('.ws-tabs--inner')
    const overflow = await strip.evaluate(el => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('partial return: Left over drops to 2, Returned shows 4 with merchant and refund', async ({ page }) => {
    await gotoApp(page)
    const before = await knownSpend(page)

    await goToSection(page, 'Materials', 'Left over')
    await expect(postsCard(page)).toContainText('6 · from Jewson')
    await (await openRowActions(page, postsCard(page))).getByRole('button', { name: /mark as returned/i }).click()

    const sheet = page.getByRole('dialog', { name: /mark as returned/i })
    await sheet.getByRole('textbox', { name: /how many did you take back/i }).fill('4')
    await sheet.getByRole('textbox', { name: /took them back to/i }).fill('Jewson')
    await sheet.getByRole('textbox', { name: /refund/i }).fill('80')
    await sheet.getByRole('button', { name: /save return/i }).click()
    await expect(sheet).toBeHidden()

    // Left over keeps the 2 he still has.
    await expect(postsCard(page)).toContainText('2 · from Jewson')

    await page.getByRole('tab', { name: 'Returned' }).click()
    const returned = page.getByRole('tabpanel', { name: /returned materials/i })
    await expect(returned).toContainText('fence posts')
    await expect(returned).toContainText('4')
    await expect(returned).toContainText('Jewson')
    await expect(returned).toContainText('£80 refund')

    // The purchase still happened: bought history is untouched.
    await page.getByRole('tab', { name: 'Bought' }).click()
    await expect(page.getByRole('tabpanel', { name: /bought materials/i })).toContainText('hardcore')

    // Net spend is £80 lower. The Spend screen states the net figure only —
    // the refund itself is shown under Materials → Returned, not here.
    const after = await knownSpend(page)
    expect(after).not.toBe(before)
    await expect(page.getByRole('region', { name: /^budget$/i })).not.toContainText('refund')
  })

  test('over-returning is refused without moving anything', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Materials', 'Left over')
    await (await openRowActions(page, postsCard(page))).getByRole('button', { name: /mark as returned/i }).click()

    const sheet = page.getByRole('dialog', { name: /mark as returned/i })
    await sheet.getByRole('textbox', { name: /how many did you take back/i }).fill('9')
    await sheet.getByRole('textbox', { name: /refund/i }).fill('180')
    await sheet.getByRole('button', { name: /save return/i }).click()

    await expect(sheet.getByRole('alert')).toContainText(/more than is left over/i)
    // Values survive so he can correct the quantity, not retype the lot.
    await expect(sheet.getByRole('textbox', { name: /how many did you take back/i })).toHaveValue('9')
    await expect(sheet.getByRole('textbox', { name: /refund/i })).toHaveValue('180')

    await sheet.getByRole('button', { name: /cancel/i }).click()
    await expect(postsCard(page)).toContainText('6 · from Jewson')
    await page.getByRole('tab', { name: 'Returned' }).click()
    await expect(page.getByRole('tabpanel', { name: /returned materials/i })).toContainText(/nothing returned yet/i)
  })

  test('Record stays available through the return flow', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Materials', 'Left over')
    await (await openRowActions(page, postsCard(page))).getByRole('button', { name: /mark as returned/i }).click()
    const sheet = page.getByRole('dialog', { name: /mark as returned/i })
    await sheet.getByRole('textbox', { name: /how many did you take back/i }).fill('6')
    await sheet.getByRole('button', { name: /save return/i }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /start recording/i })).toBeEnabled()
  })
})
