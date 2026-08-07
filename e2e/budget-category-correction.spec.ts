import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — correcting an item's Budget category.
// Mock seed (garden-room job): categories timber / cladding / electrics, with
// plasterboard filed under cladding.
//
// The move redistributes the same cost. The job's overall Budget cost must not
// change, and the Money out row for a paid item must re-caption itself rather
// than a second movement appearing.

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

async function goToSection(page: Page, section: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
}

async function openBudget(page: Page) {
  await goToSection(page, 'Budget')
  const hero = page.getByRole('region', { name: /^budget$/i })
  await expect(hero.locator('.mem-hero-amount')).toContainText(/£[\d,]+ cost/)
  return hero
}

// Category bands start collapsed; rows only exist in the DOM once expanded, so
// any count has to happen after this.
async function expandBand(page: Page, category: RegExp) {
  const band = page.getByRole('region', { name: category })
  const expand = band.getByRole('button', { name: /show items/i })
  if (await expand.isVisible().catch(() => false)) await expand.click()
  return band
}

// Budget → category band → expand → tap the named row → Fix memory.
async function openFixMemory(page: Page, category: RegExp, rowText: string) {
  const band = page.getByRole('region', { name: category })
  const expand = band.getByRole('button', { name: /show items/i })
  if (await expand.isVisible().catch(() => false)) await expand.click()
  await band.locator('.mem-row-tap').filter({ hasText: rowText }).first().click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: /fix memory/i }).click()
  return page.getByRole('form', { name: 'Edit memory' })
}

test.describe('Budget category correction in Fix memory', () => {
  test('a categorised cost item shows its current category and every active one', async ({ page }) => {
    await gotoApp(page)
    await openBudget(page)
    const form = await openFixMemory(page, /budget category cladding/i, 'plasterboard')

    const select = form.getByLabel('Budget category')
    await expect(select).toHaveValue('cat-cladding')
    // Every active category on the job, with the clear option first.
    const options = await select.locator('option').allTextContents()
    expect(options[0]).toBe('Uncategorised')
    expect(options).toEqual(expect.arrayContaining(['timber', 'cladding', 'electrics']))
  })

  test('moving a cost to another category redistributes it without changing the job total', async ({ page }) => {
    await gotoApp(page)
    const hero = await openBudget(page)
    const totalBefore = (await hero.locator('.mem-hero-amount').innerText()).trim()

    const clad = await expandBand(page, /budget category cladding/i)
    const cladRows = clad.locator('.mem-row-tap').filter({ hasText: 'plasterboard' })
    const cladBefore = await cladRows.count()
    expect(cladBefore).toBeGreaterThan(0)

    const form = await openFixMemory(page, /budget category cladding/i, 'plasterboard')
    await form.getByLabel('Budget category').selectOption({ label: 'electrics' })
    await form.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(900)

    // The row now lives under electrics and has left cladding.
    const elec = page.getByRole('region', { name: /budget category electrics/i })
    const expand = elec.getByRole('button', { name: /show items/i })
    if (await expand.isVisible().catch(() => false)) await expand.click()
    await expect(elec.locator('.mem-row-tap').filter({ hasText: 'plasterboard' })).toHaveCount(1)
    await expect(cladRows).toHaveCount(cladBefore - 1)

    // Same money, filed differently.
    await expect(hero.locator('.mem-hero-amount')).toHaveText(totalBefore)
  })

  test('clearing the category files the cost under Uncategorised, total unchanged', async ({ page }) => {
    await gotoApp(page)
    const hero = await openBudget(page)
    const totalBefore = (await hero.locator('.mem-hero-amount').innerText()).trim()

    const form = await openFixMemory(page, /budget category cladding/i, 'plasterboard')
    await form.getByLabel('Budget category').selectOption('')
    await form.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(900)

    const uncat = page.getByRole('region', { name: /uncategorised/i }).first()
    await expect(uncat).toContainText('plasterboard')
    await expect(hero.locator('.mem-hero-amount')).toHaveText(totalBefore)
  })

  test('a paid item keeps its paid state and its single Money out row, re-captioned', async ({ page }) => {
    await gotoApp(page)
    await openBudget(page)

    // Mark the item paid first, so the move has Money context to preserve.
    const clad = page.getByRole('region', { name: /budget category cladding/i })
    const expand = clad.getByRole('button', { name: /show items/i })
    if (await expand.isVisible().catch(() => false)) await expand.click()
    await clad.locator('.mem-row-tap').filter({ hasText: 'plasterboard' }).first().click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: /mark as paid/i }).click()
    await page.waitForTimeout(900)

    await goToSection(page, 'Money')
    await page.waitForTimeout(700)
    const paidRows = page.locator('.money-row').filter({ hasText: 'plasterboard' })
    await expect(paidRows).toHaveCount(1)
    await expect(paidRows.first()).toContainText('cladding')

    await openBudget(page)
    const form = await openFixMemory(page, /budget category cladding/i, 'plasterboard')
    await form.getByLabel('Budget category').selectOption({ label: 'electrics' })
    await form.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(900)

    // Still paid, still exactly one movement — now captioned electrics.
    await goToSection(page, 'Money')
    await page.waitForTimeout(700)
    const movedRows = page.locator('.money-row').filter({ hasText: 'plasterboard' })
    await expect(movedRows).toHaveCount(1)
    await expect(movedRows.first()).toContainText('electrics')
  })

  test('cancelling Fix memory leaves the category where it was', async ({ page }) => {
    await gotoApp(page)
    await openBudget(page)
    const clad = await expandBand(page, /budget category cladding/i)
    const cladRows = clad.locator('.mem-row-tap').filter({ hasText: 'plasterboard' })
    const cladBefore = await cladRows.count()

    const form = await openFixMemory(page, /budget category cladding/i, 'plasterboard')
    await form.getByLabel('Budget category').selectOption({ label: 'electrics' })
    await form.getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(500)

    await expect(cladRows).toHaveCount(cladBefore)
  })
})
