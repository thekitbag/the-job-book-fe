import { test, expect, type Page } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390px, VITE_USE_MOCK_API=true. Job memory now lives as lens tabs inside the
// current-job workspace: Overview · Spend · Labour · Used · Notes. Mock
// garden-room fixture: bought (hardcore/plasterboard/timber/insulation/
// membrane), used OSB, leftover sand (worth checking), supplier note, watch-out,
// labour, + pending review drafts.

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

async function openSpend(page: Page) {
  await gotoApp(page)
  await goToSection(page, 'Spend')
  await page.waitForTimeout(800)
}

test.describe('Job memory lens tabs', () => {
  test('Overview surfaces pending review work (things to check)', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByRole('button', { name: /things to check/i })).toBeVisible()
  })

  test('opens the Spend tab with a single Known spend figure', async ({ page }) => {
    await openSpend(page)
    await expect(page.locator('.ws-job-title')).toHaveText('Spend')
    await expect(page.getByRole('region', { name: /^known spend$/i }).getByText(/£2270/)).toBeVisible()
  })

  test('Materials keeps used and leftover reachable, flagging worth-checking', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Materials', 'Used')
    await expect(page.getByText('OSB')).toBeVisible()
    await page.getByRole('tab', { name: 'Left over' }).click()
    const sand = page.locator('.mem-card', { hasText: 'in the van' })
    await expect(sand.getByText('Worth checking')).toBeVisible()
  })

  test('Notes tab shows supplier notes and watch-outs', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Job log', 'Notes')
    await expect(page.getByText(/uneven floor near back door/i)).toBeVisible()
  })

  test('bought notes keep Fix memory and a collapsed source', async ({ page }) => {
    await openSpend(page)
    const hardcore = page.getByRole('region', { name: /uncategorised spend/i }).locator('.mem-card', { hasText: 'hardcore' })
    await expect(hardcore.getByRole('button', { name: /fix memory/i })).toBeVisible()
    await expect(hardcore.getByText('This came from your note')).not.toBeVisible()
    await hardcore.getByRole('button', { name: /show source/i }).click()
    await expect(hardcore.getByText('This came from your note')).toBeVisible()
  })

  test('editing a bought note updates it in place', async ({ page }) => {
    await openSpend(page)
    const hardcore = page.getByRole('region', { name: /uncategorised spend/i }).locator('.mem-card', { hasText: 'hardcore' })
    await hardcore.getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="supplierName"]').fill('Selco')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(600)
    await expect(page.getByRole('region', { name: /uncategorised spend/i }).getByText('Selco')).toBeVisible()
  })
})
