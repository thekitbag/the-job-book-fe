import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./src/__tests__/setup.ts'],
    // Generous for loaded machines; a hung test still fails.
    testTimeout: 15_000,
    exclude: ['**/node_modules/**', '**/e2e/**', '**/integration/**'],
  },
})
