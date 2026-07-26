import { test, expect, type Page } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390×844, VITE_USE_MOCK_API=true — Labour Tracking V2.
// Mock seed (garden-room job): labour today = Mike 4h + Kurt 6h (one note) +
// Tom 8h electrics (£280, labour category) + worth-checking "about 5"; labour
// yesterday = 6h fitting cladding (no person, no cost); plus a £600 roof labour
// total with NO category. Review queue holds Mike/Kurt drafts from one note.

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

test.describe('Labour tab — daily view', () => {
  test('groups labour by day with day totals and a job total', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Labour')
    await page.waitForTimeout(600)

    // Job total: today 4+6+8 = 18h, yesterday 6h → 24h (worth-checking excluded).
    const jobTotal = page.getByRole('region', { name: 'Labour hours' })
    await expect(jobTotal).toContainText('24h')
    await expect(jobTotal).toContainText('on this job')

    const today = page.getByRole('region', { name: 'Labour Today' })
    await expect(today.getByText('18h day total')).toBeVisible()
    // two people from one voice note render under the same day
    await expect(today.getByText('Mike')).toBeVisible()
    await expect(today.getByText('Kurt')).toBeVisible()
    // worth-checking labour stays visible but is flagged as not counted
    await expect(today.getByText('Apprentice')).toBeVisible()
    await expect(today.getByText(/worth checking — not counted/i)).toBeVisible()

    const yesterday = page.getByRole('region', { name: 'Labour Yesterday' })
    await expect(yesterday.getByText('6h day total')).toBeVisible()
    // entry without a named person renders safely; the row states its Budget
    // effect (hours only) rather than a money figure.
    await expect(yesterday.getByText(/fitting cladding · hours only/i)).toBeVisible()
  })

  test('direct-add labour with a new person appears under Today', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Labour')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /add labour/i }).click()
    const sheet = page.getByRole('dialog', { name: 'Add labour' })
    // Add a brand-new person from the drawer, then log their hours.
    await sheet.getByRole('button', { name: '+ New' }).click()
    await sheet.getByLabel('New person name').fill('Priya')
    await sheet.getByRole('button', { name: 'Add', exact: true }).click()
    await sheet.locator('.stepper-input').fill('5')
    await sheet.locator('input[name="labourTask"]').fill('decking')
    await sheet.getByRole('button', { name: 'Save labour' }).click()
    await page.waitForTimeout(600)

    const group = page.getByRole('region', { name: 'Labour Today' })
    await expect(group.getByText('Priya')).toBeVisible()
    await expect(group.getByText(/decking/)).toBeVisible()
  })

  test('edit labour day/hours/task moves the entry and updates totals', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Labour')
    await page.waitForTimeout(600)

    // fix Mike's entry: 4h → 7h and move it to yesterday — via the row drawer.
    const today = page.getByRole('region', { name: 'Labour Today' })
    const mike = today.locator('.labour-entry', { hasText: 'Mike' })
    await mike.locator('.labour-entry-tap').click()
    await page.getByRole('dialog').getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    const yesterday = new Date(Date.now() - 86_400_000)
    const p = (n: number) => String(n).padStart(2, '0')
    await form.locator('input[name="happenedAt"]').fill(`${yesterday.getFullYear()}-${p(yesterday.getMonth() + 1)}-${p(yesterday.getDate())}`)
    await form.locator('input[name="labourHours"]').fill('7')
    await form.locator('input[name="labourTask"]').fill('groundworks')
    await form.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(700)

    const yGroup = page.getByRole('region', { name: 'Labour Yesterday' })
    await expect(yGroup.getByText('Mike')).toBeVisible()
    await expect(yGroup.getByText('groundworks')).toBeVisible()
    // yesterday 6 + 7 = 13h; today 6 + 8 = 14h
    await expect(yGroup.getByText('13h day total')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Labour Today' }).getByText('14h day total')).toBeVisible()
  })

  test('review confirms two labour people from one note into the same day', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /things to check/i }).click()
    await page.waitForTimeout(700)

    // both drafts from "Mike 4 hours, Kurt 6." render as separate Labour items
    const mike = page.getByTestId('queue-item-queue-item-mock-005')
    const kurt = page.getByTestId('queue-item-queue-item-mock-006')
    await expect(mike.getByText('Mike')).toBeVisible()
    await expect(kurt.getByText('Kurt')).toBeVisible()
    await mike.getByRole('button', { name: /remember this/i }).click()
    await page.waitForTimeout(400)
    await kurt.getByRole('button', { name: /remember this/i }).click()
    await page.waitForTimeout(400)

    await page.getByRole('button', { name: /back/i }).click()
    await goToSection(page, 'Labour')
    await page.waitForTimeout(700)
    // confirmed drafts join today's group: 18h seed + 4 + 6 = 28h
    const today = page.getByRole('region', { name: 'Labour Today' })
    await expect(today.getByText('28h day total')).toBeVisible()
  })
})

test.describe('Spend tab — Labour group', () => {
  test('trusted labour shows once under Labour with the category budget; hours-only is not spend', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Budget')
    await page.waitForTimeout(900)

    // Labour group: £280 (rated, categorised) + £600 (total, NO category) = £880,
    // against the seeded £1500 labour category budget.
    const group = page.getByRole('region', { name: /^labour$/i })
    await expect(group.locator('.budget-figure', { hasText: 'Cost' }).getByText('£880', { exact: true })).toBeVisible()
    await expect(group.locator('.budget-figure', { hasText: 'Remaining' }).getByText('£620', { exact: true })).toBeVisible()

    // no second home for labour: the manual labour category card is suppressed
    await expect(page.getByRole('region', { name: /budget category labour/i })).toHaveCount(0)

    // the no-category £600 roof labour is under Labour, not Uncategorised
    await group.getByRole('button', { name: /show items/i }).click()
    await expect(group.getByText('roof')).toBeVisible()
    const uncat = page.getByRole('region', { name: /^uncategorised cost$/i })
    await expect(uncat.getByText('roof')).toHaveCount(0)
    // hours-only labour (Mike/Kurt) is nowhere in Spend
    await expect(uncat.getByText('Mike')).toHaveCount(0)
    await expect(group.getByText('Mike')).toHaveCount(0)
  })
})
