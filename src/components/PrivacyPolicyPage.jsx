import React, { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import PrivacyPolicyContent from './PrivacyPolicyContent';
import { applyTheme, getTheme } from '../lib/adminAuth';

// Página pública /privacidad: se monta desde main.jsx ANTES de App, así que
// no pasa por el login ni necesita token. La abre el enlace "Política de
// Privacidad" de la pantalla de inicio de sesión (en una pestaña nueva) y es
// la URL que se puede informar a Meta / clientes.
export default function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = 'Política de Privacidad — Red Mi Farma';
    // Respeta el tema (claro/oscuro) que haya quedado guardado en este navegador.
    applyTheme(getTheme());
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 sm:p-10">
        <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-semibold text-sm mb-6">
          <ShieldCheck size={18} />
          Red Mi Farma
        </div>
        <PrivacyPolicyContent />
      </div>
    </div>
  );
}
