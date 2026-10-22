import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { getBotKeyword, getWelcomeMessage, getFrequentClientMessage, getFrequentClientThreshold } from './appConfig.js';
import { getBotSchedule, isWithinSchedule, renderScheduleMessage } from './scheduleConfig.js';
import { getSucursalesActivas, formatearMensajeSucursales } from './sucursales.js';
import { getCliente, tieneRegistroCompleto, guardarDatoCliente, incrementarInteraccionesBot } from './clientes.js';
import { sucursalesMasCercanas } from './geolocalizacion.js';
import { extraerCoordenadasDeMensaje, esLinkDeGoogleMaps } from './mapsLocation.js';

// El menú principal se manda con botones de WhatsApp (máx. 3, título de hasta
// 20 caracteres). El id de cada botón es el mismo número que se escribía antes,
// así que tocar el botón o escribir "1"/"2"/"3" llega igual a los manejadores
// de abajo (tLower === '1'/'2'/'3').
//
// El saludo es personalizable desde el CRM (ver appConfig.getWelcomeMessage),
// pero las opciones quedan fijas acá.
const MENU_BOTONES = {
  tipo: 'botones',
  opciones: [
    { id: '1', titulo: 'Hablar con un asesor' },
    { id: '2', titulo: 'Horarios y locales' },
    { id: '3', titulo: 'Cambiar mi nombre' }
  ]
};
const MENU_TEXTO_BOTONES = '¿Qué querés hacer? Tocá una opción 👇';
// Si el cliente escribe en vez de tocar un botón: se le recuerda una vez; a la
// segunda se entiende que quiere que lo atiendan y se le pide la ubicación.
const MENSAJE_RECORDATORIO_BOTONES = 'Para ayudarte, tocá uno de estos botones 👇';
// Menú numerado de texto: sólo se usa si el saludo configurado es tan largo
// que no entra en un mensaje con botones (ver enviarMenuPrincipal).
const MENU_OPCIONES = '¿Qué querés hacer?\n\n1. Hablar con un asesor\n2. Horarios y locales\n3. Cambiar mi nombre\n\n_Respondé con el número de la opción._';
// Límite de Meta para el cuerpo de un mensaje con botones o lista.
const MAX_CUERPO_INTERACTIVO = 1024;

// esFrecuente reemplaza el saludo personalizable por frequent_client_message
// (ver appConfig.js) cuando el cliente ya usó el bot frequent_client_threshold
// veces o más antes de esta sesión — el menú numerado de abajo se agrega
// siempre igual, en los dos casos.
//
// Ambas plantillas admiten el placeholder {{nombre}} (case-insensitive, con o
// sin espacios adentro de las llaves): se reemplaza por el PRIMER nombre de
// la ficha de este teléfono (mismo criterio que ya usa el registro, ver
// "Gracias, ${nombre.split(' ')[0]}." más abajo). Si el cliente todavía no
// tiene nombre cargado, el placeholder se saca directo (string vacío) y se
// limpia la puntuación que pudiera quedar colgando alrededor (ej. "¡Hola,
// {{nombre}}!" sin nombre no debe quedar "¡Hola, !").
const formatearSaludo = (template, nombreCompleto) => {
  if (!template) return template;
  const primerNombre = nombreCompleto?.trim()?.split(/\s+/)[0] || '';
  let resultado = template.replace(/\{\{\s*nombre\s*\}\}/gi, primerNombre);
  if (!primerNombre) {
    resultado = resultado.replace(/,\s*([!.,¡¿?])/g, '$1').replace(/ {2,}/g, ' ');
  }
  return resultado;
};

const construirMensajeBienvenida = async (telefono, esFrecuente = false) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] construirMensajeBienvenida() — parámetros recibidos:', { telefono, esFrecuente });
  const saludoTemplate = esFrecuente ? await getFrequentClientMessage() : await getWelcomeMessage();

  let nombreCompleto = null;
  try {
    const cliente = await getCliente(telefono);
    nombreCompleto = cliente?.nombre_completo || null;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-BOT] construirMensajeBienvenida() — error consultando cliente para {{nombre}} (se sigue sin nombre):', err?.message, err?.stack);
  }

  const saludo = formatearSaludo(saludoTemplate, nombreCompleto);
  const resultado = `${saludo}\n\n${MENU_TEXTO_BOTONES}`;
  console.log('✅ [DEBUG-SERVICE-BOT] construirMensajeBienvenida() — valor de retorno:', resultado);
  return resultado;
};

// Manda el menú principal con botones. `prefijo` va arriba del saludo en el
// mismo mensaje (ej. "✅ ¡Gracias, Juan! Ya registramos tu nombre."), para no
// gastar un mensaje aparte. Si el texto supera el límite de Meta para el
// cuerpo de un mensaje con botones (porque el saludo configurado es muy
// largo), se manda el menú numerado de texto, que sigue funcionando igual.
const enviarMenuPrincipal = async (conversationId, telefono, { prefijo = '', esFrecuente = false } = {}) => {
  const bienvenida = await construirMensajeBienvenida(telefono, esFrecuente);
  const cuerpo = prefijo ? `${prefijo}\n\n${bienvenida}` : bienvenida;
  if (cuerpo.length <= MAX_CUERPO_INTERACTIVO) {
    await enviarMensajeBot(conversationId, telefono, cuerpo, { tipo_bot: 'menu' }, MENU_BOTONES);
    return;
  }
  console.warn('⚠️ [DEBUG-SERVICE-BOT] enviarMenuPrincipal() — el saludo es demasiado largo para un mensaje con botones, se manda el menú numerado.');
  const cuerpoTexto = cuerpo.replace(MENU_TEXTO_BOTONES, MENU_OPCIONES);
  await enviarMensajeBot(conversationId, telefono, cuerpoTexto, { tipo_bot: 'menu' });
};

// Pasa la consulta del menú principal (bot_state vacío) al estado `updates`
// sólo si sigue en el menú principal: es un UPDATE condicional, así que si
// llegan dos mensajes del cliente a la vez, el segundo encuentra que el
// estado ya cambió y no responde (en vez de mandar dos veces el mismo
// mensaje). Con `sinRecordatorio` además exige que todavía no se haya mandado
// el recordatorio de botones. Ante un error de la base se sigue igual, para
// no dejar al cliente sin respuesta.
const reservarSalidaDelMenu = async (conversationId, updates, { sinRecordatorio = false } = {}) => {
  let query = supabase.from('conversations').update(updates).eq('id', conversationId).is('bot_state', null);
  if (sinRecordatorio) query = query.is('bot_context->>recordatorio_botones', null);
  const { data, error } = await query.select('id');
  if (error) {
    console.error('❌ [DEBUG-SERVICE-BOT] reservarSalidaDelMenu() — error, se sigue sin reservar:', error?.message);
    return true;
  }
  if (!data?.length) {
    console.log('🔍 [DEBUG-SERVICE-BOT] reservarSalidaDelMenu() — otro mensaje simultáneo ya salió del menú; no se responde de nuevo.');
    return false;
  }
  return true;
};

// Una vez que el cliente eligió una opción (tocando un botón o escribiendo el
// número), los botones de los mensajes anteriores de esta consulta quedan
// "usados": si los vuelve a tocar, el webhook los ignora sin responder (ver
// botonesVigentes en webhook.js), así no se pagan mensajes por toques repetidos.
export const marcarBotonesUsados = async (conversationId) => {
  const { error } = await supabase.from('messages')
    .update({ botones_usado: true })
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'bot')
    .eq('botones_usado', false)
    .not('botones', 'is', null);
  if (error) console.warn('⚠️ [DEBUG-SERVICE-BOT] marcarBotonesUsados() — no se pudieron marcar (¿falta supabase/messages_botones.sql?):', error.message);
};

const MENSAJE_ERROR_SUCURSALES = 'Tuvimos un problema consultando las sucursales.\n\nPor favor, intentá de nuevo en un momento.';
const MENSAJE_ERROR_DERIVACION = 'Tuvimos un problema derivándote con un asesor.\n\nPor favor, intentá de nuevo en un momento.';

// Antes de derivar a un humano le pedimos la ubicación al cliente, para poder
// recomendarle (a él y al operador que lo atienda) la sucursal más cercana.
// Acepta dos formas: el botón nativo "Ubicación" de WhatsApp, o pegar como
// texto un link de Google Maps (largo o acortado tipo maps.app.goo.gl).
const PASOS_UBICACION = 'Mandanos tu ubicación siguiendo estos pasos:\n'
  + '1️⃣ Tocá el clip 📎, abajo, al lado de donde escribís.\n'
  + '2️⃣ Elegí *"Ubicación"*.\n'
  + '3️⃣ Tocá *"Enviar tu ubicación actual"*.\n\n'
  + '¿No te funciona? También podés pegar acá el link de tu ubicación de Google Maps. 🗺️';
// Eligió "Hablar con un asesor".
const MENSAJE_PEDIR_UBICACION = '¡Perfecto! Ahora te conectamos con *nuestra farmacia más cercana a vos*. 📍\n\n' + PASOS_UBICACION;
// Escribió dos veces en vez de tocar un botón: se lo pasa directo con una
// persona, sin marcarle que se equivocó.
const MENSAJE_PEDIR_UBICACION_SIN_MENU = '¡No hay problema! 😊 Te paso directo con *nuestra farmacia más cercana a vos* para que te atienda una persona. 📍\n\n' + PASOS_UBICACION;
const MENSAJE_UBICACION_INVALIDA = 'No pude reconocer esa ubicación. 😕\n\nProbá compartiendo tu ubicación con el botón de WhatsApp, o pegando un link de Google Maps (por ejemplo: https://maps.app.goo.gl/...).';
// Ninguna sucursal cercana está atendiendo en este momento (ver
// sucursalAbiertaMasCercana en geolocalizacion.js): ya no existe un horario
// global de "Asesores Humanos", así que este es el único mensaje de "fuera
// de horario" para la derivación a un humano.
const MENSAJE_SIN_SUCURSAL_DISPONIBLE = 'En este momento no tenemos ninguna sucursal cercana a tu ubicación atendiendo. 🕒\n\nEscribinos tu consulta y te vamos a responder apenas abramos, o intentá de nuevo más tarde.';

// Registro de datos personales: se le pide al cliente la primera vez que
// escribe (antes de mostrarle el menú). Sólo se pide el nombre: el DNI ya no
// lo pregunta el bot (pedir nombre, DNI y después la ubicación era demasiado
// y generaba desconfianza); igual que la obra social, si el cliente lo da en
// la conversación lo carga la sucursal a mano en "Datos del Cliente".
const MENSAJE_PEDIR_NOMBRE = '¿Cuál es tu nombre completo?';
// MENSAJE_PEDIR_DNI y el estado 'registro_dni' quedan sólo para no trabar a
// un cliente que justo estaba en ese paso cuando se subió el cambio (ver
// manejarPasoRegistro); ningún flujo nuevo entra ahí.
const MENSAJE_PEDIR_DNI = '¿Cuál es tu número de DNI?';
const MENSAJE_ERROR_REGISTRO = 'Tuvimos un problema guardando tus datos.\n\nPor favor, intentá de nuevo en un momento.';

const MENSAJE_POR_ESTADO_REGISTRO = {
  registro_nombre: MENSAJE_PEDIR_NOMBRE,
  registro_dni: MENSAJE_PEDIR_DNI
};

// Cambio de nombre, desde "3. Cambiar mi nombre" del menú principal (sólo con
// el registro completo; si todavía falta el nombre, "3" sigue yendo al
// registro obligatorio). Se muestra el nombre actual y se pide el nuevo
// directamente, sin un menú intermedio: es el único dato que el cliente puede
// cambiar desde el bot (el DNI lo carga la sucursal desde el CRM).
const MENSAJE_CANCELAR_HINT = '\n\n(Escribí 0 para cancelar)';
const construirPedidoNuevoNombre = (cliente) =>
  `Actual: *${cliente?.nombre_completo || 'sin cargar'}*\nIngresá tu nombre y apellido:${MENSAJE_CANCELAR_HINT}`;
const MENSAJE_NOMBRE_INVALIDO = 'Ese nombre no es válido. Ingresá tu nombre y apellido, sólo con letras (sin números ni símbolos). Por ejemplo: Juan Pérez.';
const MENSAJE_DNI_INVALIDO = 'El DNI ingresado no es válido. Ingresá sólo números, de 7 u 8 dígitos.';

// Nombre y apellido (al menos 2 palabras), sólo letras con acentos/ñ — nada
// de números ni símbolos. DNI argentino: 7 u 8 dígitos exactos (más estricto
// que el 6-10 que acepta el registro obligatorio inicial, a pedido explícito
// para este flujo de edición).
const NOMBRE_EDICION_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)+$/;
const DNI_EDICION_REGEX = /^\d{7,8}$/;

const esCancelacion = (t) => ['0', 'cancelar'].includes((t || '').trim().toLowerCase());

// Primer contacto de un cliente nuevo: el bot espera ESPERA_PEDIDO_NOMBRE_MS
// antes de pedir el nombre (bot_state 'registro_espera'). Muchos clientes
// mandan "Hola" y enseguida su consulta: si el nombre se pedía al instante,
// esa consulta (que ya venía en camino) se guardaba como nombre. Lo que llegue
// durante la espera queda en el chat pero no se toma como nombre.
const ESPERA_PEDIDO_NOMBRE_MS = 40 * 1000;
const MENSAJE_PRIMER_CONTACTO = '¡Hola! Soy el bot de Mi Farma. 💊\n\n¡Qué bueno que nos escribas! 🙌\nPara conocerte, escribí tu *nombre y apellido*. Por ejemplo: _Juan Pérez_.\n\nSolo te lo vamos a pedir esta primera vez.';
const MENSAJE_NO_ES_NOMBRE = 'Eso no parece un nombre 😅\n\nPor ahora solo necesito tu nombre y apellido (por ejemplo: Juan Pérez). Apenas lo tenga, te ayudamos con tu consulta.';
// Después de tantas respuestas que no parecen un nombre, se sigue al menú sin
// guardarlo (para no dejar al cliente trabado): se le vuelve a pedir en la
// próxima consulta.
const MAX_INTENTOS_NOMBRE = 3;

// "Hola, soy Juan Pérez." -> "Juan Pérez": saca saludos y "soy / me llamo /
// mi nombre es" del principio, y la puntuación del final.
const normalizarNombre = (t) => (t || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/^(?:(?:buen[oa]?s?\s+(?:d[ií]as?|tardes?|noches?)|hola|buenas)[\s,!.]*)+/i, '')
  .replace(/^(?:soy|me llamo|mi nombre es)\s+/i, '')
  .replace(/[\s.,!]+$/, '')
  .trim();

// Palabras que aparecen en consultas, nunca en un nombre (sin acentos).
const PALABRAS_NO_NOMBRE = new Set([
  'precio', 'precios', 'tienen', 'tenes', 'tiene', 'tengo', 'hay', 'quiero', 'queria', 'quisiera',
  'necesito', 'necesitaba', 'consulta', 'consultar', 'consulto', 'cuanto', 'cuanta', 'sale', 'salen',
  'cuesta', 'cuestan', 'vale', 'valen', 'receta', 'recetas', 'pastilla', 'pastillas', 'remedio',
  'remedios', 'medicamento', 'medicamentos', 'envio', 'envios', 'envian', 'delivery', 'stock',
  'favor', 'gracias', 'horario', 'horarios', 'abierto', 'abierta', 'abren', 'cierran', 'comprar',
  'compra', 'venden', 'vende', 'farmacia', 'disculpa', 'disculpe', 'perdon', 'hola', 'buenas',
  'buenos', 'buen', 'dia', 'dias', 'tardes', 'noches', 'info', 'informacion', 'ayuda', 'ayudame',
  'quien', 'que', 'como', 'donde', 'cuando', 'para', 'por'
]);

// Sólo letras (con acentos/ñ), separadas por espacios, apóstrofes o guiones
// (ej. "María de los Ángeles", "O'Connor", "Ana-Lía"). Se acepta un solo
// nombre: muchos clientes responden sólo con el nombre de pila.
const NOMBRE_REGISTRO_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[\s'-]+[A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;

const pareceNombre = (nombre) => {
  if (nombre.length < 3 || nombre.length > 50) return false;
  if (!NOMBRE_REGISTRO_REGEX.test(nombre)) return false;
  const palabras = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[\s'-]+/);
  if (palabras.length > 6) return false;
  return !palabras.some(p => PALABRAS_NO_NOMBRE.has(p));
};

// Devuelve el paso de registro que falta, o null si ya está completo. Hoy el
// único dato obligatorio es el nombre (ver tieneRegistroCompleto en clientes.js).
const determinarEstadoRegistro = (cliente) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] determinarEstadoRegistro() — parámetros recibidos:', { cliente });
  if (!cliente?.nombre_completo) {
    console.log('✅ [DEBUG-SERVICE-BOT] determinarEstadoRegistro() — falta nombre_completo, valor de retorno: registro_nombre');
    return 'registro_nombre';
  }
  console.log('✅ [DEBUG-SERVICE-BOT] determinarEstadoRegistro() — nombre presente, valor de retorno: null (registro completo)');
  return null;
};

const mensajeDerivacionHumano = (keyword) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] mensajeDerivacionHumano() — parámetros recibidos:', { keyword });
  // Ya no menciona la palabra para volver al bot (sigue funcionando si el
  // cliente la escribe): ahora le pide que adelante todo lo que necesita
  // mientras espera, para que la sucursal lo atienda con menos idas y vueltas.
  const resultado = 'Entendido, te estamos derivando con un asesor humano.\n\n'
    + 'Mientras esperás, contanos *todo* lo que necesitás. Por ejemplo:\n'
    + '• Si buscás un producto, escribí el nombre.\n'
    + '• Si querés comprar algo, decinos qué y cuántos.\n'
    + '• Si tenés otra consulta, contanos cuál es.\n\n'
    + 'Así, cuando te atiendan, ya tienen todo. 😊';
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
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule), { tipo_bot: 'fuera_horario' });
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
      await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(botSchedule), { tipo_bot: 'fuera_horario' });
      console.log('✅ [DEBUG-SERVICE-BOT] procesarMensajeBot() — valor de retorno: undefined (cortado por fuera de horario)');
      return;
    }

    const estado = conv?.bot_state || null;
    console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — estado (bot_state) resuelto:', estado);

    // Espera del primer contacto (ver iniciarRegistro): el mensaje ya quedó
    // guardado en el chat y no se toma como nombre. Si la espera ya venció
    // (timer perdido por un reinicio), se pide el nombre ahora.
    if (estado === 'registro_espera') {
      const vence = Date.parse(conv?.bot_context?.pedir_nombre_en || '') || 0;
      if (Date.now() >= vence) {
        console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: registro_espera vencida. Se pide el nombre ahora.');
        await pedirNombreSiCorresponde(conversationId, telefono);
      } else {
        console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: registro_espera. Mensaje recibido durante la espera, no se responde.');
      }
      return;
    }

    if (estado === 'registro_nombre' || estado === 'registro_dni') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — rama: estado de registro en curso (', estado, '). Se deriva a manejarPasoRegistro().');
      await manejarPasoRegistro(conversationId, telefono, t, estado, conv?.bot_context);
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
    const esOpcionDelMenu = ['1', '2', '3'].includes(tLower);
    // Ubicación mandada sin elegir opción (con el botón de WhatsApp o pegando
    // un link de Google Maps): el cliente ya quiere que lo atiendan y mandó
    // justo lo que se le iba a pedir, así que se usa directo.
    let esUbicacion = esLinkDeGoogleMaps(t);
    try {
      const parsed = JSON.parse(t);
      if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') esUbicacion = true;
    } catch {
      // No es una ubicación nativa.
    }
    if (esOpcionDelMenu || esUbicacion) {
      await marcarBotonesUsados(conversationId);
    }

    // Cada salida del menú principal se "reserva" antes de responder (ver
    // reservarSalidaDelMenu): si llegan dos mensajes del cliente a la vez,
    // sólo uno responde y el otro no manda nada, en vez de duplicar el
    // mensaje (cada uno se cobra).
    if (esUbicacion) {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — ubicación recibida en el menú principal. Se deriva directo.');
      if (!(await reservarSalidaDelMenu(conversationId, { bot_state: 'esperando_ubicacion', bot_context: null }))) return;
      await manejarUbicacionHumano(conversationId, telefono, t);
    } else if (tLower === '1') {
      // Ya no hay un horario global de "Asesores Humanos": la disponibilidad
      // depende de la sucursal que corresponda según dónde esté el cliente,
      // y eso recién se sabe cuando comparte la ubicación (ver
      // manejarUbicacionHumano más abajo), así que acá se pide directo.
      console.log(`[BOT] Pidiendo ubicación antes de derivar a un asesor humano para ID: ${conversationId}`);
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — se pasa a estado esperando_ubicacion.');
      if (!(await reservarSalidaDelMenu(conversationId, { bot_state: 'esperando_ubicacion', bot_context: null }))) return;
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_UBICACION, { tipo_bot: 'ubicacion' });
    } else if (tLower === '2') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — opción "2" (Horarios y sucursales). Se deriva a mostrarSucursales().');
      await mostrarSucursales(conversationId, telefono);
    } else if (tLower === '3') {
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — opción "3" (Cambiar mi nombre). Se deriva a iniciarEdicionDatos().');
      if (!(await reservarSalidaDelMenu(conversationId, { bot_state: 'editar_nombre', bot_context: null }))) return;
      await iniciarEdicionDatos(conversationId, telefono);
    } else if (!conv?.bot_context?.recordatorio_botones) {
      // Escribió en vez de tocar un botón: primera vez, recordatorio corto con
      // los botones (en vez de reenviar el saludo y el menú completos).
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — opción no reconocida ("', tLower, '"). Se manda el recordatorio de botones.');
      if (!(await reservarSalidaDelMenu(conversationId, { bot_context: { recordatorio_botones: true } }, { sinRecordatorio: true }))) return;
      await enviarMensajeBot(conversationId, telefono, MENSAJE_RECORDATORIO_BOTONES, { tipo_bot: 'recordatorio' }, MENU_BOTONES);
    } else {
      // Segunda vez que escribe en vez de tocar un botón: se entiende que
      // quiere que lo atiendan y se le pide la ubicación (como la opción 1).
      console.log('🔍 [DEBUG-SERVICE-BOT] procesarMensajeBot() — opción no reconocida por segunda vez. Se pide la ubicación para derivar.');
      if (!(await reservarSalidaDelMenu(conversationId, { bot_state: 'esperando_ubicacion', bot_context: null }))) return;
      await marcarBotonesUsados(conversationId);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_UBICACION_SIN_MENU, { tipo_bot: 'ubicacion' });
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
    // El aviso le pide que intente de nuevo, así que va con botones nuevos:
    // los del menú que tocó ya quedaron usados y no responderían.
    await actualizarEstadoConversacion(conversationId, { bot_context: null });
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_SUCURSALES, { tipo_bot: 'error' }, MENU_BOTONES);
    console.log('✅ [DEBUG-SERVICE-BOT] mostrarSucursales() — valor de retorno: undefined (cortado por error consultando sucursales)');
    return;
  }

  try {
    // Con muchas sucursales el listado viene partido en varios mensajes (ver
    // MAX_CARACTERES_MENSAJE en sucursales.js); se mandan en orden.
    for (const mensaje of formatearMensajeSucursales(sucursales)) {
      await enviarMensajeBot(conversationId, telefono, mensaje, { tipo_bot: 'sucursales' });
    }
  } catch (err) {
    // Un fallo transitorio al enviar el listado de sucursales no debe impedir
    // que igual le reenviemos el menú principal a continuación.
    console.error('[BOT] Error enviando el mensaje de sucursales:', err);
    console.error('❌ [DEBUG-SERVICE-BOT] mostrarSucursales() — error enviando mensaje de sucursales (no se corta el flujo):', err?.message, err?.stack);
  }

  // Es una consulta informativa (no cambia el bot_state), pero igual reenviamos
  // el menú principal para que el cliente no quede sin saber cómo seguir. Es
  // un menú nuevo, así que el recordatorio de botones vuelve a estar disponible.
  await actualizarEstadoConversacion(conversationId, { bot_context: null });
  await enviarMenuPrincipal(conversationId, telefono);
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
    await enviarMensajeBot(conversationId, telefono, MENSAJE_UBICACION_INVALIDA, { tipo_bot: 'ubicacion' });
    console.log('✅ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — valor de retorno: undefined (cortado por ubicación inválida)');
    return;
  }

  let recomendadas = [];
  try {
    recomendadas = await sucursalesMasCercanas(coords.lat, coords.lng, 2, [], conversationId);
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
    await enviarMensajeBot(conversationId, telefono, MENSAJE_SIN_SUCURSAL_DISPONIBLE, { tipo_bot: 'derivacion' });
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
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_DERIVACION, { tipo_bot: 'error' });
    console.log('✅ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — valor de retorno: undefined (cortado por error de derivación)');
    return;
  }

  await enviarMensajeBot(conversationId, telefono, mensajeDerivacionHumano(botKeyword), { tipo_bot: 'derivacion' });
  console.log('✅ [DEBUG-SERVICE-BOT] manejarUbicacionHumano() — valor de retorno: undefined (fin normal, derivación exitosa)');
};

// Arranca (o retoma) el registro OBLIGATORIO de datos personales, la primera
// vez que un cliente escribe y todavía no tiene el nombre cargado. La edición
// voluntaria de un dato puntual ya cargado (desde "3. Cambiar mi nombre"
// con el registro completo) es un flujo aparte, ver iniciarEdicionDatos más
// abajo.
const iniciarRegistro = async (conversationId, telefono, clienteActual) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarRegistro() — parámetros recibidos:', { conversationId, telefono, clienteActual });

  const estadoInicio = determinarEstadoRegistro(clienteActual);
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarRegistro() — estadoInicio resuelto:', estadoInicio);

  // Primer contacto: no se pide el nombre todavía, se espera
  // ESPERA_PEDIDO_NOMBRE_MS (ver arriba). El vencimiento queda en la base para
  // que, si el servidor se reinicia y se pierde el timer, el pedido salga
  // igual (ver pedirNombresPendientes, que corre en sessionExpiryChecker).
  if (estadoInicio === 'registro_nombre') {
    const pedirNombreEn = new Date(Date.now() + ESPERA_PEDIDO_NOMBRE_MS).toISOString();
    const ok = await actualizarEstadoConversacion(conversationId, { bot_state: 'registro_espera', bot_context: { pedir_nombre_en: pedirNombreEn } });
    if (!ok) {
      // Sin el estado guardado no hay forma de retomar la espera: se pide ya.
      await actualizarEstadoConversacion(conversationId, { bot_state: 'registro_nombre', bot_context: null });
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PRIMER_CONTACTO, { tipo_bot: 'registro' });
      return;
    }
    setTimeout(() => {
      pedirNombreSiCorresponde(conversationId, telefono)
        .catch(err => console.error('❌ [DEBUG-SERVICE-BOT] iniciarRegistro() — error en el pedido de nombre diferido:', err?.message, err?.stack));
    }, ESPERA_PEDIDO_NOMBRE_MS);
    console.log(`[BOT] Cliente nuevo ${telefono}: se pide el nombre en ${ESPERA_PEDIDO_NOMBRE_MS / 1000}s (${pedirNombreEn}).`);
    return;
  }

  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: conversations, operación: update, filtro: id =', conversationId, ', valores:', { bot_state: estadoInicio, bot_context: null });
  const { data: updData, error: updError } = await supabase
    .from('conversations')
    .update({ bot_state: estadoInicio, bot_context: null })
    .eq('id', conversationId);
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query conversations (update inicio registro) — data:', updData, 'error:', updError);
  if (updError) {
    console.error('❌ [DEBUG-SERVICE-BOT] iniciarRegistro() — error actualizando bot_state/bot_context:', updError);
  }

  const mensaje = MENSAJE_POR_ESTADO_REGISTRO[estadoInicio];
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarRegistro() — mensaje:', mensaje);
  await enviarMensajeBot(conversationId, telefono, mensaje, { tipo_bot: 'registro' });
  console.log('✅ [DEBUG-SERVICE-BOT] iniciarRegistro() — valor de retorno: undefined (fin normal)');
};

// Termina la espera del primer contacto y pide el nombre. El UPDATE
// condicional (sólo si sigue en 'registro_espera' y la consulta sigue
// abierta) hace de reserva: si el timer, el chequeo periódico y un mensaje
// del cliente llegan a la vez (o hay dos procesos del backend, ver
// sessionExpiryChecker.js), sólo el que efectivamente cambió la fila manda el
// mensaje. Si un operador tomó el chat o la consulta se cerró mientras tanto,
// no se manda nada.
export const pedirNombreSiCorresponde = async (conversationId, telefono) => {
  const { data, error } = await supabase
    .from('conversations')
    .update({ bot_state: 'registro_nombre', bot_context: null })
    .eq('id', conversationId)
    .eq('bot_state', 'registro_espera')
    .eq('status', 'open')
    .select('id');
  if (error) {
    console.error('❌ [DEBUG-SERVICE-BOT] pedirNombreSiCorresponde() — error reservando el pedido de nombre:', error);
    return false;
  }
  if (!data?.length) {
    console.log('🔍 [DEBUG-SERVICE-BOT] pedirNombreSiCorresponde() — ya no corresponde (otro proceso lo mandó, o la consulta cambió de estado):', conversationId);
    return false;
  }
  console.log(`[BOT] Pidiendo el nombre al cliente nuevo ${telefono} (conversación ${conversationId}).`);
  await enviarMensajeBot(conversationId, telefono, MENSAJE_PRIMER_CONTACTO, { tipo_bot: 'registro' });
  return true;
};

// Red de seguridad para los timers perdidos (reinicio del servidor durante
// la espera): pide el nombre en toda consulta abierta cuya espera ya venció.
// La llama sessionExpiryChecker en cada chequeo (como máximo cada 30s).
export const pedirNombresPendientes = async () => {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, client_phone, bot_context')
    .eq('bot_state', 'registro_espera')
    .eq('status', 'open');
  if (error) {
    console.error('❌ [DEBUG-SERVICE-BOT] pedirNombresPendientes() — error buscando esperas pendientes:', error);
    return;
  }
  const ahora = Date.now();
  for (const conv of data || []) {
    const vence = Date.parse(conv.bot_context?.pedir_nombre_en || '') || 0;
    if (vence <= ahora) {
      await pedirNombreSiCorresponde(conv.id, conv.client_phone);
    }
  }
};

const manejarPasoRegistro = async (conversationId, telefono, t, estado, botContext = null) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — parámetros recibidos:', { conversationId, telefono, t, estado, botContext });

  if (estado === 'registro_nombre') {
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — rama: registro_nombre');
    const nombre = normalizarNombre(t);
    if (!pareceNombre(nombre)) {
      const intentos = (botContext?.intentos_nombre || 0) + 1;
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — la respuesta no parece un nombre:', t, '— intento', intentos, 'de', MAX_INTENTOS_NOMBRE);
      if (intentos >= MAX_INTENTOS_NOMBRE) {
        // Se sigue sin el nombre para no trabar al cliente; se le vuelve a
        // pedir en su próxima consulta (sigue sin registro completo).
        await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
        await enviarMenuPrincipal(conversationId, telefono);
        console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (se sigue al menú sin nombre)');
        return;
      }
      await actualizarEstadoConversacion(conversationId, { bot_context: { intentos_nombre: intentos } });
      await enviarMensajeBot(conversationId, telefono, MENSAJE_NO_ES_NOMBRE, { tipo_bot: 'registro' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (nombre inválido)');
      return;
    }
    try {
      await guardarDatoCliente(telefono, 'nombre_completo', nombre);
    } catch (err) {
      console.error('[BOT] Error guardando el nombre del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — error guardando nombre_completo:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO, { tipo_bot: 'error' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (error guardando nombre)');
      return;
    }
    // El nombre es el único dato obligatorio: con eso el registro queda
    // completo y se pasa directo al menú (ya no se pide el DNI).
    await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
    await enviarMenuPrincipal(conversationId, telefono, { prefijo: `✅ ¡Gracias, ${nombre.split(' ')[0]}! Ya registramos tu nombre.` });
    console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (registro completado con el nombre)');
    return;
  }

  // Sólo para un cliente que quedó en este paso con la versión anterior del
  // bot (que todavía pedía el DNI): se acepta su respuesta y se completa el
  // registro igual que antes, para no dejarlo trabado.
  if (estado === 'registro_dni') {
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — rama: registro_dni');
    const dni = t.replace(/[.\s]/g, '');
    if (!/^\d{6,10}$/.test(dni)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarPasoRegistro() — DNI inválido, se vuelve a pedir:', dni);
      await enviarMensajeBot(conversationId, telefono, `Ese DNI no parece válido. Escribilo solo con números (por ejemplo: 30123456).\n\n${MENSAJE_PEDIR_DNI}`, { tipo_bot: 'registro' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (DNI inválido)');
      return;
    }
    // Modelo estricto por teléfono: el DNI se guarda como un dato más de la
    // ficha de ESTE número, sin buscar ni fusionar con ninguna otra ficha que
    // pueda tener el mismo DNI cargado bajo otro teléfono.
    try {
      await guardarDatoCliente(telefono, 'dni', dni);
    } catch (err) {
      console.error('[BOT] Error guardando el DNI del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — error en guardarDatoCliente (dni):', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_REGISTRO, { tipo_bot: 'error' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (error guardando DNI)');
      return;
    }

    await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });

    await enviarMenuPrincipal(conversationId, telefono, { prefijo: '✅ ¡Gracias! Ya registramos tus datos.' });
    console.log('✅ [DEBUG-SERVICE-BOT] manejarPasoRegistro() — valor de retorno: undefined (registro completado)');
  }
};

// "3. Cambiar mi nombre" (con el registro ya completo): muestra el nombre
// actual y pide el nuevo directamente.
const iniciarEdicionDatos = async (conversationId, telefono) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] iniciarEdicionDatos() — parámetros recibidos:', { conversationId, telefono });
  await actualizarEstadoConversacion(conversationId, { bot_state: 'editar_nombre', bot_context: null });
  const cliente = await getCliente(telefono);
  await enviarMensajeBot(conversationId, telefono, construirPedidoNuevoNombre(cliente), { tipo_bot: 'cambio_nombre' });
  console.log('✅ [DEBUG-SERVICE-BOT] iniciarEdicionDatos() — valor de retorno: undefined (fin normal)');
};

const manejarEdicionDatos = async (conversationId, telefono, t, estado) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — parámetros recibidos:', { conversationId, telefono, t, estado });

  // 'editar_datos_menu' ya no existe (antes había un menú intermedio para
  // elegir qué dato cambiar): un cliente que había quedado ahí con la versión
  // anterior pasa directo a ingresar su nombre.
  if (estado === 'editar_datos_menu') {
    console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — estado heredado editar_datos_menu. Se pide el nombre.');
    await iniciarEdicionDatos(conversationId, telefono);
    return;
  }

  if (estado === 'editar_nombre') {
    if (esCancelacion(t)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — cancelación en editar_nombre. Vuelve al menú principal.');
      await volverAlMenuPrincipal(conversationId, telefono);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (cancelado)');
      return;
    }
    const nombre = t.trim().replace(/\s+/g, ' ');
    if (!NOMBRE_EDICION_REGEX.test(nombre)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — nombre inválido, se vuelve a pedir:', nombre);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_NOMBRE_INVALIDO}${MENSAJE_CANCELAR_HINT}`, { tipo_bot: 'cambio_nombre' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (nombre inválido)');
      return;
    }
    try {
      await guardarDatoCliente(telefono, 'nombre_completo', nombre);
    } catch (err) {
      console.error('[BOT] Error guardando el nuevo nombre del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — error guardando nombre_completo:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_ERROR_REGISTRO}${MENSAJE_CANCELAR_HINT}`, { tipo_bot: 'error' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (error guardando, se puede reintentar)');
      return;
    }
    // Confirmación y menú principal en un solo mensaje (antes eran dos).
    await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
    await enviarMenuPrincipal(conversationId, telefono, { prefijo: `✅ ¡Listo! Actualizamos tu nombre a "${nombre}".` });
    console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (nombre actualizado)');
    return;
  }

  // Ya no se entra a 'editar_dni' desde el menú: queda sólo para un cliente
  // que estaba en ese paso con la versión anterior, para no dejarlo trabado.
  if (estado === 'editar_dni') {
    if (esCancelacion(t)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — cancelación en editar_dni. Vuelve al menú principal.');
      await volverAlMenuPrincipal(conversationId, telefono);
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (cancelado)');
      return;
    }
    const dni = t.replace(/[.\s]/g, '');
    if (!DNI_EDICION_REGEX.test(dni)) {
      console.log('🔍 [DEBUG-SERVICE-BOT] manejarEdicionDatos() — DNI inválido, se vuelve a pedir:', dni);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_DNI_INVALIDO}${MENSAJE_CANCELAR_HINT}`, { tipo_bot: 'cambio_nombre' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (DNI inválido)');
      return;
    }

    // Modelo estricto por teléfono: no se chequea si otro número ya tiene
    // este mismo DNI cargado — cada client_phone es una ficha independiente,
    // el DNI es sólo un dato informativo de ESTA ficha.
    try {
      await guardarDatoCliente(telefono, 'dni', dni);
    } catch (err) {
      console.error('[BOT] Error guardando el nuevo DNI del cliente:', err);
      console.error('❌ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — error guardando dni:', err?.message, err?.stack);
      await enviarMensajeBot(conversationId, telefono, `${MENSAJE_ERROR_REGISTRO}${MENSAJE_CANCELAR_HINT}`, { tipo_bot: 'error' });
      console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (error guardando, se puede reintentar)');
      return;
    }
    await enviarMensajeBot(conversationId, telefono, '✅ ¡Listo! Actualizamos tu DNI.', { tipo_bot: 'cambio_nombre' });
    await volverAlMenuPrincipal(conversationId, telefono);
    console.log('✅ [DEBUG-SERVICE-BOT] manejarEdicionDatos() — valor de retorno: undefined (DNI actualizado)');
  }
};

const volverAlMenuPrincipal = async (conversationId, telefono, esFrecuente = false) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] volverAlMenuPrincipal() — parámetros recibidos:', { conversationId, telefono, esFrecuente });
  // 'open' saca a la conversación del modo humano ('esperando') y la vuelve a
  // dejar en la cola de "Entrantes" (bot respondiendo automáticamente).
  await actualizarEstadoConversacion(conversationId, { status: 'open', bot_state: null, bot_context: null, waiting_since: null });
  await enviarMenuPrincipal(conversationId, telefono, { esFrecuente });
  console.log('✅ [DEBUG-SERVICE-BOT] volverAlMenuPrincipal() — valor de retorno: undefined (fin normal)');
};

// `interactivo` (opcional): { tipo: 'botones' | 'lista', boton?, opciones: [{ id, titulo }] }.
// Se manda a Meta como botones/lista y se guarda en messages.botones para que
// el CRM lo muestre (ver supabase/messages_botones.sql).
export const enviarMensajeBot = async (conversationId, telefono, mensaje, extraFields = {}, interactivo = null) => {
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — parámetros recibidos:', { conversationId, telefono, mensaje, extraFields, interactivo });
  console.log(`[BOT] Enviando respuesta a ${telefono}...`);
  // Guardar mensaje en base de datos como pendiente. `extraFields` permite
  // marcar mensajes especiales (ej. is_auto_reminder para el aviso de
  // inactividad, ver sessionExpiryChecker.js) sin duplicar todo este flujo.
  const filaBase = {
    conversation_id: conversationId,
    sender_type: 'bot', // Usamos 'bot' para distinguirlo de 'agent'
    message_text: mensaje,
    estado: 'pendiente',
    ...extraFields
  };
  console.log('📡 [DEBUG-SERVICE-BOT] Query Supabase → tabla: messages, operación: insert, valores:', filaBase);
  let { data: insertData, error: insertError } = await supabase.from('messages')
    .insert([interactivo ? { ...filaBase, botones: interactivo } : filaBase]).select().single();
  // Si faltan columnas nuevas (backend subido antes que el SQL:
  // supabase/messages_botones.sql o supabase/metricas_base.sql), se guarda
  // sin ellas: el mensaje sale igual, sólo que el CRM no dibuja los botones
  // o Métricas no sabe de qué tipo era. Nunca se corta el envío por esto.
  if (insertError && /botones|tipo_bot/.test(insertError.message || '')) {
    console.warn('⚠️ [DEBUG-SERVICE-BOT] enviarMensajeBot() — faltan columnas nuevas en messages (correr los SQL pendientes). Se guarda sin ellas:', insertError.message);
    const { tipo_bot: _tipoBot, ...filaMinima } = filaBase;
    ({ data: insertData, error: insertError } = await supabase.from('messages').insert([filaMinima]).select().single());
  }
  console.log('📡 [DEBUG-SERVICE-BOT] Resultado query messages (insert mensaje bot) — data:', insertData, 'error:', insertError);

  if (insertError) {
    console.error(`[BOT] Error insertando mensaje del bot:`, insertError);
    console.error('❌ [DEBUG-SERVICE-BOT] enviarMensajeBot() — error insertando mensaje, se corta el envío:', insertError?.message, insertError?.stack);
    console.log('✅ [DEBUG-SERVICE-BOT] enviarMensajeBot() — valor de retorno: undefined (cortado por error de insert)');
    return;
  }

  // Enviar a Meta
  console.log('🔍 [DEBUG-SERVICE-BOT] enviarMensajeBot() — enviando a Meta vía sendWhatsAppMessage()');
  const metaResponse = await sendWhatsAppMessage(telefono, mensaje, null, null, null, interactivo);
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
