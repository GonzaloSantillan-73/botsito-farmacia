import React from 'react';
import { Star } from 'lucide-react';

// Regla de color única para toda la UI del admin: atención siempre en
// amarillo/ámbar, producto siempre en azul. Cualquier lugar nuevo que
// muestre una calificación debería usar este componente en vez de armar
// el ícono a mano, para no volver a desincronizar los colores.
const COLOR_POR_TIPO = {
  atencion: { texto: 'text-amber-500', estrella: 'text-amber-500 fill-amber-500', barra: 'bg-amber-500' },
  producto: { texto: 'text-blue-500', estrella: 'text-blue-500 fill-blue-500', barra: 'bg-blue-500' }
};

export const coloresRating = (tipo) => COLOR_POR_TIPO[tipo] || COLOR_POR_TIPO.atencion;

// `value` ya viene formateado por quien lo llama (entero para una
// calificación puntual, con un decimal para un promedio) para no imponerle
// acá una regla de formato que no le sirve a todos los casos. El peso de
// fuente no se fija acá (a propósito, para no pisar un font-bold del
// llamador con conflictos de especificidad): agregalo vía `className` si
// hace falta (ej. "font-medium").
export default function StarRating({ value, type = 'atencion', size = 12, className = '' }) {
  console.log('🔍 [DEBUG-COMPONENT-StarRating] StarRating() — props:', { value, type, size, className });
  const colores = coloresRating(type);
  return (
    <span className={`inline-flex items-center gap-0.5 ${colores.texto} ${className}`}>
      {value}
      <Star size={size} className={colores.estrella} />
    </span>
  );
}
