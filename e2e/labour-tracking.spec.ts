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
    await expect(page.getByText('24h job total')).toBeVisible()

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
    // entry without a named person renders safely, money stays secondary
    await expect(yesterday.getByText('fitting cladding')).toBeVisible()
    await expect(yesterday.getByText('No cost added')).toBeVisible()
  })

  test('direct-add labour for another day appears under that day', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Labour')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add labour' }).click()
    const form = page.getByRole('form', { name: 'Add labour' })

    // pick yesterday's date so the entry lands in the Yesterday group
    const yesterday = new Date(Date.now() - 86_400_000)
    const p = (n: number) => String(n).padStart(2, '0')
    await form.locator('input[name="happenedAt"]').fill(`${yesterday.getFullYear()}-${p(yesterday.getMonth() + 1)}-${p(yesterday.getDate())}`)
    await form.locator('input[name="labourPerson"]').fill('Priya')
    await form.locator('input[name="labourHours"]').fill('5')
    await form.locator('input[name="labourTask"]').fill('decking')
    await form.getByRole('button', { name: /^Save / }).click()

    const group = page.getByRole('region', { name: 'Labour Yesterday' })
    await expect(group.getByText('Priya')).toBeVisible()
    await expect(group.getByText('decking')).toBeVisible()
    // yesterday's day total now includes the new 5h (6 + 5)
    await expect(group.getByText('11h day total')).toBeVisible()
  })

  test('edit labour day/hours/task moves the entry and updates totals', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Labour')
    await page.waitForTimeout(600)

    // fix Mike's entry: 4h → 7h and move it to yesterday
    const today = page.getByRole('region', { name: 'Labour Today' })
    const mike = today.locator('.labour-entry', { hasText: 'Mike' })
    await mike.getByRole('button', { name: /fix memory/i }).click()
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
    await goToSection(page, 'Spend')
    await page.waitForTimeout(900)

    // Labour group: £280 (rated, categorised) + £600 (total, NO category) = £880,
    // against the seeded £1500 labour category budget.
    const group = page.getByRole('region', { name: /^labour spend$/i })
    await expect(group.getByText('£880 known spend')).toBeVisible()
    await expect(group.getByText('£620 remaining')).toBeVisible()

    // no second home for labour: the manual labour category card is suppressed
    await expect(page.getByRole('region', { name: /budget category labour/i })).toHaveCount(0)

    // the no-category £600 roof labour is under Labour, not Uncategorised
    await group.getByRole('button', { name: /show notes/i }).click()
    await expect(group.getByText('roof')).toBeVisible()
    const uncat = page.getByRole('region', { name: /^uncategorised spend$/i })
    await expect(uncat.getByText('roof')).toHaveCount(0)
    // hours-only labour (Mike/Kurt) is nowhere in Spend
    await expect(uncat.getByText('Mike')).toHaveCount(0)
    await expect(group.getByText('Mike')).toHaveCount(0)
  })
})
