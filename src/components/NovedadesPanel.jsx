import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Gift, Sparkles, TrendingUp, Wrench } from 'lucide-react';
import { NOVEDADES } from '../data/novedades';
import { isAdminRole, getAdminUsername } from '../lib/adminAuth';
import { renderWhatsAppText } from '../lib/whatsappFormat';

// Qué novedades ya vio cada usuario: se guarda en este navegador, por
// usuario (si dos empleados comparten la compu, cada uno ve las suyas).
const claveVistas = () => `novedades_vistas:${getAdminUsername() || 'anon'}`;

const leerVistas = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(claveVistas()) || '[]'));
  } catch {
    return new Set();
  }
};

const guardarVistas = (ids) => {
  try {
    localStorage.setItem(claveVistas(), JSON.stringify([...ids]));
  } catch {
    // Sin almacenamiento (modo privado, etc.): el número rojo vuelve a aparecer, nada más.
  }
};

// Las de 'admin' sólo las ve la administración; las sucursales, las de 'todos'.
const novedadesVisibles = () => {
  const soyAdmin = isAdminRole();
  return NOVEDADES.filter(n => n.para !== 'admin' || soyAdmin);
};

export const contarNovedadesSinLeer = () => {
  const vistas = leerVistas();
  return novedadesVisibles().filter(n => !vistas.has(n.id)).length;
};

const TIPOS = {
  nuevo: { label: 'Nuevo', Icono: Sparkles, clase: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300', borde: 'border-t-emerald-500' },
  mejora: { label: 'Mejora', Icono: TrendingUp, clase: 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300', borde: 'border-t-sky-500' },
  correccion: { label: 'Corrección', Icono: Wrench, clase: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300', borde: 'border-t-amber-500' }
};

const formatearFecha = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function NovedadesPanel({ onClose }) {
  const [lista] = useState(() => novedadesVisibles());
  // Las que no estaban leídas al abrir quedan marcadas como "Sin leer" en
  // esta apertura, aunque ya se hayan guardado como vistas.
  const [noLeidasAlAbrir] = useState(() => {
    const vistas = leerVistas();
    return new Set(lista.filter(n => !vistas.has(n.id)).map(n => n.id));
  });

  useEffect(() => {
    const vistas = leerVistas();
    lista.forEach(n => vistas.add(n.id));
    guardarVistas(vistas);
  }, [lista]);

  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  // Agrupadas por fecha, la más nueva arriba.
  const porFecha = [];
  [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha)).forEach(n => {
    const grupo = porFecha.find(g => g.fecha === n.fecha);
    if (grupo) grupo.items.push(n);
    else porFecha.push({ fecha: n.fecha, items: [n] });
  });

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-gray-50 dark:bg-gray-950 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            <Gift size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Novedades del CRM</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Lo nuevo, lo mejorado y lo corregido, con su fecha.</p>
          </div>
        </div>
        <button
          onClick={onClose}
          title="Cerrar (Esc)"
          className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0"
        >
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">
          {porFecha.length === 0 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Todavía no hay novedades.</p>
          )}
          {porFecha.map(grupo => (
            <section key={grupo.fecha} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {formatearFecha(grupo.fecha)}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 items-start">
                {grupo.items.map(n => {
                  const tipo = TIPOS[n.tipo] || TIPOS.nuevo;
                  const sinLeer = noLeidasAlAbrir.has(n.id);
                  return (
                    <article
                      key={n.id}
                      className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-t-4 ${tipo.borde} shadow-sm p-5 flex flex-col gap-3`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${tipo.clase}`}>
                          <tipo.Icono size={12} /> {tipo.label}
                        </span>
                        {n.para === 'admin' && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">Solo administración</span>
                        )}
                        {sinLeer && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-600 text-white">Sin leer</span>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">{n.titulo}</h4>
                      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        {n.detalle.map((parrafo, i) => (
                          <p key={i}>{renderWhatsAppText(parrafo)}</p>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
