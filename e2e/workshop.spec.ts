import { test, expect, type Page, type Locator } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — Workshop: the Book Home row, the Workshop
// page, moving a real leftover in from an active and a finished job, and the
// three corrections that take it back out again.
//
// What this spec is really guarding is what Workshop must never become: a
// stock system that claims exact quantities, or a money surface. So alongside
// the flows it asserts the absences — no figures, no Record bar, no voice copy
// — and it reads Budget's own figures back off the job before and after a move.

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

// Book Home is one level up from wherever we are: a job section goes back to
// job home first, since only job home carries the route out of the job.
async function openBookHome(page: Page) {
  if (await page.getByRole('heading', { name: 'The Job Book' }).count()) return
  const jobHome = page.getByRole('button', { name: /job home/i })
  if (await jobHome.count()) await jobHome.first().click()
  await page.getByRole('button', { name: /the job book/i }).click()
  await expect(page.getByRole('heading', { name: 'The Job Book' })).toBeVisible()
}

async function openWorkshop(page: Page) {
  await openBookHome(page)
  await page.getByRole('button', { name: /^Workshop/ }).click()
  await expect(page.getByRole('heading', { name: /^Workshop/ })).toBeVisible()
}

async function openJob(page: Page, title: string) {
  await openBookHome(page)
  const inList = page.getByRole('button', { name: new RegExp(`^${title}`) })
  if (await inList.count()) {
    await inList.first().click()
  } else {
    // Finished jobs live behind All jobs, under their own heading.
    await page.getByRole('button', { name: 'All jobs', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(`^${title}`) }).first().click()
  }
  await expect(page.getByRole('button', { name: /the job book/i })).toBeVisible()
}

async function openLeftovers(page: Page) {
  await page.getByRole('button', { name: 'Open Materials' }).click()
  await page.getByRole('tab', { name: 'Left over' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Left over materials' })).toBeVisible()
}

function leftoverRow(page: Page, name: string): Locator {
  return page.getByRole('button', { name: `Open actions for ${name}` })
}

async function openLeftoverDrawer(page: Page, name: string): Promise<Locator> {
  await leftoverRow(page, name).click()
  return page.getByRole('dialog').first()
}

// Nothing on the page may push the phone sideways.
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

const GARDEN = 'Garden Room'
const WHITMORE = 'Whitmore Patio'

test.describe('Workshop', () => {
  test('Book Home shows the count and a preview of what is in there', async ({ page }) => {
    await gotoApp(page)
    await openBookHome(page)

    await expect(page.getByRole('button', { name: /^Workshop.*6 things/ })).toBeVisible()
    const preview = page.locator('.book-workshop-preview')
    await expect(preview.getByRole('listitem')).toHaveCount(3)
    await expect(preview).toContainText('OSB')
    await expect(preview).toContainText('about 3 sheets')
    await expectNoHorizontalOverflow(page)
  })

  test('an empty Workshop keeps a bare route, with no zero and no Record', async ({ page }) => {
    await seed(page, 'workshop-empty')
    await gotoApp(page)
    await openBookHome(page)

    const row = page.getByRole('button', { name: /^Workshop/ })
    await expect(row).toBeVisible()
    await expect(row).not.toContainText('0')
    await expect(page.locator('.book-workshop-preview')).toHaveCount(0)

    await openWorkshop(page)
    await expect(page.getByText('Nothing in the workshop yet')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add one by hand/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /record/i })).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })

  test('the list is newest first, keeps rough words, and carries no money or Record', async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)

    const names = await page.locator('.ws-row-name').allTextContents()
    expect(names).toEqual(['OSB', 'Screws, 5.0×80', 'Sand', 'Membrane', 'Insulation, 100mm', 'Fence posts'])

    // Rough means rough — never parsed, never sharpened.
    await expect(page.getByText('about 3 sheets')).toBeVisible()
    await expect(page.getByText('part of a roll')).toBeVisible()
    await expect(page.getByText('4 or 5')).toBeVisible()
    // The item with no rough amount shows no amount at all.
    const insulation = page.getByRole('button', { name: 'Open Insulation, 100mm' })
    await expect(insulation.locator('.ws-row-amount')).toHaveCount(0)
    // Provenance, including a finished source job.
    await expect(page.getByRole('button', { name: 'Open Sand' })).toContainText('Added by hand')
    await expect(page.getByRole('button', { name: 'Open Fence posts' })).toContainText('finished job')

    // Not a money surface, and not a voice surface.
    await expect(page.locator('.book-page')).not.toContainText('£')
    await expect(page.getByRole('button', { name: /record/i })).toHaveCount(0)
    await expect(page.locator('.book-page')).not.toContainText(/stock check/i)
    await expectNoHorizontalOverflow(page)
  })

  test('moves a leftover in from an active job and leaves Budget exactly as it was', async ({ page }) => {
    await gotoApp(page)
    await openJob(page, GARDEN)

    // Budget's own figure, before anything moves.
    await page.getByRole('button', { name: 'Open Budget' }).click()
    const budgetBefore = await page.locator('.mem-tabpanel').innerText()
    await page.getByRole('button', { name: /job home/i }).click()

    await openLeftovers(page)
    const drawer = await openLeftoverDrawer(page, 'fence posts')
    const move = drawer.getByRole('button', { name: /Move to the Workshop/ })
    await expect(move).toContainText('No new cost. Budget and Money stay as they are.')
    await move.click()

    const result = page.getByRole('dialog', { name: /Moved to the Workshop/ })
    await expect(result).toContainText('fence posts')
    await expect(result).toContainText(`From ${GARDEN}`)
    // No totals in the result: the consequence was stated once, on the action.
    await expect(result).not.toContainText('£')
    await result.getByRole('button', { name: 'Done' }).click()

    await expect(leftoverRow(page, 'fence posts')).toContainText('IN WORKSHOP')

    await page.getByRole('button', { name: /job home/i }).click()
    await page.getByRole('button', { name: 'Open Budget' }).click()
    expect(await page.locator('.mem-tabpanel').innerText()).toBe(budgetBefore)
  })

  test('moves a leftover in from a Finished job without reopening the job', async ({ page }) => {
    await gotoApp(page)
    await openJob(page, WHITMORE)
    await openLeftovers(page)

    const drawer = await openLeftoverDrawer(page, 'Gravel boards')
    await drawer.getByRole('button', { name: /Move to the Workshop/ }).click()
    const result = page.getByRole('dialog', { name: /Moved to the Workshop/ })
    await expect(result).toContainText('Gravel boards · a couple')

    // "See in the Workshop" is a real route to the real list.
    await result.getByRole('button', { name: /See in the Workshop/ }).click()
    await expect(page.getByRole('heading', { name: /^Workshop/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Gravel boards' })).toBeVisible()

    // The job is still finished.
    await openBookHome(page)
    await page.getByRole('button', { name: 'All jobs', exact: true }).click()
    const finished = page.getByRole('region', { name: 'Finished' })
    await expect(finished.getByRole('button', { name: new RegExp(WHITMORE) })).toBeVisible()
  })

  test('the same leftover is not offered to the Workshop twice', async ({ page }) => {
    await gotoApp(page)
    await openJob(page, WHITMORE)
    await openLeftovers(page)

    // Fence posts is seeded as already in there.
    const drawer = await openLeftoverDrawer(page, 'Fence posts')
    await expect(drawer.getByRole('button', { name: /Move to the Workshop/ })).toHaveCount(0)
    await expect(leftoverRow(page, 'Fence posts')).toContainText('IN WORKSHOP')
  })

  test('adds by hand from two fields and nothing else', async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)
    await page.getByRole('button', { name: 'Add by hand' }).click()

    const form = page.getByRole('form', { name: 'Add by hand' })
    await expect(form.getByRole('textbox')).toHaveCount(2)
    await expect(form).not.toContainText(/supplier|price|categor|location/i)

    await form.getByLabel('What it is').fill('Insulation, 50mm')
    await form.getByLabel('Rough amount (optional)').fill('a couple of packs')
    await form.getByRole('button', { name: 'Add to the workshop' }).click()

    const row = page.getByRole('button', { name: 'Open Insulation, 50mm' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('a couple of packs')
    await expect(row).toContainText('Added by hand')
    await expect(page.getByRole('button', { name: /^Workshop/ })).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })

  test('changes what is there and keeps the approximate words', async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)
    await page.getByRole('button', { name: 'Open OSB' }).click()

    await page.getByRole('dialog').getByRole('button', { name: /Change what's there/ }).click()
    const form = page.getByRole('form', { name: "Change what's there" })
    await form.getByLabel('Rough amount').fill('maybe 2, could be 3')
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('button', { name: 'Open OSB' })).toContainText('maybe 2, could be 3')
  })

  test('all used up removes it from the list and offers an immediate Undo', async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)
    await page.getByRole('button', { name: 'Open Membrane' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /All used up/ }).click()

    const result = page.getByRole('dialog', { name: 'All used up' })
    await expect(result).toContainText('Membrane · part of a roll')
    await expect(page.getByRole('button', { name: 'Open Membrane' })).toHaveCount(0)

    await result.getByRole('button', { name: /^Undo/ }).click()
    await expect(page.getByRole('button', { name: 'Open Membrane' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Membrane' })).toContainText('part of a roll')
  })

  test("wasn't there after all is a different outcome, with its own Undo", async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)
    await page.getByRole('button', { name: 'Open Sand' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Wasn't there after all/ }).click()

    const result = page.getByRole('dialog', { name: /Wasn.t there after all/ })
    await expect(result).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Sand' })).toHaveCount(0)

    await result.getByRole('button', { name: /^Undo/ }).click()
    await expect(page.getByRole('button', { name: 'Open Sand' })).toBeVisible()
  })

  test('a hand-added item has no source actions; a source-linked one does', async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)

    await page.getByRole('button', { name: 'Open Sand' }).click()
    const manual = page.getByRole('dialog')
    await expect(manual.getByRole('button', { name: /Change what's there/ })).toBeVisible()
    await expect(manual.getByRole('button', { name: /^Open / })).toHaveCount(0)
    await expect(manual.getByRole('button', { name: /Undo move/ })).toHaveCount(0)
    await manual.locator('.row-sheet-cancel').click()

    await page.getByRole('button', { name: 'Open OSB' }).click()
    const linked = page.getByRole('dialog')
    await expect(linked.getByRole('button', { name: /Open Kitchen Extension/ })).toBeVisible()
    await expect(linked.getByRole('button', { name: /Undo move to the Workshop/ })).toBeVisible()
  })

  test('opens the source job at the leftover it came from', async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)
    await page.getByRole('button', { name: 'Open OSB' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Open Kitchen Extension/ }).click()

    await expect(page.getByRole('tabpanel', { name: 'Left over materials' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: /OSB/ })).toBeVisible()
  })

  test('undoing a move returns the material to its job alone', async ({ page }) => {
    await gotoApp(page)
    await openWorkshop(page)
    await page.getByRole('button', { name: 'Open OSB' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Undo move to the Workshop/ }).click()

    await expect(page.getByRole('button', { name: 'Open OSB' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Workshop/ })).toHaveCount(0)

    await openJob(page, 'Kitchen Extension')
    await openLeftovers(page)
    await expect(leftoverRow(page, 'OSB')).not.toContainText('IN WORKSHOP')
    const drawer = await openLeftoverDrawer(page, 'OSB')
    await expect(drawer.getByRole('button', { name: /Move to the Workshop/ })).toBeVisible()
  })

  test('a terminal outcome stays correctable from its source job', async ({ page }) => {
    await gotoApp(page)
    await openJob(page, WHITMORE)
    await openLeftovers(page)

    // Seeded as corrected, in words rather than by fading the row out.
    await expect(leftoverRow(page, 'Cement board')).toContainText("WASN'T THERE")

    const drawer = await openLeftoverDrawer(page, 'Cement board')
    await drawer.getByRole('button', { name: /Put back in the Workshop/ }).click()
    await expect(leftoverRow(page, 'Cement board')).toContainText('IN WORKSHOP')

    // The same item is back — never a second one for the same material.
    await openWorkshop(page)
    await expect(page.getByRole('button', { name: 'Open Cement board' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Open Cement board' })).toContainText('a sheet')
  })

  test('a failed action changes nothing and says so', async ({ page }) => {
    await seed(page, 'workshop-fails')
    await gotoApp(page)
    await openJob(page, WHITMORE)
    await openLeftovers(page)

    const drawer = await openLeftoverDrawer(page, 'Gravel boards')
    await drawer.getByRole('button', { name: /Move to the Workshop/ }).click()

    await expect(page.getByRole('status').filter({ hasText: /Nothing changed/ })).toBeVisible()
    await expect(leftoverRow(page, 'Gravel boards')).not.toContainText('IN WORKSHOP')
  })
})
