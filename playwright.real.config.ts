import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './integration',
  outputDir: 'integration-results',
  testMatch: '*.real.spec.ts',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'https://localhost:5177',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--ignore-certificate-errors',
      ],
    },
    permissions: ['microphone'],
  },
  webServer: {
    command:
      'VITE_USE_MOCK_API=false npx vite --config integration/vite.real.config.ts --port 5177',
    url: 'https://localhost:5177',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
  },
})
