// Formatea el texto de la nota interna (sender_type 'system', ver
// derivacionSucursal.js / devolucionCola.js) que queda en el timeline del
// chat, visible sólo para operadores/sucursales — nunca se envía al cliente
// por WhatsApp. Siempre genera el texto completo, incluso si el operador
// dejó el motivo en blanco: cae en "sin especificar" en vez de omitir la
// nota, para que la estructura sea siempre la misma independientemente de
// si se cargó un motivo o no.
export const formatInternalReason = (action, usuario, razon) => {
  if (action === 'take') {
    // "Mi Farma V" -> "Sucursal Mi Farma V" (si ya empieza con "Sucursal", queda igual).
    const nombre = (usuario || '').trim();
    const conPrefijo = !nombre ? 'Una sucursal' : /^sucursal\b/i.test(nombre) ? nombre : `Sucursal ${nombre}`;
    return `${conPrefijo} tomó la consulta`;
  }
  const origenTexto = usuario || 'Una sucursal';
  const razonLimpia = razon?.trim() ? razon.trim() : 'sin especificar';
  if (action === 'transfer') {
    return `${origenTexto} te pasó el chat por: ${razonLimpia}`;
  }
  if (action === 'return') {
    return `${origenTexto} devolvió este chat por: ${razonLimpia}`;
  }
  return null;
};
