import { test, expect, type Page } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390px, VITE_USE_MOCK_API=true. The seeded garden-room ordered materials include
// insulation (£120, approx, 4 packs) and sealant (£15, no quantity) — both have a
// money amount but an unclear cost basis, so they are excluded from known spend
// and must surface in the top "Needs cost check" attention area.

async function openSpend(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await goToSection(page, 'Spend')
  await page.waitForTimeout(700)
}

const attention = (page: Page) => page.getByRole('region', { name: /not counted yet/i })

test.describe('Spend cost-basis attention', () => {
  test('ambiguous cost-like item is near the top and asks each vs total', async ({ page }) => {
    await openSpend(page)
    const area = attention(page)
    await expect(area).toBeVisible()
    await expect(area.getByText(/insulation/i)).toBeVisible()
    await expect(area.getByText(/each or .*total/i).first()).toBeVisible()

    // near the top: above the "By category" summary area
    const areaY = await area.boundingBox().then(b => b?.y ?? 0)
    const catY = await page.getByText('By category').boundingBox().then(b => b?.y ?? 0)
    expect(areaY).toBeLessThan(catY)
  })

  test('unit cost shown only with safe quantity; no-cost item asks for a price', async ({ page }) => {
    await openSpend(page)
    const area = attention(page)
    const insulation = area.locator('.cost-check-item', { hasText: 'insulation' })
    await expect(insulation.getByRole('button', { name: /Set as .*each/i })).toBeVisible()
    const sealant = area.locator('.cost-check-item', { hasText: 'sealant' })
    await expect(sealant.getByRole('button', { name: /each/i })).toHaveCount(0)
    await expect(sealant.getByRole('button', { name: /Confirm .*total/i })).toBeVisible()
    // a no-cost item (timber) shares the area but with an add-price treatment
    const timber = area.locator('.cost-check-item', { hasText: 'timber' })
    await expect(timber.getByText(/No price yet/i)).toBeVisible()
    await expect(timber.getByRole('button', { name: /add price/i })).toBeVisible()
    await expect(timber.getByRole('button', { name: /each|total/i })).toHaveCount(0)
  })

  test('Confirm as total moves the amount into known spend from the refetched summary', async ({ page }) => {
    await openSpend(page)
    const hero = page.getByRole('region', { name: /^known spend$/i })
    await expect(hero.getByText(/£2270/)).toBeVisible()

    const insulation = attention(page).locator('.cost-check-item', { hasText: 'insulation' })
    await insulation.getByRole('button', { name: /Confirm .*total/i }).click()
    await page.waitForTimeout(800)

    // known spend picks up insulation (£120) from the authoritative refetch
    await expect(hero.getByText(/£2390/)).toBeVisible()
    await expect(attention(page).getByText(/insulation/i)).toHaveCount(0)
  })
})
