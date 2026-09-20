import { supabase } from '../supabase.js';
import { normalizarTelefono } from './whatsapp.js';

// Edición completa de la ficha del cliente desde el CRM (nombre, DNI, obra
// social y, opcionalmente, el teléfono). A diferencia de guardarDatoCliente
// (que sólo pisa un campo a la vez desde el propio bot), acá el operador
// puede corregir varios datos juntos y, si además cambia el teléfono, hace
// falta renombrar la fila (el client_phone es la clave). Modelo estricto por
// teléfono: el teléfono viejo NO se reescribe en
// conversations/pedidos_confirmados/pedidos_cotizados (esas filas son el
// snapshot de con qué número se habló/compró en ese momento puntual), y
// tampoco queda ningún rastro/vínculo hacia el número nuevo — de acá en más
// son dos identidades completamente independientes.
export const actualizarDatosCliente = async (clientPhoneActual, { nombreCompleto, dni, obraSocial, nuevoTelefono } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — parámetros recibidos:', { clientPhoneActual, nombreCompleto, dni, obraSocial, nuevoTelefono });

  const telefonoActual = normalizarTelefono(clientPhoneActual);
  console.log('🔍 [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — telefonoActual normalizado:', telefonoActual);
  if (!telefonoActual) {
    console.error('❌ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — teléfono actual inválido:', clientPhoneActual);
    throw new Error('Teléfono de cliente inválido.');
  }

  const campos = {};
  if (nombreCompleto !== undefined) campos.nombre_completo = nombreCompleto?.toString().trim() || null;
  if (dni !== undefined) campos.dni = dni?.toString().trim() || null;
  if (obraSocial !== undefined) campos.obra_social = obraSocial?.toString().trim() || null;

  let telefonoFinal = telefonoActual;
  if (nuevoTelefono !== undefined && nuevoTelefono !== null && nuevoTelefono.toString().trim() !== '') {
    const normalizado = normalizarTelefono(nuevoTelefono);
    console.log('🔍 [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — nuevoTelefono normalizado:', normalizado);
    if (!normalizado) {
      console.error('❌ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — nuevo teléfono inválido:', nuevoTelefono);
      throw new Error('El nuevo teléfono no es válido.');
    }
    telefonoFinal = normalizado;
  }

  const cambiaTelefono = telefonoFinal !== telefonoActual;
  console.log('🔍 [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — cambiaTelefono:', cambiaTelefono, 'telefonoFinal:', telefonoFinal);

  if (cambiaTelefono) {
    console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Query Supabase → tabla: clientes, operación: select, filtro: client_phone =', telefonoFinal);
    const { data: existente, error: existeError } = await supabase
      .from('clientes')
      .select('client_phone')
      .eq('client_phone', telefonoFinal)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Resultado query clientes (select existente) — data:', existente, 'error:', existeError);
    if (existeError) {
      console.error('❌ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — error verificando teléfono existente:', existeError);
      throw existeError;
    }
    if (existente) {
      console.error('❌ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — ya existe otro cliente con ese teléfono:', telefonoFinal);
      throw new Error('Ya existe otro cliente registrado con ese teléfono.');
    }

    campos.client_phone = telefonoFinal;
  }

  campos.updated_at = new Date().toISOString();
  console.log('🔍 [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — campos a aplicar:', campos);

  console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Query Supabase → tabla: clientes, operación: select, filtro: client_phone =', telefonoActual);
  const { data: filaActual, error: fetchError } = await supabase
    .from('clientes')
    .select('client_phone')
    .eq('client_phone', telefonoActual)
    .maybeSingle();
  console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Resultado query clientes (select filaActual) — data:', filaActual, 'error:', fetchError);
  if (fetchError) {
    console.error('❌ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — error consultando fila actual:', fetchError);
    throw fetchError;
  }

  let cliente;
  if (filaActual) {
    console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Query Supabase → tabla: clientes, operación: update, filtro: client_phone =', telefonoActual, ', valores:', campos);
    const { data, error } = await supabase
      .from('clientes')
      .update(campos)
      .eq('client_phone', telefonoActual)
      .select()
      .single();
    console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Resultado query clientes (update) — data:', data, 'error:', error);
    if (error) {
      console.error('❌ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — error actualizando cliente:', error);
      throw error;
    }
    cliente = data;
  } else {
    console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Query Supabase → tabla: clientes, operación: insert, valores:', { client_phone: telefonoActual, ...campos });
    const { data, error } = await supabase
      .from('clientes')
      .insert([{ client_phone: telefonoActual, ...campos }])
      .select()
      .single();
    console.log('📡 [DEBUG-SERVICE-CLIENTESADMIN] Resultado query clientes (insert) — data:', data, 'error:', error);
    if (error) {
      console.error('❌ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — error insertando cliente:', error);
      throw error;
    }
    cliente = data;
  }

  console.log('✅ [DEBUG-SERVICE-CLIENTESADMIN] actualizarDatosCliente() — valor de retorno:', cliente);
  return cliente;
};
