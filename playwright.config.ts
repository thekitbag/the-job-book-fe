import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'https://localhost:5174',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
  },
  timeout: 20000,
  retries: 0,
  webServer: {
    command: 'VITE_USE_MOCK_API=true npx vite --port 5174',
    url: 'https://localhost:5174',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
  },
})
