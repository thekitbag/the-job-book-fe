import { test, expect, type Page } from '@playwright/test'

// 390px, VITE_USE_MOCK_API=true. Job memory "What I've bought" tab.
// Seeded garden-room: Known spend £1240 (hardcore £40 + plasterboard £1200),
// budgets timber £4000 + cladding £2000 (£6000). Not counted: timber (no price,
// currency-null), insulation (approx → worth checking), membrane ×2 (no price).

async function openBought(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  await page.getByRole('tab', { name: 'Spend' }).click()
  await page.waitForTimeout(800)
}

const heroRegion = (page: Page) => page.getByRole('region', { name: /^known spend$/i })
const notCounted = (page: Page) => page.getByRole('region', { name: /not counted yet/i })
const uncategorised = (page: Page) => page.getByRole('region', { name: /uncategorised spend/i })

// Total known cost = bought £1240 + rated/total labour £880 = £2120, of the
// £7500 budget (timber 4000 + cladding 2000 + labour 1500).
test.describe('Cost capture & Known spend (Spend tab)', () => {
  test('shows one Known spend hero (bought + labour) against the total budget', async ({ page }) => {
    await openBought(page)
    const hero = heroRegion(page)
    await expect(hero.getByText(/£2120/)).toBeVisible()
    await expect(hero.getByText(/of £7500/)).toBeVisible()
    await expect(hero.getByText(/£5380 remaining/)).toBeVisible()
    await expect(page.getByText(/total spend/i)).toHaveCount(0)
  })

  test('one "Not counted yet" area holds no-price and cost-basis items', async ({ page }) => {
    await openBought(page)
    const nc = notCounted(page)
    // no-price item (timber) → prompt to add a price
    await expect(nc.getByText(/timber/i).first()).toBeVisible()
    await expect(nc.getByText(/No price yet/i).first()).toBeVisible()
    // cost-basis-ambiguous item (insulation) → each vs total, same area
    await expect(nc.getByText(/insulation/i)).toBeVisible()
    await expect(nc.getByText(/each or .*total/i).first()).toBeVisible()
  })

  test('uncategorised safe spend is counted and shown with a Choose category action', async ({ page }) => {
    await openBought(page)
    const u = uncategorised(page)
    await expect(u.getByText('hardcore')).toBeVisible()
    await expect(u.getByText('£40')).toBeVisible()
    await expect(u.getByLabel(/budget category for hardcore/i)).toBeVisible()
  })

  test('a bought note shows unit cost and total, not a bare number', async ({ page }) => {
    await openBought(page)
    const hardcore = uncategorised(page).locator('.mem-card', { hasText: 'hardcore' })
    await expect(hardcore.getByText('£5 each')).toBeVisible()
    await expect(hardcore.getByText('Unit cost')).toBeVisible()
    await expect(hardcore.getByText('Total')).toBeVisible()
  })

  test('adding a total price to a no-price item moves it into Known spend', async ({ page }) => {
    await openBought(page)
    await expect(heroRegion(page).getByText(/£2120/)).toBeVisible()

    // No-price timber → Add price → enter a total (£60)
    const timber = notCounted(page).locator('.cost-check-item', { hasText: 'timber' })
    await timber.getByRole('button', { name: 'Add price' }).click()
    const form = page.getByRole('form', { name: 'Add price' })
    await form.locator('input[name="price"]').fill('60')
    await form.getByRole('button', { name: /save price/i }).click()
    await page.waitForTimeout(1000)

    // Refetched total known cost: bought (1240 + £60) + labour 880 = £2180.
    await expect(heroRegion(page).getByText(/£2180/)).toBeVisible()
  })

  test('source context remains available on a bought note', async ({ page }) => {
    await openBought(page)
    const hardcore = uncategorised(page).locator('.mem-card', { hasText: 'hardcore' })
    await hardcore.getByRole('button', { name: /show source/i }).click()
    await expect(page.getByText('This came from your note')).toBeVisible()
  })
})
