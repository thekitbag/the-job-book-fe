import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'https://localhost:5174',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    // Keep failure evidence in CI (trace viewable via `npx playwright show-trace`).
    trace: process.env.CI ? 'retain-on-failure' : 'off',
  },
  timeout: 20000,
  retries: 0,
  // CI uploads playwright-report/ on failure; local runs keep the default list output.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: {
    command: 'VITE_USE_MOCK_API=true npx vite --port 5174',
    url: 'https://localhost:5174',
    ignoreHTTPSErrors: true,
    // Reusing a running dev server is a local convenience; in CI it could
    // silently attach to a stale server with the wrong env, so never reuse there.
    reuseExistingServer: !process.env.CI,
  },
})
