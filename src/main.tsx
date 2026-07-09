import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts — bundled by Vite and precached for offline use
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import App from './App'
import PilotInspectionPage from './PilotInspectionPage'
import SupportModePage from './SupportModePage'

// /internal/support is the active founder support tool (role INTERNAL only).
// The legacy inspection-key page stays reachable as a compatibility layer but
// is no longer the primary support UX.
const isInspectionRoute = window.location.pathname === '/internal/pilot-inspection'
const isSupportRoute = window.location.pathname === '/internal/support'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupportRoute ? <SupportModePage /> : isInspectionRoute ? <PilotInspectionPage /> : <App />}
  </StrictMode>,
)
