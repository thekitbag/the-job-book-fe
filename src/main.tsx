import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PostHogProvider } from '@posthog/react'
// Self-hosted variable fonts — bundled by Vite and precached for offline use
import '@fontsource-variable/schibsted-grotesk'
import './index.css'
import App from './App'
import PilotInspectionPage from './PilotInspectionPage'
import SupportModePage from './SupportModePage'
import { ToastProvider } from './Toast'
import { analyticsClient, initAnalytics } from './analytics'
import { USE_MOCK } from './api/client'
import { resetMockApiForE2e } from './api/mock/reset'

// Each Playwright test gets a fresh browser context with this localStorage
// marker pre-seeded by playwright.config.ts. Reset mutable mock stores once for
// that context, before App reads auth/jobs/memory. Reloads within the same test
// preserve state through the sessionStorage guard.
if (USE_MOCK && localStorage.getItem('job-book-e2e-seed') && !sessionStorage.getItem('job-book-e2e-reset-done')) {
  resetMockApiForE2e(localStorage.getItem('job-book-e2e-seed') ?? 'default')
  localStorage.removeItem('job-book-selected-job-id')
  sessionStorage.setItem('job-book-e2e-reset-done', '1')
}

// /internal/support is the active founder support tool (role INTERNAL only).
// The legacy inspection-key page stays reachable as a compatibility layer but
// is no longer the primary support UX.
const isInspectionRoute = window.location.pathname === '/internal/pilot-inspection'
const isSupportRoute = window.location.pathname === '/internal/support'

// Product analytics: initializes only when VITE_POSTHOG_PROJECT_TOKEN and
// VITE_POSTHOG_HOST are both set; otherwise every analytics call is a no-op
// and the app runs exactly as before. Explicit custom events only — see
// src/analytics.ts for the privacy configuration.
initAnalytics()
const posthogClient = analyticsClient()

const inner = isSupportRoute ? <SupportModePage /> : isInspectionRoute ? <PilotInspectionPage /> : <App />
// Toasts are app-wide: money actions (mark paid, returns) explain their Money
// and Budget impact through this surface from anywhere in the workspace.
const page = <ToastProvider>{inner}</ToastProvider>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {posthogClient ? <PostHogProvider client={posthogClient}>{page}</PostHogProvider> : page}
  </StrictMode>,
)
