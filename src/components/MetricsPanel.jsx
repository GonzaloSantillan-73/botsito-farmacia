import React, { lazy, Suspense } from 'react';
import MetricsTable from './MetricsTable';

// Pantalla de Métricas y Estadísticas (sólo administración):
// 1. Detalle de consultas (tabla con su propio filtro de fechas), arriba de
//    todo como siempre.
// 2. Panel general: resumen, mensajes, ventas, clientes, atención,
//    resultado de las consultas, resolución del bot, calificaciones,
//    comparativa por sucursal y PDFs, todo con un mismo filtro de fechas
//    (ver PanelEstadisticas.jsx). Lo que antes estaba en desplegables
//    (/metrics/negocio) quedó integrado ahí.

// Se carga recién al abrir Métricas: trae la librería de gráficos, que las
// sucursales nunca usan, así no la descargan con el resto del panel.
const PanelEstadisticas = lazy(() => import('./PanelEstadisticas'));

export default function MetricsPanel() {
  return (
    <div className="space-y-10">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Detalle de consultas</h3>
        <MetricsTable />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Panel general</h3>
        <Suspense fallback={<div className="text-sm text-gray-400 py-10 text-center">Cargando estadísticas...</div>}>
          <PanelEstadisticas />
        </Suspense>
      </div>
    </div>
  );
}
