import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Se toma en el momento del build (no en runtime) para que el badge de la UI
// (ver Sidebar.jsx) siempre refleje el commit que efectivamente se compiló y
// se está sirviendo, útil para confirmar que un deploy en Render ya se aplicó.
// Si no hay repo git disponible (ej. build fuera de un checkout) queda vacío
// y el frontend cae a su propio fallback ("dev").
try {
  process.env.VITE_GIT_COMMIT_HASH = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // sin git disponible, sigue sin la variable
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
