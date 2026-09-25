import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PrivacyPolicyPage from './components/PrivacyPolicyPage.jsx'
import { registerServiceWorker } from './lib/registerServiceWorker'

registerServiceWorker()

// Ruta pública /privacidad: se resuelve acá, sin router ni sesión, para que
// la Política de Privacidad se pueda abrir sin estar logueado. Cualquier otra
// ruta monta el CRM normal (que pide login si no hay sesión).
const esPaginaPrivacidad = window.location.pathname.replace(/\/+$/, '') === '/privacidad'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {esPaginaPrivacidad ? <PrivacyPolicyPage /> : <App />}
  </StrictMode>,
)
