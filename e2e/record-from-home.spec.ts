import { test, expect, type Page } from '@playwright/test'
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['microphone'],
})
async function record(page: Page) {
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByRole('button', { name: 'Stop recording' }),
  ).toBeVisible()
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(page.getByRole('dialog', { name: 'Which job?' })).toBeVisible()
}
async function choose(page: Page, title = 'Garden Room') {
  await page
    .getByRole('dialog', { name: 'Which job?' })
    .getByRole('button', { name: title, exact: true })
    .click()
}
async function width(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}
test('Home record, file, show every draft value and confirm', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'The Job Book' }),
  ).toBeVisible()
  await record(page)
  await choose(page)
  await expect(
    page.getByText('Saved to Garden Room', { exact: true }),
  ).toBeVisible()
  const draft = page.getByRole('dialog', { name: "Here's what I got" })
  await expect(draft).toBeVisible()
  await expect(draft.getByText('2 hours', { exact: true })).toBeVisible()
  await expect(draft.getByText('Not certain — please check')).toBeVisible()
  await draft.getByRole('button', { name: 'Looks right' }).click()
  await expect(draft).toHaveCount(0)
  await page.getByRole('button', { name: /^Garden Room/ }).click()
  await expect(page.getByRole('button', { name: 'Open Hours' })).toContainText(
    '31h logged',
  )
})
test('Later keeps a recording in Not filed yet and it can be filed from there', async ({
  page,
}) => {
  await page.goto('/')
  await record(page)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await page.getByRole('button', { name: /Not filed yet/ }).click()
  await page.getByRole('button', { name: 'Choose job' }).click()
  await choose(page)
  await expect(
    page.getByText('Saved to Garden Room', { exact: true }),
  ).toBeVisible()
})
test('offline choice stays on the phone with Retry in the Job log, then files on reconnect', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Garden Room/ })).toBeVisible()
  await context.setOffline(true)
  await record(page)
  await choose(page)
  await expect(
    page.getByText('Saved to Garden Room', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open job' }).click()
  await page.getByRole('button', { name: 'Open Job log' }).click()
  await expect(
    page.getByText('Saved on this phone', { exact: true }),
  ).toBeVisible()
  await context.setOffline(false)
  await expect(
    page.getByText('Recording saved — transcript pending.').first(),
  ).toBeVisible()
})
test('a picked photo is durable and uses the same filing picker', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Garden Room/ })).toBeVisible()
  await page
    .locator('#capture-home-photo')
    .setInputFiles({
      name: 'site.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
  await expect(page.getByRole('dialog', { name: 'Which job?' })).toBeVisible()
  await choose(page)
  await page.getByRole('button', { name: 'Open job' }).click()
  await page.getByRole('button', { name: 'Open Job log' }).click()
  await expect(page.locator('.job-log-photo').first()).toBeVisible()
})
for (const size of [320, 390])
  test(`Home and picker fit ${size}px`, async ({ page }) => {
    await page.setViewportSize({ width: size, height: 844 })
    await page.goto('/')
    await width(page)
    await record(page)
    await width(page)
    await choose(page)
    await expect(
      page.getByRole('dialog', { name: "Here's what I got" }),
    ).toBeVisible()
    await width(page)
  })
