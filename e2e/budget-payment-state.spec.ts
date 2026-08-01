import { expect, test, type Page } from '@playwright/test'

test.use({
  storageState: {
    cookies: [],
    origins: [{
      origin: 'https://localhost:5174',
      localStorage: [{ name: 'job-book-e2e-seed', value: 'payment-state' }],
    }],
  },
})

async function gotoApp(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  await expect(page.getByRole('button', { name: 'Open Budget' })).toBeVisible()
}

async function openBudget(page: Page) {
  await gotoApp(page)
  await page.getByRole('button', { name: 'Open Budget' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Budget' })).toBeVisible()
}

async function goHome(page: Page) {
  await page.getByRole('button', { name: /job home/i }).click()
}

test.describe('Budget payment state and category-aware Money', () => {
  test('uses progressive disclosure for paid, not-paid and mixed categories at 390px', async ({ page }) => {
    await openBudget(page)

    const hero = page.getByRole('region', { name: 'Budget', exact: true })
    const cladding = page.getByRole('region', { name: 'Budget category cladding' })
    const electrics = page.getByRole('region', { name: 'Budget category electrics' })
    const timber = page.getByRole('region', { name: 'Budget category timber' })
    const labour = page.getByRole('region', { name: 'Labour', exact: true })

    await expect(hero).toContainText('£2,270 cost of £7,500')
    await expect(hero.locator('.budget-overall-payment')).toHaveText('£1,630 not paid')
    await expect(hero.locator('.budget-overall-payment')).toHaveCount(1)
    await expect(hero.getByText('Some costs still need a price')).toBeVisible()
    await expect(hero.getByText(/spent/i)).toHaveCount(0)

    await expect(cladding.locator('.budget-payment-state')).toHaveText('Some paid')
    await expect(electrics.locator('.budget-payment-state')).toHaveText('Paid')
    await expect(labour.locator('.budget-payment-state')).toHaveText('Not paid')
    await expect(timber.locator('.budget-payment-state')).toHaveCount(0)

    // Amounts stay hidden in the collapsed scan.
    await expect(cladding.locator('.budget-payment-breakdown')).toHaveCount(0)
    await expect(electrics.locator('.budget-payment-breakdown')).toHaveCount(0)
    await expect(labour.locator('.budget-payment-breakdown')).toHaveCount(0)

    await cladding.getByRole('button', { name: /show items/i }).click()
    const mixed = cladding.locator('.budget-payment-breakdown')
    await expect(mixed.getByText('Paid', { exact: true })).toBeVisible()
    await expect(mixed.getByText('£600', { exact: true })).toHaveCount(2)
    await expect(mixed.getByText('Not paid', { exact: true })).toBeVisible()
    await expect(cladding.locator('.mem-row-paid-tag')).toHaveCount(1)

    await electrics.getByRole('button', { name: /show items/i }).click()
    const allPaid = electrics.locator('.budget-payment-breakdown')
    await expect(allPaid.getByText('£40', { exact: true })).toBeVisible()
    await expect(allPaid.getByText('Not paid', { exact: true })).toHaveCount(0)

    const zeroCost = electrics.locator('.mem-card', { hasText: 'cable offcuts' })
    await zeroCost.getByRole('button', { name: /open actions/i }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: /mark as paid/i })).toHaveCount(0)
    await page.getByRole('dialog').getByRole('button', { name: /close/i }).click()

    await labour.getByRole('button', { name: /show items/i }).click()
    const allNotPaid = labour.locator('.budget-payment-breakdown')
    await expect(allNotPaid.getByText('£880', { exact: true })).toBeVisible()
    await expect(allNotPaid.getByText('Paid', { exact: true })).toHaveCount(0)

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Mark paid and Undo paid change category state and Money, never Budget figures', async ({ page }) => {
    await openBudget(page)
    const hero = page.getByRole('region', { name: 'Budget', exact: true })
    const cladding = page.getByRole('region', { name: 'Budget category cladding' })
    await cladding.getByRole('button', { name: /show items/i }).click()
    const figuresBefore = await cladding.locator('.budget-cat-figures').textContent()
    const mastheadPositionBefore = {
      amount: await hero.locator('.mem-hero-amount').textContent(),
      remaining: await hero.locator('.mem-hero-sub').textContent(),
      bar: await hero.locator('.mem-hero-bar > span').getAttribute('style'),
    }
    await expect(hero.locator('.budget-overall-payment')).toHaveText('£1,630 not paid')

    const plasterboard = cladding.locator('.mem-card', { hasText: 'plasterboard' })
    await expect(plasterboard).toHaveCount(2)
    await plasterboard.nth(1).getByRole('button', { name: /open actions/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /mark as paid/i }).click()

    await expect(cladding.locator('.budget-payment-state')).toHaveText('Paid')
    await expect(hero.locator('.budget-overall-payment')).toHaveText('£1,030 not paid')
    expect(await cladding.locator('.budget-cat-figures').textContent()).toBe(figuresBefore)
    expect({
      amount: await hero.locator('.mem-hero-amount').textContent(),
      remaining: await hero.locator('.mem-hero-sub').textContent(),
      bar: await hero.locator('.mem-hero-bar > span').getAttribute('style'),
    }).toEqual(mastheadPositionBefore)

    await plasterboard.nth(1).getByRole('button', { name: /open actions/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /undo paid/i }).click()

    await expect(cladding.locator('.budget-payment-state')).toHaveText('Some paid')
    await expect(hero.locator('.budget-overall-payment')).toHaveText('£1,630 not paid')
    expect(await cladding.locator('.budget-cat-figures').textContent()).toBe(figuresBefore)
    expect({
      amount: await hero.locator('.mem-hero-amount').textContent(),
      remaining: await hero.locator('.mem-hero-sub').textContent(),
      bar: await hero.locator('.mem-hero-bar > span').getAttribute('style'),
    }).toEqual(mastheadPositionBefore)
  })

  test('marks every remaining known cost paid without hiding missing-price attention', async ({ page }) => {
    await openBudget(page)
    const hero = page.getByRole('region', { name: 'Budget', exact: true })
    const mastheadPositionBefore = await hero.locator('.mem-hero-amount, .mem-hero-sub').allTextContents()

    const cladding = page.getByRole('region', { name: 'Budget category cladding' })
    await cladding.getByRole('button', { name: /show items/i }).click()
    const plasterboard = cladding.locator('.mem-card', { hasText: 'plasterboard' })
    await plasterboard.nth(1).getByRole('button', { name: /open actions/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /mark as paid/i }).click()
    await expect(hero.locator('.budget-overall-payment')).toHaveText('£1,030 not paid')

    const labour = page.getByRole('region', { name: 'Labour', exact: true })
    await labour.getByRole('button', { name: /show items/i }).click()
    for (const [label, expected] of [['electrics', '£750 not paid'], ['roof', '£150 not paid']]) {
      await labour.locator('.mem-card', { hasText: label }).getByRole('button', { name: /open actions/i }).click()
      await page.getByRole('dialog').getByRole('button', { name: /mark as paid/i }).click()
      await expect(hero.locator('.budget-overall-payment')).toHaveText(expected)
    }

    const uncategorised = page.getByRole('region', { name: 'Uncategorised cost' })
    await uncategorised.locator('.mem-card', { hasText: 'agency invoice' }).getByRole('button', { name: /open actions/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /mark as paid/i }).click()

    await expect(hero.locator('.budget-overall-payment')).toHaveText('All known costs paid')
    await expect(hero.getByText(/£0 not paid/i)).toHaveCount(0)
    await expect(hero.getByText('Some costs still need a price')).toBeVisible()
    expect(await hero.locator('.mem-hero-amount, .mem-hero-sub').allTextContents()).toEqual(mastheadPositionBefore)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Add bought item paid-now creates one linked Money row and updates its Budget category', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'Open Materials' }).click()
    await page.getByRole('button', { name: 'Add bought item' }).click()

    const form = page.getByRole('form', { name: 'Add bought item' })
    await expect(form.getByLabel('Already paid')).toHaveCount(0)
    await form.getByLabel('Item').fill('nails')
    await form.getByLabel('Cost (£)').fill('30')
    await expect(form.getByLabel('Already paid')).toBeVisible()
    await form.getByLabel('Budget category').selectOption({ label: 'electrics' })
    await form.getByLabel('Already paid').check()
    await form.getByRole('button', { name: 'Save bought item' }).click()
    await expect(page.getByRole('tabpanel', { name: 'Bought materials' }).getByText('nails', { exact: true })).toBeVisible()

    await goHome(page)
    await page.getByRole('button', { name: 'Open Budget' }).click()
    const electrics = page.getByRole('region', { name: 'Budget category electrics' })
    await expect(electrics.locator('.budget-figure', { hasText: 'Cost' }).getByText('£70', { exact: true })).toBeVisible()
    await expect(electrics.locator('.budget-payment-state')).toHaveText('Paid')

    await goHome(page)
    await page.getByRole('button', { name: 'Open Money' }).click()
    await page.getByRole('tab', { name: 'Money out' }).click()
    const nails = page.locator('.money-row', { hasText: 'nails' })
    await expect(nails).toHaveCount(1)
    await expect(nails.getByText('electrics', { exact: true })).toBeVisible()
    await expect(nails.getByText('-£30', { exact: true })).toBeVisible()
  })

  test('Money stays chronological and date-grouped while showing current category context', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'Open Money' }).click()
    await page.getByRole('tab', { name: 'Money out' }).click()

    const panel = page.getByRole('tabpanel', { name: 'Money' })
    await expect(panel.locator('.money-day')).toHaveCount(2)
    await expect(panel.locator('.money-row', { hasText: 'plasterboard' }).getByText('cladding', { exact: true })).toBeVisible()
    await expect(panel.locator('.money-row', { hasText: 'hardcore' }).getByText('electrics', { exact: true })).toBeVisible()
    await expect(panel.locator('.money-row', { hasText: 'Plant hire' }).getByText('Uncategorised', { exact: true })).toBeVisible()
    await expect(panel.locator('.budget-cat')).toHaveCount(0)

    const labels = await panel.locator('.money-row-label').allTextContents()
    expect(labels).toEqual(['plasterboard', 'hardcore', 'Plant hire'])
  })
})
