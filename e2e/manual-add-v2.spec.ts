import { test, expect, type Page } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390×844, VITE_USE_MOCK_API=true — Manual Add V2 / direct add refinement.
// Direct add opens in an in-context bottom sheet; Spend category cards add
// with the category preselected; the fixed/global Record bar is the only
// voice entry point.

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

test.describe('Manual Add V2', () => {
  test('spend direct add opens in a bottom sheet and saves', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Add cost', exact: true }).click()

    const sheet = page.getByRole('dialog', { name: 'Add cost' })
    await expect(sheet).toBeVisible()
    // no drag/swipe handle — dismissal is ×, backdrop, Escape only
    await expect(page.locator('.bottom-sheet-handle')).toHaveCount(0)
    // opening must not auto-focus a field (no surprise mobile keyboard)
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY')
    expect(['INPUT', 'TEXTAREA', 'SELECT']).not.toContain(activeTag)
    const form = sheet.getByRole('form', { name: 'Add cost' })
    await form.locator('input[name="materialName"]').fill('composite decking')
    await form.locator('input[name="costAmount"]').fill('240')
    await form.getByRole('button', { name: /^Save / }).click()
    await page.waitForTimeout(800)

    // sheet closed, item in the section, workspace state intact
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('composite decking')).toBeVisible()
  })

  test('category card add preselects the category and the item lands in it', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)

    // electrics is a seeded category with no spend — its empty state offers the add
    const card = page.getByRole('region', { name: /budget category electrics/i })
    await expect(card.getByText('Nothing yet')).toBeVisible()
    await card.getByRole('button', { name: 'Add to electrics' }).click()

    const sheet = page.getByRole('dialog', { name: 'Add cost — electrics' })
    await expect(sheet).toBeVisible()
    // category is preselected and visible (changeable through the same select)
    await expect(sheet.getByLabel('Budget category')).toHaveValue('cat-electrics')
    const form = sheet.getByRole('form', { name: 'Add cost' })
    await form.locator('input[name="materialName"]').fill('consumer unit')
    await form.locator('input[name="costAmount"]').fill('180')
    await form.getByRole('button', { name: /^Save / }).click()
    await page.waitForTimeout(900)

    // saved with the category → shows inside the electrics card per backend summary
    await expect(card.locator('.budget-figure', { hasText: 'Cost' }).getByText('£180', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: /show items/i }).click()
    await expect(card.getByText('consumer unit')).toBeVisible()
  })

  test('closing the sheet returns to the same section state', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)
    // expand a category's notes first
    const cladding = page.getByRole('region', { name: /budget category cladding/i })
    await cladding.getByRole('button', { name: /show items/i }).click()
    await expect(cladding.getByText('plasterboard').first()).toBeVisible()

    await page.getByRole('button', { name: 'Add cost', exact: true }).click()
    await page.getByRole('dialog', { name: 'Add cost' }).getByRole('button', { name: 'Close' }).click()
    // the expanded notes are still expanded — no section state lost
    await expect(cladding.getByText('plasterboard').first()).toBeVisible()
  })

  test('the global Record bar is the only voice action; empty states offer manual add only', async ({ page }) => {
    await gotoApp(page)
    for (const tab of ['Budget', 'Labour', 'Used', 'Notes']) {
      if (tab === 'Used') await goToSection(page, 'Materials', 'Used')
      else if (tab === 'Notes') await goToSection(page, 'Job log', 'Notes')
      else await goToSection(page, tab)
      await page.waitForTimeout(500)
      // exactly one record affordance on the page: the pinned global bar
      await expect(page.locator('.ws-record-bar')).toHaveCount(1)
      await expect(page.getByRole('button', { name: /record/i })).toHaveCount(1)
      await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
      // no bare "+" buttons anywhere — every add action names what it adds
      await expect(page.locator('.btn-lens-add')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '+', exact: true })).toHaveCount(0)
    }
  })
})
