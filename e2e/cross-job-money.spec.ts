import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — cross-job Money, read only: the Book Home
// row, the Money page, one supplier account, and the routes back to the job
// that owns each fact. The mock read model does the arithmetic a backend would,
// so the figures asserted here are the response's own.

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

async function openBookHome(page: Page) {
  await page.getByRole('button', { name: /the job book/i }).click()
  await expect(page.getByRole('heading', { name: 'The Job Book' })).toBeVisible()
}

async function openMoney(page: Page) {
  await openBookHome(page)
  await page.getByRole('button', { name: /^Money/ }).click()
  await expect(page.getByRole('heading', { name: /^Money/ })).toBeVisible()
}

// Nothing on the page may push the phone sideways.
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

// The controls this page deliberately still does not have. Settling a named
// supplier account is the one write it gained (see supplier-settlement.spec.ts);
// renaming, merging and part-paying remain absent — not disabled, absent, so
// nothing promises a feature that does not exist.
async function expectNoAccountEditing(page: Page) {
  await expect(page.getByRole('button', { name: /rename or merge|reconcile|part pay/i })).toHaveCount(0)
}

test.describe('Cross-job Money (read-only)', () => {
  test('Book Home carries one Money row, and it opens the Money page', async ({ page }) => {
    await gotoApp(page)
    await openBookHome(page)

    const row = page.getByRole('button', { name: /^Money/ })
    await expect(row).toContainText('Across all jobs')
    await expect(row).toContainText('still to receive')
    await expect(row).toContainText('to pay on accounts')
    await expectNoHorizontalOverflow(page)

    await row.click()
    await expect(page.getByRole('region', { name: 'To pay on accounts' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Still to receive' })).toBeVisible()
    // no tabs, and no settlement controls on the overview — a payment is
    // recorded inside one named account, never across the whole page
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.locator('input[type=checkbox]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /select all|mark .*paid/i })).toHaveCount(0)
    await expectNoAccountEditing(page)
    await expectNoHorizontalOverflow(page)
  })

  test('the Book Home figures are the Money page figures', async ({ page }) => {
    await gotoApp(page)
    await openBookHome(page)

    await expect(page.getByRole('button', { name: /^Money/ })).toContainText('to pay on accounts')
    const lines = await page.locator('.book-dest-line').allTextContents()
    const owedRow = lines.find(l => /still to receive/.test(l))!
    const payRow = lines.find(l => /to pay on accounts/.test(l))!

    await page.getByRole('button', { name: /^Money/ }).click()
    const payTotal = await page.getByRole('region', { name: 'To pay on accounts' }).locator('.bm-total').textContent()
    // The owed total's line also carries the job count — compare the figure.
    const owedTotal = (await page.getByRole('region', { name: 'Still to receive' }).locator('.bm-total').textContent())!.split(' · ')[0]

    expect(payRow).toContain(payTotal!.trim())
    expect(owedRow).toContain(owedTotal.trim())
  })

  test('one direction alone renders alone', async ({ page }) => {
    await seed(page, 'book-money-to-pay-only')
    await gotoApp(page)
    await openBookHome(page)

    const row = page.getByRole('button', { name: /^Money/ })
    await expect(row).toContainText('to pay on accounts')
    await expect(row).not.toContainText('still to receive')

    await row.click()
    await expect(page.getByRole('region', { name: 'To pay on accounts' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Still to receive' })).toHaveCount(0)
    await expect(page.getByText('£0')).toHaveCount(0)
  })

  test('no Money row at all when nothing is outstanding', async ({ page }) => {
    await seed(page, 'book-money-none')
    await gotoApp(page)
    await openBookHome(page)

    await expect(page.getByRole('button', { name: /^Money/ })).toHaveCount(0)
    await expect(page.getByText(/£0|nothing owed|nothing to pay|settled/i)).toHaveCount(0)
    // the other destinations are untouched by Money having nothing to say
    await expect(page.getByRole('button', { name: /^Jobs/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Workshop/ })).toBeVisible()
  })

  test('a cost with no price is the whole reason to open Money', async ({ page }) => {
    await seed(page, 'book-money-missing-price-only')
    await gotoApp(page)
    await openBookHome(page)

    const row = page.getByRole('button', { name: /^Money/ })
    await expect(row).toContainText('1 cost needs a price')
    await row.click()

    // No supplier total to state, and certainly not £0.
    await expect(page.getByRole('group', { name: /no price yet/i })).toContainText('1 cost has no price yet')
    await expect(page.locator('.bm-total')).toHaveCount(0)
  })

  test('a supplier account lists its costs oldest first, and long names wrap', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)

    // Named accounts, largest first, with "Supplier needed" last.
    const names = await page.locator('.bm-row-name').allTextContents()
    expect(names.slice(0, 2)).toEqual(['Sydenhams', 'Jewson'])
    // exact distinct names stay distinct
    expect(names).toContain("Sydenham's")
    expect(names).toContain('Sydenhams Ltd')
    expect(names).toContain('Supplier needed')

    await page.getByRole('button', { name: /^Open Sydenhams,/ }).click()
    await expect(page.getByRole('heading', { name: /Sydenhams/ })).toBeVisible()
    await expect(page.getByText(/To pay · 6 purchases · 3 jobs/)).toBeVisible()
    await expectNoAccountEditing(page)
    await expectNoHorizontalOverflow(page)

    // A finished job whose account is still open says so.
    await expect(page.getByRole('button', { name: /Fence posts/ })).toContainText('finished job')

    // The longest job name in the book, on a supplier line, at 390px.
    await page.getByRole('button', { name: /back to money/i }).click()
    await page.getByRole('button', { name: /^Open Travis Perkins,/ }).click()
    await expect(page.getByRole('button', { name: /^Open Skirting/ }))
      .toContainText('Full re-roof and rear extension at the Hollybush Farmhouse annexe')
    await expectNoHorizontalOverflow(page)
  })

  test('a supplier line opens the source item in the source job', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)

    await page.getByRole('button', { name: /^Open Jewson,/ }).click()
    await page.getByRole('button', { name: /^Open Hardcore, 8 bags on Garden Room/ }).click()

    // The Garden Room's Budget, with that cost's action drawer already open —
    // the correction is the reason Mike tapped.
    await expect(page.locator('.ws-job-title')).toHaveText('Budget')
    await expect(page.locator('.ws-job-location')).toHaveText('Garden Room')
    const drawer = page.getByRole('dialog').first()
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText('hardcore')
    // Correcting the fact happens here, in the job — never on the Money page.
    await expect(drawer.getByRole('button', { name: /fix memory/i })).toBeVisible()
  })

  test('a missing-price cost routes to its source correction path', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)

    // An untrusted price keeps this cost out of Budget entirely, so Budget is
    // not where it can be corrected: the job routes it to Materials → Bought,
    // where the item is listed and its price can be added.
    await page.getByRole('button', { name: /Add price for Insulation/ }).click()
    await expect(page.locator('.ws-job-title')).toHaveText('Materials')
    await expect(page.locator('.ws-job-location')).toHaveText('Garden Room')
    const drawer = page.getByRole('dialog').first()
    await expect(drawer).toContainText('insulation')
    await expect(drawer.getByRole('button', { name: /fix memory/i })).toBeVisible()
  })

  test('an owed row opens that job’s Money', async ({ page }) => {
    await gotoApp(page)
    await openMoney(page)

    await page.getByRole('button', { name: /Open Money for Kitchen Extension/ }).click()
    await expect(page.locator('.ws-job-title')).toHaveText('Money')
    await expect(page.locator('.ws-job-location')).toHaveText('Kitchen Extension')
  })
})
