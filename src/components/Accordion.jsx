import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Accordion({ title, description, icon: Icon, defaultOpen = false, children }) {
  console.log('🔍 [DEBUG-COMPONENT-Accordion] Accordion() — props:', { title, description, defaultOpen });
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen(o => {
          const nuevoValor = !o;
          console.log('🖱️ [DEBUG-COMPONENT-Accordion] toggle open — nuevo valor:', nuevoValor);
          return nuevoValor;
        })}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</span>
            {description && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</span>}
          </span>
        </span>
        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <div className="p-4 border-t border-gray-200 dark:border-gray-700">{children}</div>}
    </div>
  );
}
