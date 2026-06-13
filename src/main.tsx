import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import PilotInspectionPage from './PilotInspectionPage'

const isInspectionRoute = window.location.pathname === '/internal/pilot-inspection'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isInspectionRoute ? <PilotInspectionPage /> : <App />}
  </StrictMode>,
)
