import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts — bundled by Vite and precached for offline use
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import App from './App'
import PilotInspectionPage from './PilotInspectionPage'

const isInspectionRoute = window.location.pathname === '/internal/pilot-inspection'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isInspectionRoute ? <PilotInspectionPage /> : <App />}
  </StrictMode>,
)
