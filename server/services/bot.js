import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { getBotKeyword } from './appConfig.js';
import { getBotSchedule, getHumanSchedule, isWithinSchedule, renderScheduleMessage } from './scheduleConfig.js';
import { getSucursalesActivas, formatearMensajeSucursales } from './sucursales.js';
import { getCliente, tieneRegistroCompleto, guardarDatoCliente } from './clientes.js';

// Todas las opciones del bot se muestran como texto plano dentro del propio chat
// (nada de botones/listas nativas de Meta). Cada mensaje separa con saltos de línea
// el contenido de las instrucciones y de las opciones de navegación, para que nunca
// quede todo amontonado en una sola oración.
export const MENSAJE_BIENVENIDA = '¡Hola! Soy el bot de la Farmacia. 💊\n\n¿Qué querés hacer?\n\na. Hablar con un humano\nb. Horarios y sucursales\nc. Actualizar mis datos';

const MENSAJE_ERROR_SUCURSALES = 'Tuvimos un problema consultando las sucursales.\n\nPor favor, intentá de nuevo en un momento.';
const MENSAJE_ERROR_DERIVACION = 'Tuvimos un problema derivándote con un asesor.\n\nPor favor, intentá de nuevo en un momento.';

// Registro de datos personales: se le pide al cliente la primera vez que
// escribe (antes de mostrarle el menú) y puede volver a hacerse desde
// "c. Actualizar mis datos". Cada dato se guarda apenas se confirma (no se
// espera a tener los tres), así que si el cliente abandona a mitad de
// camino no se pierde lo ya cargado.
const MENSAJE_PEDIR_NOMBRE = '¿Cuál es tu nombre completo?';
const MENSAJE_PEDIR_DNI = '¿Cuál es tu número de DNI?';
const MENSAJE_PEDIR_OBRA_SOCIAL = '¿Tenés obra social?\n\nSi es así, escribí cuál. Si no tenés, escribí "no".';
const MENSAJE_ERROR_REGISTRO = 'Tuvimos un problema guardando tus datos.\n\nPor favor, intentá de nuevo en un momento.';

const MENSAJE_POR_ESTADO_REGISTRO = {
  registro_nombre: MENSAJE_PEDIR_NOMBRE,
  registro_dni: MENSAJE_PEDIR_DNI,
  registro_obra_social: MENSAJE_PEDIR_OBRA_SOCIAL
};

// Si el registro se había interrumpido a mitad de camino, retomamos desde el
// primer dato que falte en vez de volver a pedir todo desde cero.
const determinarEstadoRegistro = (cliente) => {
  if (!cliente?.nombre_completo) return 'registro_nombre';
  if (!cliente?.dni) return 'registro_dni';
  return 'registro_obra_social';
};

const mensajeDerivacionHumano = (keyword) =>
  `Entendido, te estamos derivando con un asesor humano.\n\nEn breve se pondrán en contacto contigo. Si en cualquier momento querés volver a hablar con el bot, escribí la palabra "${keyword}".`;

// Todos los cambios de estado de la conversación (pasar a 'esperando', volver
// a 'open', etc.) pasan por acá. Antes cada .update() se disparaba "a ciegas"
// sin mirar el resultado: si fallaba (ej. una columna que todavía no existe
// en la base porque falta correr una migración, o una RLS que lo bloquea) el
// error quedaba silencioso y la conversación se quedaba pegada en el estado
// viejo sin que nada lo avisara. Acá lo logueamos siempre, fuerte y claro.
const actualizarEstadoConversacion = async (conversationId, updates) => {
  const { error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId);

  if (error) {
    console.error(`[BOT] ❌ ERROR actualizando conversación ${conversationId} con`, updates, '->', error);
    return false;
  }

  console.log(`[BOT] ✅ Conversación ${conversationId} actualizada:`, updates);
  return true;
};

export const procesarMensajeBot = async (texto, conversationId, telefono, isNewSession = false) => {
  console.log(`[BOT] Procesando mensaje: "${texto}" para conversación ${conversationId} (nueva sesión: ${isNewSession})`);

  try {
    // Si la consulta es nueva (no existía, o la anterior expiró/finalizó), siempre se
    // reinicia el ciclo con el menú de bienvenida, sin importar qué haya escrito el cliente.
    // Salvo que el bot esté fuera de su horario configurado.
    if (isNewSession) {
      const botSchedule = await getBotSchedule();
      if (!isWithinSchedule(botSchedule)) {
        console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule));
        return;
      }

      const cliente = await getCliente(telefono);
      if (!tieneRegistroCompleto(cliente)) {
        console.log(`[BOT] Cliente ${telefono} sin datos registrados. Iniciando registro antes del menú.`);
        await iniciarRegistro(conversationId, telefono, false, cliente);
        return;
      }

      await volverAlMenuPrincipal(conversationId, telefono);
      return;
    }

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('status, bot_state, bot_context')
      .eq('id', conversationId)
      .single();

    if (convError) {
      console.error('[BOT] Error obteniendo el estado de la conversación:', convError);
    }

    const t = texto.trim();

    // Modo humano: el bot se silencia por completo mientras un asesor atiende la
    // conversación. La única entrada que procesa es la palabra clave configurada para reactivarse.
    if (conv?.status === 'esperando') {
      const botKeyword = await getBotKeyword();
      if (t.toLowerCase() === botKeyword.toLowerCase()) {
        console.log(`[BOT] Comando "${botKeyword}" recibido en ${conversationId}. Reactivando bot y volviendo al menú principal.`);
        await volverAlMenuPrincipal(conversationId, telefono);
      } else {
        console.log(`[BOT] Conversación ${conversationId} en modo humano ('esperando'). Bot silenciado, no se responde.`);
      }
      return;
    }

    const botSchedule = await getBotSchedule();
    if (!isWithinSchedule(botSchedule)) {
      console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
      await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule));
      return;
    }

    const estado = conv?.bot_state || null;

    if (estado === 'registro_nombre' || estado === 'registro_dni' || estado === 'registro_obra_social') {
      await manejarPasoRegistro(conversationId, telefono, t, estado, conv?.bot_context);
      return;
    }

    // Estado normal: menú principal
    const tLower = t.toLowerCase();
    if (tLower === 'a') {
      const humanSchedule = await getHumanSchedule();
      if (!isWithinSchedule(humanSchedule)) {
        console.log(`[BOT] Se pidió un humano fuera de su horario de atención para ${conversationId}.`);
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(humanSchedule));
        return;
      }

      const botKeyword = await getBotKeyword();

      console.log(`[BOT] Derivando a un asesor humano y actualizando estado a 'esperando' para ID: ${conversationId}`);
      const actualizado = await actualizarEstadoConversacion(conversationId, {
        status: 'esperando',
        bot_state: null,
        bot_context: null,
        waiting_since: new Date().toISOString()
      });

      // Si el UPDATE a 'esperando' falló, no confirmamos la derivación al cliente:
      // sería mentirle que ya lo estamos pasando a un asesor cuando en realidad
      // la conversación se quedó pegada en el bot.
      if (!actualizado) {
        await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_DERIVACION);
        return;
      }

      await enviarMensajeBot(conversationId, telefono, mensajeDerivacionHumano(botKeyword));
    } else if (tLower === 'b') {
      await mostrarSucursales(conversationId, telefono);
    } else if (tLower === 'c') {
      await iniciarRegistro(conversationId, telefono, true, null);
    } else {
      await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
    }
  } catch (error) {
    console.error(`[BOT] Error procesando mensaje del bot:`, error);
  }
};

// Consulta informativa: no cambia el bot_state, el cliente se queda en el
// menú principal y puede seguir eligiendo cualquier otra opción normalmente.
const mostrarSucursales = async (conversationId, telefono) => {
  let sucursales;
  try {
    sucursales = await getSucursalesActivas();
  } catch (err) {
    console.error('[BOT] Error obteniendo las sucursales:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_SUCURSALES);
    return;
  }

  try {
    await enviarMensajeBot(conversationId, telefono, formatearMensajeSucursales(sucursales));
  } catch (err) {
    // Un fallo transitorio al enviar el listado de sucursales no debe impedir
    // que igual le reenviemos el menú principal a continuación.
    console.error('[BOT] Error enviando el mensaje de sucursales:', err);
  }

  // Es una consulta informativa (no cambia el bot_state), pero igual reenviamos
  // el menú principal para que el cliente no quede sin saber cómo seguir.
  await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
};

// Arranca (o retoma) el flujo de registro de datos personales. `esActualizacion`
// distingue el registro inicial obligatorio (antes de mostrar el menú) de la
// actualización voluntaria desde "c. Actualizar mis datos": en la actualización
// siempre se vuelve a pedir todo desde el nombre, para que el cliente pueda
// corregir cualquier dato ya cargado.
const iniciarRegistro = async (conversationId, telefono, esActualizacion, clienteActual) => {
  const estadoInicio = esActualizacion ? 'registro_nombre' : determinarEstadoRegistro(clienteActual);
  await supabase
    .from('conversations')
    .update({ bot_state: estadoInicio, bot_context: { actualizando: esActualizacion } })
    .eq('id', conversationId);

  const pregunta = MENSAJE_POR_ESTADO_REGISTRO[estadoInicio];
  const intro = esActualizacion
    ? 'Vamos a actualizar tus datos.\n\n'
    : (estadoInicio === 'registro_nombre' ? '¡Hola! Bienvenido a la Farmacia. 💊\n\nAntes de continuar, necesitamos algunos datos tuyos.\n\n' : '');
  await enviarMensajeBot(conversationId, telefono, `${intro}${pregunta}`);
};

const manejarPasoRegistro = async (conversationId, telefono, t, estado, botContext) => {
  if (estado === 'registro_nombre') {
    const nombre = t.trim();
    if (nombre.length < 3) {
      await enviarMensajeBot(conversationId, telefono, `Ese nombre no parece válido.\n\n${MENSAJE_PEDIR_NOMBRE}`);
      return;
    }
    try {
      await guardarDatoCliente(telefono, 'nombre_completo', nombre);
    } catch (err) {
      console.error('[BOT] Error guardando el nombre del cliente:', err);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO);
      return;
    }
    await supabase.from('conversations').update({ bot_state: 'registro_dni' }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, `Gracias, ${nombre.split(' ')[0]}.\n\n${MENSAJE_PEDIR_DNI}`);
    return;
  }

  if (estado === 'registro_dni') {
    const dni = t.replace(/[.\s]/g, '');
    if (!/^\d{6,10}$/.test(dni)) {
      await enviarMensajeBot(conversationId, telefono, `Ese DNI no parece válido. Escribilo solo con números (por ejemplo: 30123456).\n\n${MENSAJE_PEDIR_DNI}`);
      return;
    }
    try {
      await guardarDatoCliente(telefono, 'dni', dni);
    } catch (err) {
      console.error('[BOT] Error guardando el DNI del cliente:', err);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO);
      return;
    }
    await supabase.from('conversations').update({ bot_state: 'registro_obra_social' }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_OBRA_SOCIAL);
    return;
  }

  // registro_obra_social
  const respuesta = t.trim();
  if (!respuesta) {
    await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_OBRA_SOCIAL);
    return;
  }
  const sinObraSocial = ['no', 'no tengo', 'ninguna', 'n/a', 'nose', 'no se'].includes(respuesta.toLowerCase());

  try {
    await guardarDatoCliente(telefono, 'obra_social', sinObraSocial ? null : respuesta);
  } catch (err) {
    console.error('[BOT] Error guardando la obra social del cliente:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO);
    return;
  }

  const esActualizacion = !!botContext?.actualizando;
  await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
  await enviarMensajeBot(
    conversationId,
    telefono,
    `${esActualizacion ? '✅ ¡Listo! Actualizamos tus datos.' : '✅ ¡Gracias! Ya registramos tus datos.'}\n\n${MENSAJE_BIENVENIDA}`
  );
};

const volverAlMenuPrincipal = async (conversationId, telefono) => {
  // 'open' saca a la conversación del modo humano ('esperando') y la vuelve a
  // dejar en la cola de "Entrantes" (bot respondiendo automáticamente).
  await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
  await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
};

export const enviarMensajeBot = async (conversationId, telefono, mensaje) => {
  console.log(`[BOT] Enviando respuesta a ${telefono}...`);
  // Guardar mensaje en base de datos como pendiente
  const { data: insertData, error: insertError } = await supabase.from('messages').insert([{
    conversation_id: conversationId,
    sender_type: 'bot', // Usamos 'bot' para distinguirlo de 'agent'
    message_text: mensaje,
    estado: 'pendiente'
  }]).select().single();

  if (insertError) {
    console.error(`[BOT] Error insertando mensaje del bot:`, insertError);
    return;
  }

  // Enviar a Meta
  const metaResponse = await sendWhatsAppMessage(telefono, mensaje);
  const wamid = metaResponse?.messages?.[0]?.id;

  // Actualizar wamid y estado
  if (wamid) {
    await supabase.from('messages')
      .update({ estado: 'enviado', wamid: wamid })
      .eq('id', insertData.id);
  }

  // Actualizar last_message de la conversación
  await supabase.from('conversations')
    .update({ last_message: mensaje })
    .eq('id', conversationId);
};
