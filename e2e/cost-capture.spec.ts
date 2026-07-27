import { test, expect, type Page } from '@playwright/test'
import { openRowActions } from './helpers'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390px, VITE_USE_MOCK_API=true. Job memory "What I've bought" tab.
// Seeded garden-room: Known spend £1,390 (hardcore £40 + plasterboard £1,200 + agency invoice £150),
// budgets timber £4,000 + cladding £2,000 (£6,000). Not counted: timber (no price,
// currency-null), insulation (approx → worth checking), membrane ×2 (no price).

async function openBought(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  await goToSection(page, 'Budget')
  await page.waitForTimeout(800)
}

const heroRegion = (page: Page) => page.getByRole('region', { name: /^budget$/i })
const uncategorised = (page: Page) => page.getByRole('region', { name: /uncategorised cost/i })

// Total known cost = bought £1,390 + rated/total labour £880 = £2,270, of the
// £7,500 budget (timber 4000 + cladding 2000 + labour 1500).
test.describe('Cost capture & Known spend (Spend tab)', () => {
  test('shows one Known spend hero (bought + labour) against the total budget', async ({ page }) => {
    await openBought(page)
    const hero = heroRegion(page)
    await expect(hero.getByText(/£2,270/)).toBeVisible()
    await expect(hero.getByText(/of £7,500/)).toBeVisible()
    await expect(hero.getByText(/£5,230 remaining/)).toBeVisible()
    await expect(page.getByText(/total spend/i)).toHaveCount(0)
  })

  test('Budget does not expose missing-price correction', async ({ page }) => {
    await openBought(page)
    await expect(page.getByRole('region', { name: /not counted yet/i })).toHaveCount(0)
  })

  test('uncategorised safe cost is counted and can be filed to a category', async ({ page }) => {
    await openBought(page)
    const u = uncategorised(page)
    await expect(u.getByText('hardcore')).toBeVisible()
    await expect(u.locator('.mem-row-tap-price')).toHaveText('£40')
    // Filing to a category lives in the row's action drawer, not an inline button.
    const drawer = await openRowActions(page, u.locator('.mem-card', { hasText: 'hardcore' }))
    await expect(drawer.getByRole('button', { name: /choose category/i })).toBeVisible()
  })

  // The lighter ledger row carries the quantity as context and the line total as
  // the row's price; the drawer restates it in cost language ("£40 cost"). The
  // point is that the total is never a bare number whose basis you have to guess.
  test('a bought row shows its quantity and total cost, not a bare number', async ({ page }) => {
    await openBought(page)
    const hardcore = uncategorised(page).locator('.mem-card', { hasText: 'hardcore' })
    await expect(hardcore.locator('.mem-row-tap-meta')).toContainText('8 bags')
    await expect(hardcore.locator('.mem-row-tap-price')).toHaveText('£40')
    const drawer = await openRowActions(page, hardcore)
    await expect(drawer.getByText('£40 cost')).toBeVisible()
  })


  test('source context remains available on a bought row', async ({ page }) => {
    await openBought(page)
    const hardcore = uncategorised(page).locator('.mem-card', { hasText: 'hardcore' })
    // Source lives in the row's tap-to-open action drawer now.
    await (await openRowActions(page, hardcore)).getByRole('button', { name: /show source/i }).click()
    await expect(page.getByText('This came from your note')).toBeVisible()
  })
})
