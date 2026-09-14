// Días de atención de una sucursal, compartido entre el panel de listado y
// el modal de alta/edición.
console.log('🔍 [DEBUG-LIB-DIAS] cargando módulo dias.js — sin parámetros (no exporta funciones, solo la constante DIAS)');
export const DIAS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];
console.log('✅ [DEBUG-LIB-DIAS] DIAS exportado:', DIAS);
