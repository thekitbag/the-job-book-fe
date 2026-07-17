import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PostHogProvider } from '@posthog/react'
// Self-hosted variable fonts — bundled by Vite and precached for offline use
import '@fontsource-variable/schibsted-grotesk'
import './index.css'
import App from './App'
import PilotInspectionPage from './PilotInspectionPage'
import SupportModePage from './SupportModePage'
import { analyticsClient, initAnalytics } from './analytics'

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

const page = isSupportRoute ? <SupportModePage /> : isInspectionRoute ? <PilotInspectionPage /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {posthogClient ? <PostHogProvider client={posthogClient}>{page}</PostHogProvider> : page}
  </StrictMode>,
)
