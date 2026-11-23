import { openPilotJob } from './helpers'
import { test, expect, type Page } from '@playwright/test'

const banned =
  /\b(budget|spend|cost|paid|to pay|money in|money out|account|settlement|allowance|category|rate)\b|£/i
async function guard(page: Page) {
  const text = await page.locator('body').evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy
      .querySelectorAll('[data-builder-note],script,style')
      .forEach((n) => n.remove())
    return copy.textContent ?? ''
  })
  expect(text).not.toMatch(banned)
  expect(
    await page.locator('body').evaluate((el) => el.scrollWidth > innerWidth),
  ).toBe(false)
}
async function open(page: Page, section: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.count()) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
}
async function start(page: Page) {
  await openPilotJob(page)
  await expect(page.getByRole('button', { name: 'Open Hours' })).toBeVisible()
}

test('legacy money-heavy job has no financial language on any reachable memory screen', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('job-book-e2e-seed', 'job-memory-legacy'),
  )
  await start(page)
  await guard(page)
  for (const section of ['Hours', 'Materials']) {
    await open(page, section)
    if (section === 'Hours') {
      await expect(
        page.getByRole('region', { name: 'Hours total' }),
      ).toContainText('29h')
      await guard(page)
      await page.getByRole('button', { name: 'Add hours' }).click()
      await expect(page.getByRole('dialog').locator('input')).toHaveCount(3)
      await guard(page)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    } else {
      for (const tab of ['Bought', 'Used', 'Left over', 'Returned']) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        await guard(page)
        const row = page.locator('.mem-row-tap').first()
        if (await row.count()) {
          await row.click()
          await guard(page)
          await page
            .getByRole('button', { name: 'Fix memory', exact: true })
            .click()
          await expect(
            page.getByRole('dialog').getByRole('textbox'),
          ).toHaveCount(4)
          await guard(page)
          await page
            .getByRole('button', { name: 'Close', exact: true })
            .first()
            .click()
        }
        const add = page.getByRole('button', {
          name: /^Add (bought item|used item|leftover)$/,
        })
        if (await add.count()) {
          await add.click()
          await guard(page)
          await expect(
            page.getByRole('dialog').getByRole('textbox'),
          ).toHaveCount(4)
          await page
            .getByRole('button', { name: 'Cancel', exact: true })
            .click()
        }
      }
    }
  }
  await open(page, 'Job log')
  await expect(page.getByText('Skip hire, £250.')).toBeVisible()
  for (const tab of ['All', 'Notes', 'Photos']) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await guard(page)
  }
  await page.getByRole('button', { name: /job home/i }).click()
  await page.getByRole('button', { name: 'Job details', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await guard(page)
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await page.getByRole('button', { name: /things? to check/i }).click()
  await expect(page.getByText(/waiting/)).toBeVisible()
  await guard(page)
  await page
    .getByTestId('queue-item-queue-item-mock-001')
    .getByRole('button', { name: 'Fix details' })
    .click()
  await guard(page)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: /the job book/i }).click()
  await guard(page)
  await expect(page.getByRole('button', { name: /^Workshop/ })).toBeVisible()
})

test('typed hours and all material states update, edit stays four fields, and a leftover reaches Workshop', async ({
  page,
}) => {
  await start(page)
  await open(page, 'Hours')
  await expect(page.getByRole('region', { name: 'Hours total' })).toContainText(
    '29h',
  )
  await page.getByRole('button', { name: 'Add hours' }).click()
  await page.getByLabel('Who', { exact: true }).fill('New builder')
  await page.getByLabel('Which day', { exact: true }).fill('2026-11-21')
  await page.getByLabel('How many hours', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('region', { name: 'Hours total' })).toContainText(
    '35h',
  )
  await expect(
    page.getByRole('button', { name: 'Open actions for New builder' }),
  ).toContainText('6h')
  await open(page, 'Materials')
  for (const [tab, add] of [
    ['Bought', 'Add bought item'],
    ['Used', 'Add used item'],
    ['Left over', 'Add leftover'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.getByRole('button', { name: add, exact: true }).click()
    await page.getByLabel('Item', { exact: true }).fill(`Typed ${tab}`)
    await page
      .getByLabel('Number or amount', { exact: true })
      .fill('about half a pallet')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Open actions for Typed ${tab}` }),
    ).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Bought', exact: true }).click()
  await page
    .getByRole('button', { name: 'Open actions for Typed Bought' })
    .click()
  await page.getByRole('button', { name: 'Fix memory', exact: true }).click()
  await page
    .getByLabel('Notes (optional)', { exact: true })
    .fill('For the coving')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Open actions for Typed Bought' }),
  ).toContainText('For the coving')
  await page.getByRole('tab', { name: 'Left over', exact: true }).click()
  await page
    .getByRole('button', { name: 'Open actions for Typed Left over' })
    .click()
  await page.getByRole('button', { name: /Move to the Workshop/ }).click()
  await page.getByRole('button', { name: /See in the Workshop/ }).click()
  await expect(
    page.getByRole('button', { name: 'Open Typed Left over' }),
  ).toContainText('about half a pallet')
})

test('log retains every recording and legacy file, filters work, and confirming a check updates the job', async ({
  page,
}) => {
  await start(page)
  await open(page, 'Job log')
  await expect(page.getByText('Skip hire, £250.')).toBeVisible()
  await expect(
    page.getByText('Recording saved — could not be transcribed.'),
  ).toBeVisible()
  await expect(
    page.getByText('Recording saved — transcript pending.'),
  ).toBeVisible()
  await expect(
    page.getByText('Customer wants extra lights by the door.'),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: 'Delivery slip' })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Open file', exact: true }),
  ).toHaveAttribute('href', /\/receipts\/legacy-file\/file$/)
  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Delivery slip' })).toHaveCount(0)
  await expect(page.getByText('Skip hire, £250.')).toBeVisible()
  await page.getByRole('tab', { name: 'Photos', exact: true }).click()
  await expect(page.getByText('Skip hire, £250.')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Delivery slip' })).toBeVisible()
  await page.getByRole('button', { name: /job home/i }).click()
  await page.getByRole('button', { name: /things? to check/i }).click()
  const card = page.getByTestId('queue-item-queue-item-mock-001')
  await card.getByRole('button', { name: 'Remember this' }).click()
  await expect(card).toContainText('Saved to trusted memory')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await open(page, 'Materials')
  await expect(
    page.locator('.mem-row-tap').filter({ hasText: 'hardcore' }),
  ).toHaveCount(2)
})
