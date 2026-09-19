import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { getBotKeyword, getWelcomeMessage, getFrequentClientMessage, getFrequentClientThreshold } from './appConfig.js';
import { getBotSchedule, isWithinSchedule, renderScheduleMessage } from './scheduleConfig.js';
import { getSucursalesActivas, formatearMensajeSucursales } from './sucursales.js';
import { getCliente, tieneRegistroCompleto, guardarDatoCliente, incrementarInteraccionesBot, dniPerteneceAOtroCliente } from './clientes.js';
import { sucursalesMasCercanas } from './geolocalizacion.js';
import { extraerCoordenadasDeMensaje } from './mapsLocation.js';

// Todas las opciones del bot se muestran como texto plano dentro del propio chat
// (nada de botones/listas nativas de Meta). Cada mensaje separa con saltos de línea
// el contenido de las instrucciones y de las opciones de navegación, para que nunca
// quede todo amontonado en una sola oración.
//
// El saludo es personalizable desde el CRM (ver appConfig.getWelcomeMessage /
// BotKeywordPanel-style panel), pero el menú numerado queda fijo acá porque
// los números están atados 1:1 a los manejadores de abajo (tLower === '1'/'2'/'3').
const MENU_OPCIONES = '¿Qué querés hacer?\n\n1. Hablar con un humano\n2. Horarios y sucursales\n3. Actualizar mis datos';

// esFrecuente reemplaza el saludo personalizable por frequent_client_message
// (ver appConfig.js) cuando el cliente ya usó el bot frequent_client_threshold
// veces o más antes de esta sesión — el menú numerado de abajo se agrega
// siempre igual, en los dos casos.
const construirMensajeBienvenida = async (esFrecuente = false) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] construirMensajeBienvenida() — parámetros recibidos:', { esFrecuente });
  const saludo = esFrecuente ? await getFrequentClientMessage() : await getWelcomeMessage();
  const resultado = `${saludo}\n\n${MENU_OPCIONES}`;
  console.log('✅ [DEBUG-SERVICE-BOT] construirMensajeBienvenida() — valor de retorno:', resultado);
  return resultado;
};

const MENSAJE_ERROR_SUCURSALES = 'Tuvimos un problema consultando las sucursales.\n\nPor favor, intentá de nuevo en un momento.';
const MENSAJE_ERROR_DERIVACION = 'Tuvimos un problema derivándote con un asesor.\n\nPor favor, intentá de nuevo en un momento.';

// Antes de derivar a un humano le pedimos la ubicación al cliente, para poder
// recomendarle (a él y al operador que lo atienda) la sucursal más cercana.
// Acepta dos formas: el botón nativo "Ubicación" de WhatsApp, o pegar como
// texto un link de Google Maps (largo o acortado tipo maps.app.goo.gl).
const MENSAJE_PEDIR_UBICACION = 'Para poder recomendarte la sucursal más cercana, compartí tu ubicación 📍\n\nPodés usar el botón de "Ubicación" de WhatsApp (📎 → Ubicación → Ubicación actual), o pegar acá el link de Google Maps de dónde estás.';
const MENSAJE_UBICACION_INVALIDA = 'No pude reconocer esa ubicación. 😕\n\nProbá compartiendo tu ubicación con el botón de WhatsApp, o pegando un link de Google Maps (por ejemplo: https://maps.app.goo.gl/...).';
// Ninguna sucursal cercana está atendiendo en este momento (ver
// sucursalAbiertaMasCercana en geolocalizacion.js): ya no existe un horario
// global de "Asesores Humanos", así que este es el único mensaje de "fuera
// de horario" para la derivación a un humano.
const MENSAJE_SIN_SUCURSAL_DISPONIBLE = 'En este momento no tenemos ninguna sucursal cercana a tu ubicación atendiendo. 🕒\n\nEscribinos tu consulta y te vamos a responder apenas abramos, o intentá de nuevo más tarde.';

// Registro de datos personales: se le pide al cliente la primera vez que
// escribe (antes de mostrarle el menú) y puede volver a hacerse desde
// "3. Actualizar mis datos". Cada dato se guarda apenas se confirma (no se
// espera a tener los tres), así que si el cliente abandona a mitad de
// camino no se pierde lo ya cargado.
const MENSAJE_PEDIR_NOMBRE = '¿Cuál es tu nombre completo?';
const MENSAJE_PEDIR_DNI = '¿Cuál es tu número de DNI?';
const MENSAJE_ERROR_REGISTRO = 'Tuvimos un problema guardando tus datos.\n\nPor favor, intentá de nuevo en un momento.';

const MENSAJE_POR_ESTADO_REGISTRO = {
  registro_nombre: MENSAJE_PEDIR_NOMBRE,
  registro_dni: MENSAJE_PEDIR_DNI
};

// Edición voluntaria de UN dato puntual ya cargado (a diferencia del registro
// obligatorio de arriba, que siempre pide nombre y DNI seguidos): el cliente
// elige desde este menú qué campo corregir, en vez de tener que repasar los
// dos de nuevo. Se entra acá desde "3. Actualizar mis datos" del menú
// principal, sólo cuando el registro ya está completo (si todavía falta
// algún dato, "3" sigue yendo al registro obligatorio de siempre).
const MENU_EDITAR_DATOS = '¿Qué dato querés modificar?\n\n1. Nombre completo\n2. DNI\n3. Volver al menú principal';
const MENSAJE_CANCELAR_HINT = '\n\n(Escribí 0 para cancelar y volver)';
const MENSAJE_PEDIR_NUEVO_NOMBRE = `¿Cuál es tu nuevo nombre completo?${MENSAJE_CANCELAR_HINT}`;
const MENSAJE_PEDIR_NUEVO_DNI = `¿Cuál es tu nuevo DNI?${MENSAJE_CANCELAR_HINT}`;
const MENSAJE_NOMBRE_INVALIDO = 'Ese nombre no es válido. Ingresá tu nombre y apellido, sólo con letras (sin números ni símbolos). Por ejemplo: Juan Pérez.';
const MENSAJE_DNI_INVALIDO = 'El DNI ingresado no es válido. Ingresá sólo números, de 7 u 8 dígitos.';
const MENSAJE_DNI_DUPLICADO = 'Ese DNI ya está registrado con otro número de teléfono. Si creés que es un error, escribinos tu consulta y te ayudamos a resolverlo.';

// Nombre y apellido (al menos 2 palabras), sólo letras con acentos/ñ — nada
// de números ni símbolos. DNI argentino: 7 u 8 dígitos exactos (más estricto
// que el 6-10 que acepta el registro obligatorio inicial, a pedido explícito
// para este flujo de edición).
const NOMBRE_EDICION_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)+$/;
const DNI_EDICION_REGEX = /^\d{7,8}$/;

const esCancelacion = (t) => ['0', 'cancelar'].includes((t || '').trim().toLowerCase());

// Si el registro se había interrumpido a mitad de camino, retomamos desde el
// primer dato que falte en vez de volver a pedir todo desde cero. Devuelve
// null cuando ya están los dos datos (registro completo, no queda nada por pedir).
const determinarEstadoRegistro = (cliente) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] determinarEstadoRegistro() — parámetros recibidos:', { cliente });
  if (!cliente?.nombre_completo) {
    console.log('✅ [DEBUG-SERVICE-BOT] determinarEstadoRegistro() — falta nombre_completo, valor de retorno: registro_nombre');
    return 'registro_nombre';
  }
  if (!cliente?.dni) {
    console.log('✅ [DEBUG-SERVICE-BOT] determinarEstadoRegistro() — falta dni, valor de retorno: registro_dni');
    return 'registro_dni';
  }
  console.log('✅ [DEBUG-SERVICE-BOT] determinarEstadoRegistro() — nombre y dni presentes, valor de retorno: null (registro completo)');
  return null;
};

const mensajeDerivacionHumano = (keyword) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] mensajeDerivacionHumano() — parámetros recibidos:', { keyword });
  const resultado = `Entendido, te estamos derivando con un asesor humano.\n\nEn breve se pondrán en contacto contigo. Si en cualquier momento querés volver a hablar con el bot, escribí la palabra "${keyword}".`;
  console.log('✅ [DEBUG-SERVICE-BOT] mensajeDerivacionHumano() — valor de retorno:', resultado);
  return resultado;
};

// Todos los cambios de estado de la conversación (pasar a 'esperando', volver
// a 'open', etc.) pasan por acá. Antes cada .update() se disparaba "a ciegas"
// sin mirar el resultado: si fallaba (ej. una columna que todavía no existe
// en la base porque falta correr una migración, o una RLS que lo bloquea) el
// error quedaba silencioso y la conversación se quedaba pegada en el estado
// viejo sin que nada lo avisara. Acá lo logueamos siempre, fuerte y claro.
const actualizarEstadoConversacion = async (conversationId, updates) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] actualizarEstadoConversacion() — parámetros recibidos:', { conversationId, updates });

  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: conversations, operación: update, filtro: id =', conversationId, ', valores:', updates);
  const { error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId);
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query conversations (update estado) — error:', error);

  if (error) {
    console.error(`[BOT] ❌ ERROR actualizando conversación ${conversationId} con`, updates, '->', error);
    console.error('❌ [DEBUG-SERVICE-BOT] actualizarEstadoConversacion() — error:', error?.message, error?.stack);
    console.log('✅ [DEBUG-SERVICE-BOT] actualizarEstadoConversacion() — valor de retorno: false');
    return false;
  }

  console.log(`[BOT] ✅ Conversación ${conversationId} actualizada:`, updates);
  console.log('✅ [DEBUG-SERVICE-BOT] actualizarEstadoConversacion() — valor de retorno: true');
  return true;
};

export const procesarMensajeBot = async (texto, conversationId, telefono, isNewSession = false) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — parámetros recibidos:', { texto, conversationId, telefono, isNewSession });
  console.log(`[BOT] Procesando mensaje: "${texto}" para conversación ${conversationId} (nueva sesión: ${isNewSession})`);

  try {
    // Si la consulta es nueva (no existía, o la anterior expiró/finalizó), siempre se
    // reinicia el ciclo con el menú de bienvenida, sin importar qué haya escrito el cliente.
    // Salvo que el bot esté fuera de su horario configurado.
    if (isNewSession) {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: isNewSession=true. Consultando horario del bot.');
      const botSchedule = await getBotSchedule();
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — botSchedule:', botSchedule);
      if (!isWithinSchedule(botSchedule)) {
        console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
        console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: fuera de horario del bot (sesión nueva). Se envía mensaje de horario y se corta el flujo.');
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule));
        console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado por fuera de horario en sesión nueva)');
        return;
      }

      const cliente = await getCliente(telefono);
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — cliente obtenido:', cliente);

      // Se cuenta esta sesión nueva ACÁ (una vez por consulta, no en cada
      // mensaje suelto) y el umbral se compara contra las sesiones previas
      // SIN contar esta: con threshold=3, el saludo especial aparece recién
      // a partir de la 4ta consulta del cliente (ya usó el bot 3 veces antes).
      const interaccionesPrevias = cliente?.interacciones_bot || 0;
      try {
        await incrementarInteraccionesBot(telefono, interaccionesPrevias);
      } catch (err) {
        // No debe impedir que el cliente arranque su consulta si esto falla.
        console.error('❌ [DEBUG-SERVICE-BOT] procesarMensajeBot() — error incrementando interacciones_bot (no corta el flujo):', err?.message, err?.stack);
      }

      if (!tieneRegistroCompleto(cliente)) {
        console.log(`[BOT] Cliente ${telefono} sin datos registrados. Iniciando registro antes del menú.`);
        console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: cliente sin registro completo (sesión nueva). Se deriva a iniciarRegistro().');
        await iniciarRegistro(conversationId, telefono, cliente);
        console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado tras iniciar registro en sesión nueva)');
        return;
      }

      const threshold = await getFrequentClientThreshold();
      const esFrecuente = interaccionesPrevias >= threshold;
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: sesión nueva con cliente ya registrado. interaccionesPrevias:', interaccionesPrevias, ', threshold:', threshold, ', esFrecuente:', esFrecuente, '. Se deriva a volverAlMenuPrincipal().');
      await volverAlMenuPrincipal(conversationId, telefono, esFrecuente);
      console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado tras volver al menú principal en sesión nueva)');
      return;
    }

    console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: conversations, operación: select (status, bot_state, bot_context), filtro: id =', conversationId);
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('status, bot_state, bot_context')
      .eq('id', conversationId)
      .single();
    console.log('📡 [DEBUG-SERVICE-BOT] Resultado query conversations (select estado actual) — data:', conv, 'error:', convError);

    if (convError) {
      console.error('[BOT] Error obteniendo el estado de la conversación:', convError);
      console.error('❌ [DEBUG-SERVICE-BOT] procesarMensajeBot() — error obteniendo estado de conversación:', convError?.message, convError?.stack);
    }

    const t = texto.trim();
    console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — texto trim:', t, ', status actual:', conv?.status, ', bot_state actual:', conv?.bot_state);

    // Modo humano: el bot se silencia por completo mientras un asesor atiende la
    // conversación. La única entrada que procesa es la palabra clave configurada para reactivarse.
    if (conv?.status === 'esperando') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: status = "esperando" (modo humano). Consultando palabra clave de reactivación.');
      const botKeyword = await getBotKeyword();
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — botKeyword configurada:', botKeyword, ', texto recibido (lower):', t.toLowerCase());
      if (t.toLowerCase() === botKeyword.toLowerCase()) {
        console.log(`[BOT] Comando "${botKeyword}" recibido en ${conversationId}. Reactivando bot y volviendo al menú principal.`);
        console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: palabra clave matcheó. Se reactiva el bot.');
        await volverAlMenuPrincipal(conversationId, telefono);
      } else {
        console.log(`[BOT] Conversación ${conversationId} en modo humano ('esperando'). Bot silenciado, no se responde.`);
        console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: palabra clave NO matcheó. Bot permanece silenciado, no se responde.');
      }
      console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado por modo humano/esperando)');
      return;
    }

    const botSchedule = await getBotSchedule();
    console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — botSchedule (fuera de sesión nueva):', botSchedule);
    if (!isWithinSchedule(botSchedule)) {
      console.log(`[BOT] Fuera de horario del bot para ${conversationId}. Enviando aviso de horario.`);
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: fuera de horario del bot (mensaje normal). Se envía aviso y se corta el flujo.');
      await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule));
      console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado por fuera de horario)');
      return;
    }

    const estado = conv?.bot_state || null;
    console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — estado (bot_state) resuelto:', estado);

    if (estado === 'registro_nombre' || estado === 'registro_dni') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: estado de registro en curso (', estado, '). Se deriva a manejarPasoRegistro().');
      await manejarPasoRegistro(conversationId, telefono, t, estado);
      console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado tras manejarPasoRegistro)');
      return;
    }

    if (estado === 'editar_datos_menu' || estado === 'editar_nombre' || estado === 'editar_dni') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: edición voluntaria de datos en curso (', estado, '). Se deriva a manejarEdicionDatos().');
      await manejarEdicionDatos(conversationId, telefono, t, estado);
      console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado tras manejarEdicionDatos)');
      return;
    }

    if (estado === 'esperando_ubicacion') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: esperando_ubicacion. Se deriva a manejarUbicacionHumano().');
      await manejarUbicacionHumano(conversationId, telefono, t);
      console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado tras manejarUbicacionHumano)');
      return;
    }

    // Estado normal: menú principal
    const tLower = t.toLowerCase();
    console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: menú principal. Opción elegida (tLower):', tLower);
    if (tLower === '1') {
      // Ya no hay un horario global de "Asesores Humanos": la disponibilidad
      // depende de la sucursal que corresponda según dónde esté el cliente,
      // y eso recién se sabe cuando comparte la ubicación (ver
      // manejarUbicacionHumano más abajo), así que acá se pide directo.
      console.log(`[BOT] Pidiendo ubicación antes de derivar a un asesor humano para ID: ${conversationId}`);
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — se pasa a estado esperando_ubicacion.');
      await actualizarEstadoConversacion(conversationId, { bot_state: 'esperando_ubicacion', bot_context: null });
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_UBICACION);
    } else if (tLower === '2') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — opción "2" (Horarios y sucursales). Se deriva a mostrarSucursales().');
      await mostrarSucursales(conversationId, telefono);
    } else if (tLower === '3') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — opción "3" (Actualizar mis datos). Se deriva a iniciarEdicionDatos().');
      await iniciarEdicionDatos(conversationId, telefono);
    } else {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — opción no reconocida ("', tLower, '"). Se reenvía el menú de bienvenida.');
      await enviarMensajeBot(conversationId, telefono, await construirMensajeBienvenida());
    }
    console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (fin normal del flujo de menú principal)');
  } catch (error) {
    console.error(`[BOT] Error procesando mensaje del bot:`, error);
    console.error('❌ [DEBUG-SERVICE-BOT] procesarMensajeBot() — error atrapado en catch:', error?.message, error?.stack);
  }
};

// Consulta informativa: no cambia el bot_state, el cliente se queda en el
// menú principal y puede seguir eligiendo cualquier otra opción normalmente.
const mostrarSucursales = async (conversationId, telefono) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] mostrarSucursales() — parámetros recibidos:', { conversationId, telefono });

  let sucursales;
  try {
    sucursales = await getSucursalesActivas();
    console.log('🔍 [DEBUG-SERVICE-BOT] mostrarSucursales() — sucursales obtenidas:', sucursales);
  } catch (err) {
    console.error('[BOT] Error obteniendo las sucursales:', err);
    console.error('❌ [DEBUG-SERVICE-BOT] mostrarSucursales() — error obteniendo sucursales:', err?.message, err?.stack);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_SUCURSALES);
    console.log('✅ [DEBUG-SERVICE-BOT] mostrarSucursales() — valor de retorno: undefined (cortado por error consultando sucursales)');
    return;
  }

  try {
    await enviarMensajeBot(conversationId, telefono, formatearMensajeSucursales(sucursales));
  } catch (err) {
    // Un fallo transitorio al enviar el listado de sucursales no debe impedir
    // que igual le reenviemos el menú principal a continuación.
    console.error('[BOT] Error enviando el mensaje de sucursales:', err);
    console.error('❌ [DEBUG-SERVICE-BOT] mostrarSucursales() — error enviando mensaje de sucursales (no se corta el flujo):', err?.message, err?.stack);
  }

  // Es una consulta informativa (no cambia el bot_state), pero igual reenviamos
  // el menú principal para que el cliente no quede sin saber cómo seguir.
  await enviarMensajeBot(conversationId, telefono, await construirMensajeBienvenida());
  console.log('✅ [DEBUG-SERVICE-BOT] mostrarSucursales() — valor de retorno: undefined (fin normal)');
};

// Recibe la respuesta del cliente mientras el bot está esperando su
// ubicación (bot_state 'esperando_ubicacion', ver arriba). Acepta dos
// formatos:
//  - Nativo: WhatsApp manda la ubicación como JSON { lat, lng, name?, address? }
//    (ver webhook.js, media_type 'location').
//  - Link de texto: el cliente pega un link de Google Maps (largo o
//    acortado); se le sacan las coordenadas seguiendo la redirección si hace falta.
// Con las coordenadas que sea, calcula las 2 sucursales más cercanas
// (Haversine), las guarda junto con la ubicación en la conversación y recién
// ahí deriva a un asesor humano.
const manejarUbicacionHumano = async (conversationId, telefono, t) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — parámetros recibidos:', { conversationId, telefono, t });

  let coords = null;

  try {
    const parsed = JSON.parse(t);
    if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
      coords = { lat: parsed.lat, lng: parsed.lng };
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — rama: ubicación nativa (JSON) parseada correctamente:', coords);
    }
  } catch {
    // No era un JSON de ubicación nativa: puede ser un link de texto, se prueba abajo.
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — rama: el texto no es un JSON de ubicación nativa, se intentará como link de Maps.');
  }

  if (!coords) {
    coords = await extraerCoordenadasDeMensaje(t);
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — coordenadas extraídas de link de Maps:', coords);
  }

  if (!coords) {
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — rama: no se pudieron obtener coordenadas. Se avisa ubicación inválida.');
    await enviarMensajeBot(conversationId, telefono, MENSAJE_UBICACION_INVALIDA);
    console.log('✅ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — valor de retorno: undefined (cortado por ubicación inválida)');
    return;
  }

  let recomendadas = [];
  try {
    recomendadas = await sucursalesMasCercanas(coords.lat, coords.lng, 2);
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — sucursales más cercanas calculadas:', recomendadas);
  } catch (err) {
    // Si falla el cálculo de cercanía no bloqueamos la derivación: el
    // operador puede recomendar la sucursal a mano igual.
    console.error('[BOT] Error calculando sucursales más cercanas:', err);
    console.error('❌ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — error calculando sucursales más cercanas (no se corta el flujo):', err?.message, err?.stack);
  }

  // Ya no hay horario global de "Asesores Humanos": la disponibilidad se
  // valida acá, contra el horario real de las sucursales cercanas a la
  // ubicación que el cliente acaba de compartir (sucursalesMasCercanas ya
  // prioriza las que están abiertas ahora). Si hay candidatas pero NINGUNA
  // está atendiendo en este momento, no se lo deriva a la cola: se le avisa
  // en vez de dejarlo esperando a alguien que no va a aparecer. Si el
  // cálculo falló o no hay sucursales con coordenadas (recomendadas vacío),
  // no se bloquea: el operador puede recomendarle la sucursal a mano igual.
  if (recomendadas.length > 0 && !recomendadas.some(s => s.abierta_ahora)) {
    console.log(`[BOT] Ninguna sucursal cercana está atendiendo ahora mismo para ${conversationId}.`);
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — rama: ninguna sucursal cercana abierta. Se avisa y se corta el flujo.');
    await actualizarEstadoConversacion(conversationId, { bot_state: null, bot_context: null });
    await enviarMensajeBot(conversationId, telefono, MENSAJE_SIN_SUCURSAL_DISPONIBLE);
    console.log('✅ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — valor de retorno: undefined (cortado por ninguna sucursal abierta)');
    return;
  }

  const botKeyword = await getBotKeyword();
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — botKeyword:', botKeyword);

  console.log(`[BOT] Ubicación recibida y sucursales recomendadas para ID: ${conversationId}`, recomendadas);
  const actualizado = await actualizarEstadoConversacion(conversationId, {
    status: 'esperando',
    // Esta conversación puede ser una fila reutilizada de una atención
    // anterior (findOrCreateSession no crea una fila nueva mientras no esté
    // en un estado terminal), así que puede traer un sucursal_id viejo de la
    // vez pasada. Si no lo limpiamos acá, el cliente vuelve a quedar
    // "esperando" pero atado a esa sucursal vieja -invisible para cualquier
    // otro operador, sin que nadie haya tocado "Tomar"- en vez de entrar de
    // nuevo a la cola general. Mismo reseteo que ya hace devolverConversacionAEspera().
    sucursal_id: null,
    devuelta_por_sucursal_id: null,
    bot_state: null,
    bot_context: null,
    waiting_since: new Date().toISOString(),
    client_lat: coords.lat,
    client_lng: coords.lng,
    sucursales_recomendadas: recomendadas
  });
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — resultado de actualizarEstadoConversacion:', actualizado);

  // Si el UPDATE a 'esperando' falló, no confirmamos la derivación al cliente:
  // sería mentirle que ya lo estamos pasando a un asesor cuando en realidad
  // la conversación se quedó pegada en el bot.
  if (!actualizado) {
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — rama: falló el update a "esperando". Se avisa error de derivación.');
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_DERIVACION);
    console.log('✅ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — valor de retorno: undefined (cortado por error de derivación)');
    return;
  }

  await enviarMensajeBot(conversationId, telefono, mensajeDerivacionHumano(botKeyword));
  console.log('✅ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — valor de retorno: undefined (fin normal, derivación exitosa)');
};

// Arranca (o retoma) el registro OBLIGATORIO de datos personales, la primera
// vez que un cliente escribe y todavía le falta nombre y/o DNI. La edición
// voluntaria de un dato puntual ya cargado (desde "3. Actualizar mis datos"
// con el registro completo) es un flujo aparte, ver iniciarEdicionDatos más
// abajo.
const iniciarRegistro = async (conversationId, telefono, clienteActual) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarRegistro() — parámetros recibidos:', { conversationId, telefono, clienteActual });

  const estadoInicio = determinarEstadoRegistro(clienteActual);
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarRegistro() — estadoInicio resuelto:', estadoInicio);

  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: conversations, operación: update, filtro: id =', conversationId, ', valores:', { bot_state: estadoInicio, bot_context: null });
  const { data: updData, error: updError } = await supabase
    .from('conversations')
    .update({ bot_state: estadoInicio, bot_context: null })
    .eq('id', conversationId);
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query conversations (update inicio registro) — data:', updData, 'error:', updError);
  if (updError) {
    console.error('❌ [DEBUG-SERVICE-BOT] iniciarRegistro() — error actualizando bot_state/bot_context:', updError);
  }

  const pregunta = MENSAJE_POR_ESTADO_REGISTRO[estadoInicio];
  const intro = estadoInicio === 'registro_nombre' ? '¡Hola! Bienvenido a la Farmacia. 💊\n\nAntes de continuar, necesitamos algunos datos tuyos.\n\n' : '';
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarRegistro() — intro:', intro, ', pregunta:', pregunta);
  await enviarMensajeBot(conversationId, telefono, `${intro}${pregunta}`);
  console.log('✅ [DEBUG-SERVICE-BOT] iniciarRegistro() — valor de retorno: undefined (fin normal)');
};

const manejarPasoRegistro = async (conversationId, telefono, t, estado) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — parámetros recibidos:', { conversationId, telefono, t, estado });

  if (estado === 'registro_nombre') {
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — rama: registro_nombre');
    const nombre = t.trim();
    if (nombre.length < 3) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — nombre demasiado corto, se vuelve a pedir:', nombre);
      await enviarMensajeBot(conversationId, telefono, `Ese nombre no parece válido.\n\n${MENSAJE_PEDIR_NOMBRE}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (nombre inválido)');
      return;
    }
    try {
      await guardarDatoCliente(telefono, 'nombre_completo', nombre);
    } catch (err) {
      console.error('[BOT] Error guardando el nombre del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — error guardando nombre_completo:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (error guardando nombre)');
      return;
    }
    console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: conversations, operación: update, filtro: id =', conversationId, ', valores:', { bot_state: 'registro_dni' });
    const { error: updError } = await supabase.from('conversations').update({ bot_state: 'registro_dni' }).eq('id', conversationId);
    console.log('📡 [DEBUG-SERVICE-BOT] Resultado query conversations (update bot_state registro_dni) — error:', updError);
    await enviarMensajeBot(conversationId, telefono, `Gracias, ${nombre.split(' ')[0]}.\n\n${MENSAJE_PEDIR_DNI}`);
    console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (avanzó a registro_dni)');
    return;
  }

  if (estado === 'registro_dni') {
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — rama: registro_dni');
    const dni = t.replace(/[.\s]/g, '');
    if (!/^\d{6,10}$/.test(dni)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — DNI inválido, se vuelve a pedir:', dni);
      await enviarMensajeBot(conversationId, telefono, `Ese DNI no parece válido. Escribilo solo con números (por ejemplo: 30123456).\n\n${MENSAJE_PEDIR_DNI}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (DNI inválido)');
      return;
    }
    try {
      await guardarDatoCliente(telefono, 'dni', dni);
    } catch (err) {
      console.error('[BOT] Error guardando el DNI del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — error guardando dni:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (error guardando DNI)');
      return;
    }
    await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
    await enviarMensajeBot(
      conversationId,
      telefono,
      `✅ ¡Gracias! Ya registramos tus datos.\n\n${await construirMensajeBienvenida()}`
    );
    console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (registro completado)');
  }
};

// Edición voluntaria de UN dato puntual ya cargado ("3. Actualizar mis
// datos" con el registro ya completo): a diferencia de iniciarRegistro/
// manejarPasoRegistro (que siempre piden nombre y DNI seguidos), acá el
// cliente elige primero QUÉ campo corregir y sólo se le pide ese.
const iniciarEdicionDatos = async (conversationId, telefono) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarEdicionDatos() — parámetros recibidos:', { conversationId, telefono });
  await actualizarEstadoConversacion(conversationId, { bot_state: 'editar_datos_menu', bot_context: null });
  await enviarMensajeBot(conversationId, telefono, MENU_EDITAR_DATOS);
  console.log('✅ [DEBUG-SERVICE-BOT] iniciarEdicionDatos() — valor de retorno: undefined (fin normal)');
};

const manejarEdicionDatos = async (conversationId, telefono, t, estado) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — parámetros recibidos:', { conversationId, telefono, t, estado });

  if (estado === 'editar_datos_menu') {
    const opcion = t.trim();
    if (opcion === '1') {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — opción "1" (nombre). Pasa a editar_nombre.');
      await actualizarEstadoConversacion(conversationId, { bot_state: 'editar_nombre' });
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_NUEVO_NOMBRE);
    } else if (opcion === '2') {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — opción "2" (DNI). Pasa a editar_dni.');
      await actualizarEstadoConversacion(conversationId, { bot_state: 'editar_dni' });
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_NUEVO_DNI);
    } else if (opcion === '3') {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — opción "3" (volver). Se deriva a volverAlMenuPrincipal().');
      await volverAlMenuPrincipal(conversationId, telefono);
    } else {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — opción no reconocida ("', opcion, '"). Se reenvía el menú de edición.');
      await enviarMensajeBot(conversationId, telefono, `Esa opción no es válida.\n\n${MENU_EDITAR_DATOS}`);
    }
    console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (fin editar_datos_menu)');
    return;
  }

  if (estado === 'editar_nombre') {
    if (esCancelacion(t)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — cancelación en editar_nombre. Vuelve al menú de edición.');
      await iniciarEdicionDatos(conversationId, telefono);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (cancelado)');
      return;
    }
    const nombre = t.trim().replace(/\s+/g, ' ');
    if (!NOMBRE_EDICION_REGEX.test(nombre)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — nombre inválido, se vuelve a pedir:', nombre);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_NOMBRE_INVALIDO}${MENSAJE_CANCELAR_HINT}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (nombre inválido)');
      return;
    }
    try {
      await guardarDatoCliente(telefono, 'nombre_completo', nombre);
    } catch (err) {
      console.error('[BOT] Error guardando el nuevo nombre del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — error guardando nombre_completo:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_ERROR_REGISTRO}${MENSAJE_CANCELAR_HINT}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (error guardando, se puede reintentar)');
      return;
    }
    await enviarMensajeBot(conversationId, telefono, `✅ ¡Listo! Actualizamos tu nombre a "${nombre}".`);
    await iniciarEdicionDatos(conversationId, telefono);
    console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (nombre actualizado)');
    return;
  }

  if (estado === 'editar_dni') {
    if (esCancelacion(t)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — cancelación en editar_dni. Vuelve al menú de edición.');
      await iniciarEdicionDatos(conversationId, telefono);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (cancelado)');
      return;
    }
    const dni = t.replace(/[.\s]/g, '');
    if (!DNI_EDICION_REGEX.test(dni)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — DNI inválido, se vuelve a pedir:', dni);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_DNI_INVALIDO}${MENSAJE_CANCELAR_HINT}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (DNI inválido)');
      return;
    }

    let yaEsDeOtroCliente;
    try {
      yaEsDeOtroCliente = await dniPerteneceAOtroCliente(dni, telefono);
    } catch (err) {
      console.error('[BOT] Error verificando si el DNI ya está en uso:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — error consultando dni duplicado:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_ERROR_REGISTRO}${MENSAJE_CANCELAR_HINT}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (error verificando duplicado, se puede reintentar)');
      return;
    }
    if (yaEsDeOtroCliente) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — DNI ya pertenece a otro teléfono:', dni);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_DNI_DUPLICADO}${MENSAJE_CANCELAR_HINT}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (DNI duplicado)');
      return;
    }

    try {
      await guardarDatoCliente(telefono, 'dni', dni);
    } catch (err) {
      console.error('[BOT] Error guardando el nuevo DNI del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — error guardando dni:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_ERROR_REGISTRO}${MENSAJE_CANCELAR_HINT}`);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (error guardando, se puede reintentar)');
      return;
    }
    await enviarMensajeBot(conversationId, telefono, '✅ ¡Listo! Actualizamos tu DNI.');
    await iniciarEdicionDatos(conversationId, telefono);
    console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (DNI actualizado)');
  }
};

const volverAlMenuPrincipal = async (conversationId, telefono, esFrecuente = false) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] volverAlMenuPrincipal() — parámetros recibidos:', { conversationId, telefono, esFrecuente });
  // 'open' saca a la conversación del modo humano ('esperando') y la vuelve a
  // dejar en la cola de "Entrantes" (bot respondiendo automáticamente).
  await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
  await enviarMensajeBot(conversationId, telefono, await construirMensajeBienvenida(esFrecuente));
  console.log('✅ [DEBUG-SERVICE-BOT] volverAlMenuPrincipal() — valor de retorno: undefined (fin normal)');
};

export const enviarMensajeBot = async (conversationId, telefono, mensaje, extraFields = {}) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — parámetros recibidos:', { conversationId, telefono, mensaje, extraFields });
  console.log(`[BOT] Enviando respuesta a ${telefono}...`);
  // Guardar mensaje en base de datos como pendiente. `extraFields` permite
  // marcar mensajes especiales (ej. is_auto_reminder para el aviso de
  // inactividad, ver sessionExpiryChecker.js) sin duplicar todo este flujo.
  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: messages, operación: insert, valores:', { conversation_id: conversationId, sender_type: 'bot', message_text: mensaje, estado: 'pendiente', ...extraFields });
  const { data: insertData, error: insertError } = await supabase.from('messages').insert([{
    conversation_id: conversationId,
    sender_type: 'bot', // Usamos 'bot' para distinguirlo de 'agent'
    message_text: mensaje,
    estado: 'pendiente',
    ...extraFields
  }]).select().single();
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query messages (insert mensaje bot) — data:', insertData, 'error:', insertError);

  if (insertError) {
    console.error(`[BOT] Error insertando mensaje del bot:`, insertError);
    console.error('❌ [DEBUG-SERVICE-BOT] enviarMensajeBot() — error insertando mensaje, se corta el envío:', insertError?.message, insertError?.stack);
    console.log('✅ [DEBUG-SERVICE-BOT] enviarMensajeBot() — valor de retorno: undefined (cortado por error de insert)');
    return;
  }

  // Enviar a Meta
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — enviando a Meta vía sendWhatsAppMessage()');
  const metaResponse = await sendWhatsAppMessage(telefono, mensaje);
  const wamid = metaResponse?.messages?.[0]?.id;
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — respuesta de Meta:', metaResponse, ', wamid:', wamid);

  // Actualizar wamid y estado
  if (wamid) {
    console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: messages, operación: update, filtro: id =', insertData.id, ', valores:', { estado: 'enviado', wamid });
    const { error: updWamidError } = await supabase.from('messages')
      .update({ estado: 'enviado', wamid: wamid })
      .eq('id', insertData.id);
    console.log('📡 [DEBUG-SERVICE-BOT] Resultado query messages (update wamid/estado) — error:', updWamidError);
  } else {
    console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — sin wamid en la respuesta de Meta, no se actualiza estado del mensaje.');
  }

  // Actualizar last_message de la conversación
  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: conversations, operación: update, filtro: id =', conversationId, ', valores:', { last_message: mensaje });
  const { error: updLastMsgError } = await supabase.from('conversations')
    .update({ last_message: mensaje })
    .eq('id', conversationId);
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query conversations (update last_message) — error:', updLastMsgError);
  console.log('✅ [DEBUG-SERVICE-BOT] enviarMensajeBot() — valor de retorno: undefined (fin normal)');
};
