import { test, expect, type Page } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390×844, VITE_USE_MOCK_API=true — Labour entry point & budget clarity.
// Mock seed: labour category (£1500 budget) holding rated labour (£280 of £880
// total trusted labour) AND a historical non-labour row (agency invoice £150);
// job total known spend £2270 (£1390 bought incl. the invoice + £880 labour).

async function gotoApp(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
}

test.describe('Labour entry point & budget clarity', () => {
  test('Labour tab shows hours plus labour cost, budget, and remaining', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Labour')
    await page.waitForTimeout(900)

    await expect(page.getByText('24h job total')).toBeVisible()
    const money = page.getByRole('region', { name: 'Labour cost' })
    await expect(money.getByText('£880 known spend')).toBeVisible()
    await expect(money.getByText('£1500 budget')).toBeVisible()
    await expect(money.getByText('£620 remaining')).toBeVisible()

    // labour add lives here and rolls into Spend
    await page.getByRole('button', { name: 'Add labour', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'Add labour' }).getByRole('form', { name: 'Add labour' })
    await form.locator('input[name="labourPerson"]').fill('Priya')
    await form.locator('input[name="labourHours"]').fill('2')
    await form.locator('input[name="rate"]').fill('30')
    await form.getByRole('button', { name: /^Save / }).click()
    await page.waitForTimeout(900)
    await expect(page.getByRole('region', { name: 'Labour Today' }).getByText('Priya')).toBeVisible()
    // labour cost context updates from the refetched summary (880 + 60)
    await expect(money.getByText('£940 known spend')).toBeVisible()
  })

  test('Spend shows the budget trio, includes labour, and never offers add-to-labour', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Spend')
    await page.waitForTimeout(900)

    // job-level trio: known spend, total budget, remaining
    const hero = page.getByRole('region', { name: /^known spend$/i })
    await expect(hero.getByText(/£2270/)).toBeVisible()
    await expect(hero.getByText(/of £7500/)).toBeVisible()
    await expect(hero.getByText(/£5230 remaining/)).toBeVisible()

    // Labour group shows its own trio and guides entry to Labour
    const group = page.getByRole('region', { name: /^labour spend$/i })
    await expect(group.getByText('£880 known spend')).toBeVisible()
    await expect(group.getByText('£1500 budget')).toBeVisible()
    await expect(group.getByText('£620 remaining')).toBeVisible()
    await expect(group.getByText(/Add labour from the Labour tab/)).toBeVisible()
    await expect(group.getByRole('button', { name: /add/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add to labour' })).toHaveCount(0)

    // generic Add spend must not offer the labour category
    await page.getByRole('button', { name: 'Add spend', exact: true }).click()
    const select = page.getByRole('dialog', { name: 'Add spend' }).getByLabel('Budget category')
    const options = await select.locator('option').allTextContents()
    expect(options).toContain('timber')
    expect(options).not.toContain('labour')
    await page.getByRole('dialog', { name: 'Add spend' }).getByRole('button', { name: 'Close' }).click()

    // historical non-labour Labour-category spend: visible once, fixable
    const hist = group.getByRole('group', { name: /existing spend in the labour category/i })
    await expect(hist.getByText('agency invoice')).toBeVisible()
    await expect(hist.getByRole('button', { name: /fix memory/i })).toBeVisible()
    await expect(page.getByText('agency invoice')).toHaveCount(1)
  })

  test('job title can be renamed and the new title persists across the app', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /more actions/i }).click()
    await page.getByRole('menuitem', { name: /rename job/i }).click()
    const input = page.getByLabel('Job title')
    await expect(input).toHaveValue('Garden Room')
    await input.fill('Patel Garden Room')
    await page.getByRole('form', { name: 'Rename job' }).getByRole('button', { name: 'Save' }).click()
    await page.waitForTimeout(800)

    await expect(page.getByRole('heading', { name: 'Patel Garden Room' })).toBeVisible()
    // the job list shows the new title too
    await page.getByRole('button', { name: /switch/i }).click()
    await page.waitForTimeout(600)
    await expect(page.getByText('Patel Garden Room')).toBeVisible()
  })
})
