import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'https://localhost:5174',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    storageState: {
      cookies: [],
      origins: [{
        origin: 'https://localhost:5174',
        localStorage: [{ name: 'job-book-e2e-seed', value: 'default' }],
      }],
    },
    // Keep failure evidence in CI (trace viewable via `npx playwright show-trace`).
    trace: process.env.CI ? 'retain-on-failure' : 'off',
  },
  timeout: 20000,
  retries: 0,
  // CI uploads playwright-report/ on failure; local runs keep the default list output.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: [{
    command: 'VITE_USE_MOCK_API=true npx vite --port 5174',
    url: 'https://localhost:5174',
    ignoreHTTPSErrors: true,
    // Reusing a running dev server is a local convenience; in CI it could
    // silently attach to a stale server with the wrong env, so never reuse there.
    reuseExistingServer: !process.env.CI,
  }, {
    // Built app + service worker exercise a real offline cold reload. HTTP
    // fixtures in capture-foundation.spec.ts stand in for the backend.
    command: 'VITE_USE_MOCK_API=false npm run build && npx vite preview --port 5176 --host',
    url: 'https://localhost:5176',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
  }],
})
