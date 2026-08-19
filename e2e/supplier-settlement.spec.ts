import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — settling one named supplier account across
// several jobs, in the real app: tick, mark paid, read the receipt, follow it
// into the job it hit, change the date, undo it, and find it again in history
// after the account it emptied has gone.
//
// The mock backend is stateful, so every assertion after a payment is a read of
// what that payment actually did.

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

async function seed(page: Page, scenario: string) {
  await page.addInitScript(value => {
    localStorage.setItem('job-book-e2e-seed', value as string)
  }, scenario)
}

async function openMoney(page: Page) {
  await page.getByRole('button', { name: /the job book/i }).click()
  await expect(page.getByRole('heading', { name: 'The Job Book' })).toBeVisible()
  await page.getByRole('button', { name: /^Money/ }).click()
  await expect(page.getByRole('heading', { name: /^Money/ })).toBeVisible()
}

async function openAccount(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(`^Open ${name},`) }).click()
  await expect(page.getByRole('heading', { name: new RegExp(name) })).toBeVisible()
}

function tick(page: Page, label: string) {
  return page.getByRole('checkbox', { name: new RegExp(`^Include ${label}`) })
}

function bar(page: Page) {
  return page.getByRole('group', { name: 'Record a payment' })
}

// Nothing on the page may push the phone sideways — including the sticky bar.
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('Supplier account settlement', () => {
  test('tick, mark paid, and read what the payment covered', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    // Nothing is selected until Mike says so, and the account total stands.
    await expect(page.getByText('Tick what a payment covers')).toBeVisible()
    await expect(bar(page)).toContainText('Nothing selected')
    await expect(bar(page)).toContainText('£4,450 on the account')
    await expect(bar(page).getByRole('button', { name: 'Mark paid' })).toBeDisabled()
    await expectNoHorizontalOverflow(page)

    await tick(page, 'Timber, 3 packs').click()
    await tick(page, 'Fence posts, 20').click()
    await expect(bar(page)).toContainText('2 selected · 2 jobs')
    await expect(bar(page)).toContainText('£1,140 left unpaid')
    await expectNoHorizontalOverflow(page)

    await bar(page).getByRole('button', { name: 'Mark £3,310 paid' }).click()

    const receipt = page.getByRole('dialog', { name: '£3,310 to Sydenhams' })
    await expect(receipt).toBeVisible()
    await expect(receipt).toContainText('Covers 2 recorded costs on 2 jobs. Budgets unchanged.')
    await expect(receipt.getByRole('button', { name: /Open Money for Kitchen Extension/ })).toContainText('-£3,000')
    await expect(receipt.getByRole('button', { name: /Open Money for Whitmore Patio/ })).toContainText('-£310')
    await expectNoHorizontalOverflow(page)

    // Back on the account, only what is still unpaid remains.
    await receipt.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('heading', { name: /£1,140/ })).toBeVisible()
    await expect(tick(page, 'Timber, 3 packs')).toHaveCount(0)
  })

  test('Select all offers the whole account, and Clear takes it back', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    await page.getByRole('button', { name: 'Select all' }).click()
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(6)
    // Said as what it is, never "cleared", "settled" or "reconciled".
    await expect(bar(page)).toContainText('No recorded costs left unpaid')
    await expect(bar(page).getByRole('button', { name: 'Mark £4,450 paid' })).toBeEnabled()

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(0)
    await expect(bar(page)).toContainText('Nothing selected')
  })

  test('the affected job shows the payment once, as its own share', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')
    await tick(page, 'Timber, 3 packs').click()
    await tick(page, 'Roof battens, bundle').click()
    await bar(page).getByRole('button', { name: /^Mark .* paid$/ }).click()

    const receipt = page.getByRole('dialog', { name: /to Sydenhams$/ })
    await receipt.getByRole('button', { name: /Open Money for Kitchen Extension/ }).click()

    // One row, worth this job's two costs — not the payment, and not twice.
    const money = page.getByRole('tabpanel', { name: 'Money' })
    await expect(money).toBeVisible()
    await expect(money.getByText('Sydenhams')).toHaveCount(1)
    await expect(money.getByText('-£3,250')).toHaveCount(1)
    await expect(money.getByText('Roof battens, bundle · Timber, 3 packs')).toBeVisible()
    // It cannot be unpicked one cost at a time from here.
    await expect(money.getByRole('button', { name: /undo paid/i })).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })

  test('history keeps the receipt after the account has nothing left unpaid', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Travis Perkins')
    await page.getByRole('button', { name: 'Select all' }).click()
    await bar(page).getByRole('button', { name: /^Mark .* paid$/ }).click()
    await page.getByRole('dialog', { name: /to Travis Perkins$/ })
      .getByRole('button', { name: 'Done' }).click()

    // The account is gone from "to pay"; history is the way back to the receipt.
    await expect(page.getByRole('button', { name: /^Open Travis Perkins,/ })).toHaveCount(0)
    const history = page.getByRole('region', { name: 'Account payment history' })
    await expect(history).toBeVisible()
    await history.getByRole('button', { name: /payment to Travis Perkins$/ }).click()
    await expect(page.getByRole('dialog', { name: '£460 to Travis Perkins' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('the date can be corrected, and the payment undone whole', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')
    await tick(page, 'Sand, 4 tonne').click()
    await bar(page).getByRole('button', { name: /^Mark .* paid$/ }).click()

    const receipt = page.getByRole('dialog', { name: '£300 to Sydenhams' })
    await receipt.getByRole('button', { name: /^Change payment date/ }).click()
    const field = page.getByLabel('Date paid')
    await expect(field).toHaveAttribute('max', new Date().toISOString().slice(0, 10))
    await field.fill('2026-08-10')
    await page.getByRole('button', { name: 'Save date' }).click()
    await expect(page.getByRole('dialog', { name: '£300 to Sydenhams' })).toContainText('Paid · Mon 10 Aug')

    // Undo is the whole payment, and says so before it happens.
    await page.getByRole('button', { name: /^Undo this payment/ }).click()
    await expect(page.getByText(/All 1 cost goes back on the Sydenhams account/)).toBeVisible()
    await expect(page.getByText('Budgets stay unchanged.')).toBeVisible()
    await page.getByRole('button', { name: 'Undo this payment' }).click()

    // The account is whole again and history is empty.
    await expect(page.getByRole('heading', { name: /£4,450/ })).toBeVisible()
    await expect(tick(page, 'Sand, 4 tonne')).toBeVisible()
    await page.getByRole('button', { name: /back to money/i }).click()
    await expect(page.getByRole('region', { name: 'Account payment history' })).toHaveCount(0)
  })

  // Settlement is switched on by backend config while real-account validation is
  // outstanding. Reading Money must survive it being off.

  test('no settlement controls when the backend says the feature is off', async ({ page }) => {
    await seed(page, 'book-money-settlement-off')
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    await expect(page.locator('input[type=checkbox]')).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /select all|mark .*paid/i })).toHaveCount(0)
    await expect(page.getByRole('status'))
      .toContainText('Recording a payment on an account isn’t switched on yet.')

    // The account itself still reads exactly as it did before settlement existed.
    await expect(page.getByText('Recorded costs')).toBeVisible()
    await expect(page.getByRole('heading', { name: /£4,450/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Open Fence posts/ })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('fails closed when the backend publishes no capability', async ({ page }) => {
    await seed(page, 'book-money-settlement-unpublished')
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    // Silence is not permission.
    await expect(page.locator('input[type=checkbox]')).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    await expect(page.getByText('Recorded costs')).toBeVisible()
  })

  test('a write refused mid-session withdraws the controls', async ({ page }) => {
    // The capability said yes; the gate went off before the payment was sent.
    await seed(page, 'book-money-settlement-revoked')
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    await page.getByRole('checkbox', { name: /^Include Timber, 3 packs/ }).click()
    await bar(page).getByRole('button', { name: /^Mark .* paid$/ }).click()

    await expect(page.getByRole('status'))
      .toContainText('Recording a payment on an account isn’t switched on yet.')
    await expect(page.locator('input[type=checkbox]')).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    // Nothing was recorded, so nothing left the account.
    await expect(page.getByRole('heading', { name: /£4,450/ })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('Supplier needed and missing-price costs cannot be settled', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)

    // Costs with no price have one route, and it is adding the price.
    const missing = page.getByRole('group', { name: /no price yet/i })
    await expect(missing.locator('input[type=checkbox]')).toHaveCount(0)
    await expect(missing.getByRole('button', { name: /^Add price for / }).first()).toBeVisible()

    await openAccount(page, 'Supplier needed')
    await expect(page.getByText('Recorded costs')).toBeVisible()
    await expect(page.locator('input[type=checkbox]')).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /select all|mark .*paid/i })).toHaveCount(0)
  })
})

test.describe('Supplier payment source dates', () => {
  // Mike's case: one MKM-style account, two timber buys a week apart, and one
  // cost nobody dated. The receipt has to let him tell all three apart and
  // match the single combined payment back to a bank statement.
  const BIG = 'Timber, 3 packs'
  const SMALL = 'Timber, 2 packs'
  const UNDATED = 'Membrane, 2 rolls'

  function line(receipt: ReturnType<Page['getByRole']>, item: string) {
    return receipt.getByRole('button', { name: new RegExp(`^Open ${item} on `) })
  }

  async function settle(page: Page, items: string[]) {
    for (const item of items) await tick(page, item).click()
    await bar(page).getByRole('button', { name: /^Mark .* paid$/ }).click()
    const receipt = page.getByRole('dialog', { name: /to Sydenhams$/ })
    await expect(receipt).toBeVisible()
    return receipt
  }

  test('every source line carries its purchase date, and only the receipt says Paid', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    const receipt = await settle(page, [BIG, SMALL, UNDATED])

    // The two timber buys are finally distinguishable.
    const bigText = await line(receipt, BIG).innerText()
    const smallText = await line(receipt, SMALL).innerText()
    expect(bigText).not.toBe(smallText)
    await expect(line(receipt, BIG).locator('.sap-source-date')).not.toBeEmpty()
    await expect(line(receipt, SMALL).locator('.sap-source-date')).not.toBeEmpty()

    // A cost with no date says so rather than borrowing the payment's.
    await expect(line(receipt, UNDATED)).toContainText('Date not recorded')

    // One Paid stamp on the whole receipt — the payment's own.
    await expect(receipt.getByText(/^Paid · /)).toBeVisible()
    for (const item of [BIG, SMALL, UNDATED]) {
      await expect(line(receipt, item)).not.toContainText('Paid')
    }
    await expectNoHorizontalOverflow(page)
  })

  test('changing the payment date moves the header and nothing else', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    const receipt = await settle(page, [BIG, SMALL])
    const before = await Promise.all([BIG, SMALL].map(i => line(receipt, i).innerText()))

    await receipt.getByRole('button', { name: /Change payment date/ }).click()
    const form = page.getByRole('form', { name: 'Change payment date' })
    await form.getByLabel('Date paid').fill('2026-08-10')
    await form.getByRole('button', { name: 'Save date' }).click()

    const after = page.getByRole('dialog', { name: /to Sydenhams$/ })
    await expect(after).toContainText('Paid · Mon 10 Aug')
    expect(await Promise.all([BIG, SMALL].map(i => line(after, i).innerText()))).toEqual(before)
  })

  test('a receipt reopened from history still carries the dated breakdown', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    await openAccount(page, 'Sydenhams')

    const receipt = await settle(page, [BIG, UNDATED])
    const dated = await line(receipt, BIG).innerText()
    await receipt.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: /back to money/i }).click()

    const history = page.getByRole('region', { name: 'Account payment history' })
    await history.getByRole('button', { name: /payment to Sydenhams$/ }).click()

    const reopened = page.getByRole('dialog', { name: /to Sydenhams$/ })
    expect(await line(reopened, BIG).innerText()).toBe(dated)
    await expect(line(reopened, UNDATED)).toContainText('Date not recorded')
    await expectNoHorizontalOverflow(page)
  })

  test('a long item label keeps date, item and amount readable at phone width', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)
    // The longest job and item names in the book ride on this account.
    await openAccount(page, 'Travis Perkins')

    const receipt = await settle2(page)
    await expect(receipt.locator('.sap-source-date').first()).not.toBeEmpty()
    await expect(receipt.locator('.sap-source-amount').first()).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  async function settle2(page: Page) {
    await page.getByRole('button', { name: 'Select all' }).click()
    await bar(page).getByRole('button', { name: /^Mark .* paid$/ }).click()
    const receipt = page.getByRole('dialog', { name: /to Travis Perkins$/ })
    await expect(receipt).toBeVisible()
    return receipt
  }
})
