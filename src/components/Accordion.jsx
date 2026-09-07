import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Accordion({ title, description, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={16} className="text-teal-600 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800">{title}</span>
            {description && <span className="block text-xs text-gray-500 mt-0.5">{description}</span>}
          </span>
        </span>
        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <div className="p-4 border-t border-gray-200">{children}</div>}
    </div>
  );
}
