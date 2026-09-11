import { supabase } from '../supabase.js';
import { normalizarTelefono } from './whatsapp.js';

// Edición completa de la ficha del cliente desde el CRM (nombre, DNI, obra
// social y, opcionalmente, el teléfono). A diferencia de guardarDatoCliente
// (que sólo pisa un campo a la vez desde el propio bot), acá el operador
// puede corregir varios datos juntos y, si además cambia el teléfono,
// hace falta renombrar la fila (el client_phone es la clave) y re-vincular
// todas las conversaciones que tenía con el número viejo, para no perder el
// historial ni romper el enganche con el bot.
export const actualizarDatosCliente = async (clientPhoneActual, { nombreCompleto, dni, obraSocial, nuevoTelefono } = {}) => {
  const telefonoActual = normalizarTelefono(clientPhoneActual);
  if (!telefonoActual) throw new Error('Teléfono de cliente inválido.');

  const campos = {};
  if (nombreCompleto !== undefined) campos.nombre_completo = nombreCompleto?.toString().trim() || null;
  if (dni !== undefined) campos.dni = dni?.toString().trim() || null;
  if (obraSocial !== undefined) campos.obra_social = obraSocial?.toString().trim() || null;

  let telefonoFinal = telefonoActual;
  if (nuevoTelefono !== undefined && nuevoTelefono !== null && nuevoTelefono.toString().trim() !== '') {
    const normalizado = normalizarTelefono(nuevoTelefono);
    if (!normalizado) throw new Error('El nuevo teléfono no es válido.');
    telefonoFinal = normalizado;
  }

  const cambiaTelefono = telefonoFinal !== telefonoActual;

  if (cambiaTelefono) {
    const { data: existente, error: existeError } = await supabase
      .from('clientes')
      .select('client_phone')
      .eq('client_phone', telefonoFinal)
      .maybeSingle();
    if (existeError) throw existeError;
    if (existente) throw new Error('Ya existe otro cliente registrado con ese teléfono.');

    campos.client_phone = telefonoFinal;
  }

  campos.updated_at = new Date().toISOString();

  const { data: filaActual, error: fetchError } = await supabase
    .from('clientes')
    .select('client_phone')
    .eq('client_phone', telefonoActual)
    .maybeSingle();
  if (fetchError) throw fetchError;

  let cliente;
  if (filaActual) {
    const { data, error } = await supabase
      .from('clientes')
      .update(campos)
      .eq('client_phone', telefonoActual)
      .select()
      .single();
    if (error) throw error;
    cliente = data;
  } else {
    const { data, error } = await supabase
      .from('clientes')
      .insert([{ client_phone: telefonoActual, ...campos }])
      .select()
      .single();
    if (error) throw error;
    cliente = data;
  }

  // El client_phone vincula todas las conversaciones de este cliente (no sólo
  // la que está abierta ahora mismo en el CRM): si se corrigió el teléfono,
  // las re-apuntamos todas al valor nuevo para no perder el historial.
  if (cambiaTelefono) {
    const { error: convError } = await supabase
      .from('conversations')
      .update({ client_phone: telefonoFinal })
      .eq('client_phone', telefonoActual);
    if (convError) throw convError;
  }

  return cliente;
};
