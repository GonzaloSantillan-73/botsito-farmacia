import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

console.log('🔍 [DEBUG-MAIN] Montando la aplicación React', { rootElement: !!document.getElementById('root'), timestamp: new Date().toISOString() });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

console.log('✅ [DEBUG-MAIN] createRoot().render() invocado');
