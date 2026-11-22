import { test, expect, type Page } from '@playwright/test'
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
})
async function notes(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('job-book', 1)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    const values = await new Promise<
      { jobId: string; clientNoteId: string; localState: string; mimeType: string; blob: Blob }[]
    >((resolve, reject) => {
      const r = db.transaction('notes').objectStore('notes').getAll()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    return values.map((n) => ({
      jobId: n.jobId,
      id: n.clientNoteId,
      state: n.localState,
      mime: n.mimeType,
      size: n.blob.size,
    }))
  })
}
for (const offline of [false, true])
  test(`record inside a job ${offline ? 'offline' : 'online'} keeps durable audio and one retry id`, async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Open Hours' })).toBeVisible()
    await page.getByRole('button', { name: 'Open Job log' }).click()
    await expect(page.getByText('Recording saved — transcript pending.')).toHaveCount(1)
    if (offline) await context.setOffline(true)
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Stop recording' }).click()
    await expect.poll(async () => (await notes(page)).length).toBe(1)
    const [saved] = await notes(page)
    expect(saved.jobId).toBe('job-pilot-garden-room-001')
    expect(saved.size).toBeGreaterThan(0)
    expect(saved.mime).toMatch(/^audio\//)
    if (offline) {
      expect(saved.state).toBe('saved_local')
      await expect(page.getByText('Saved on this phone').first()).toBeVisible()
      await context.setOffline(false)
    }
    await expect.poll(async () => (await notes(page))[0]?.state).toBe('uploaded')
    expect((await notes(page))[0].id).toBe(saved.id)
    await expect(page.getByText('Recording saved — transcript pending.')).toHaveCount(2)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Open Hours' })).toBeVisible()
    expect((await notes(page))[0].id).toBe(saved.id)
  })
