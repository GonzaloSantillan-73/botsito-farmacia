import { supabase } from '../supabase.js';
import { TERMINAL_STATUSES, fueTomadaPorSucursal } from './sessionManager.js';
import { getSessionTimeoutMs, getSessionPrewarningMs, getEsperaRespuestaMs, getModoPrueba, tiemposDeCierrePara } from './appConfig.js';
import { finalizarConversacion } from './ratingSurvey.js';
import { enviarMensajeBot, pedirNombresPendientes } from './bot.js';

// Cota máxima entre chequeos cuando no hay nada por vencer todavía (para detectar
// conversaciones nuevas creadas después del último chequeo). También es el peor
// caso de demora para detectar que ya se cruzó el umbral del pre-aviso.
const MAX_WAIT_MS = 30 * 1000;
// Cota mínima entre chequeos, para no generar un loop demasiado ajustado.
const MIN_WAIT_MS = 1000;

// "No hace falta que respondas": si el cliente contesta "no, gracias", ese
// mensaje cuenta como actividad y reinicia el conteo, dejando la consulta
// abierta otro período completo en vez de cerrarse a su hora.
const MENSAJE_AVISO_INACTIVIDAD = '¡Hola! ¿Seguís ahí? Si necesitás algo más contame. Si ya no, no hace falta que respondas: voy a cerrar esta consulta en breve. 🙂';

// Manda el aviso preventivo y marca `prewarning_sent_at` para no repetirlo en
// esta misma ventana de inactividad. Se envía con is_auto_reminder=true para
// que este mismo mensaje NO cuente como "última actividad": si contara, cada
// aviso reiniciaría el propio conteo que lo disparó y la conversación nunca
// llegaría a cerrarse sola (ver el SELECT a `messages` más abajo).
//
// Mismo criterio anti-duplicado que finalizarConversacion (ratingSurvey.js):
// si hay dos procesos del backend corriendo a la vez contra la misma base
// (pasó en Hostinger tras un deploy), los dos veían prewarning_sent_at vacío
// y mandaban el aviso dos veces. Ahora primero se "reserva" el aviso con un
// UPDATE condicional (sólo si prewarning_sent_at sigue en NULL) y únicamente
// lo manda el proceso cuyo UPDATE efectivamente afectó la fila. Si el envío
// a WhatsApp falla, el aviso queda marcado y no se reintenta: es sólo un
// recordatorio, la consulta igual se cierra a su hora.
const enviarAvisoInactividad = async (conversationId, clientPhone) => {
  console.log(`⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] enviarAvisoInactividad() — conversationId: ${conversationId}`);
  const { data: filaReservada, error } = await supabase
    .from('conversations')
    .update({ prewarning_sent_at: new Date().toISOString() })
    .eq('id', conversationId)
    .is('prewarning_sent_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] enviarAvisoInactividad() — error reservando prewarning_sent_at, no se manda el aviso:', error);
    return;
  }
  if (!filaReservada) {
    console.log(`⚠️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] enviarAvisoInactividad() — otro proceso ya reservó el aviso de ${conversationId}, se omite (evita duplicado).`);
    return;
  }
  await enviarMensajeBot(conversationId, clientPhone, MENSAJE_AVISO_INACTIVIDAD, { is_auto_reminder: true });
};

// Revisa las consultas activas, finaliza las que ya vencieron, y devuelve en cuántos
// ms hay que volver a chequear (exactamente cuando venza la próxima más cercana),
// en vez de depender de un intervalo fijo que puede llegar tarde.
export const checkExpiredSessions = async () => {
  const timestampInicio = new Date().toISOString();
  console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — corrida iniciada en:', timestampInicio);
  try {
    console.log('📡 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — SELECT conversations, filtros: status NOT IN (', TERMINAL_STATUSES.join(','), ')');
    const [{ data: activeConvs, error }, sessionTimeoutMs, sessionPrewarningMs, esperaRespuestaMs, modoPrueba] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, client_phone, status, sucursal_id, created_at, prewarning_sent_at, payment_status, sale_status')
        .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`),
      getSessionTimeoutMs(),
      getSessionPrewarningMs(),
      getEsperaRespuestaMs(),
      getModoPrueba()
    ]);
    console.log('📡 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — resultado SELECT conversations — cantidad de conversaciones activas evaluadas:', activeConvs?.length, 'error:', error, '— sessionTimeoutMs:', sessionTimeoutMs, '— sessionPrewarningMs:', sessionPrewarningMs);

    if (error) {
      console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error consultando conversaciones activas:', error);
      console.error('[SESSION EXPIRY] Error consultando consultas activas:', error);
      console.log('✅ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — resultado a devolver (por error):', MAX_WAIT_MS);
      return MAX_WAIT_MS;
    }

    let proximoChequeoMs = MAX_WAIT_MS;
    const cerradasPorExpiracion = [];

    console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — evaluando', (activeConvs || []).length, 'conversaciones activas');

    for (const conv of activeConvs || []) {
      try {
        // Tiempos de esta consulta: los del número de prueba si es ese
        // teléfono (ver getModoPrueba en appConfig.js), o los generales.
        const tiempos = tiemposDeCierrePara(conv.client_phone, { sessionTimeoutMs, sessionPrewarningMs, esperaRespuestaMs }, modoPrueba);
        // is_auto_reminder=false: el propio aviso "¿Seguís ahí?" (y los toques
        // de botones ya usados) no cuentan como actividad para este cálculo,
        // si no cada aviso reiniciaría el conteo que lo disparó y la
        // conversación jamás llegaría a cerrarse sola.
        // sender_type != 'system': notas internas de timeline (devolución a la
        // cola, derivación directa entre sucursales) que nunca se le mandan al
        // cliente — no son ni "respondió la sucursal" ni "escribió el cliente".
        console.log('📡 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — SELECT messages (último mensaje real), conversación:', conv.id);
        const { data: lastMsg, error: lastMsgError } = await supabase
          .from('messages')
          .select('sender_type, created_at')
          .eq('conversation_id', conv.id)
          .eq('is_auto_reminder', false)
          .neq('sender_type', 'system')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMsgError) {
          console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error SELECT último mensaje de', conv.id, ':', lastMsgError);
          continue;
        }
        if (!lastMsg) {
          continue;
        }

        // 'esperando' = el cliente pidió un asesor (en la cola general o ya
        // tomada por una sucursal). Lo que define qué reloj corre es quién
        // tiene que contestar:
        // - la sucursal le escribió último -> el que debe responder es el
        //   cliente: inactividad normal, con "¿Seguís ahí?" y encuesta (abajo).
        // - si no (escribió el cliente, o el último es del bot, ej. "te
        //   estamos derivando"), el que espera es el cliente: se cierra a las
        //   esperaRespuestaMs de su último mensaje, sin "¿Seguís ahí?". Con
        //   encuesta sólo si alguna sucursal la llegó a tomar (si nadie la
        //   atendió, se cierra en silencio).
        if (conv.status === 'esperando') {
          let respondioLaSucursal = lastMsg.sender_type === 'agent';

          // Recién derivada/reasignada a una sucursal (tomada de la cola, o
          // pasada directamente de otra): un mensaje saliente de ANTES de que
          // esta sucursal se hiciera cargo (ej. de la sucursal anterior) no
          // cuenta como que la sucursal ACTUAL ya respondió. Se compara contra
          // la fila más reciente de conversation_sucursal_historial, que
          // tomarConsulta.js/derivacionSucursal.js insertan al asignarla.
          if (respondioLaSucursal && conv.sucursal_id) {
            const { data: ultimaAsignacion, error: histError } = await supabase
              .from('conversation_sucursal_historial')
              .select('created_at')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (histError) {
              console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error SELECT conversation_sucursal_historial (se sigue sin el gate de reasignación):', histError);
            } else if (ultimaAsignacion?.created_at && new Date(lastMsg.created_at) <= new Date(ultimaAsignacion.created_at)) {
              respondioLaSucursal = false;
            }
          }

          if (!respondioLaSucursal) {
            // Se cuenta desde el último mensaje del CLIENTE (no del bot): es
            // desde ahí que corren las 24 h en las que Meta deja escribirle.
            const { data: ultimoDelCliente, error: clienteError } = await supabase
              .from('messages')
              .select('created_at')
              .eq('conversation_id', conv.id)
              .eq('sender_type', 'client')
              .eq('is_auto_reminder', false)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (clienteError) {
              console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error SELECT último mensaje del cliente de', conv.id, ':', clienteError);
              continue;
            }
            const desde = ultimoDelCliente?.created_at || conv.created_at;
            const restanteEsperaMs = tiempos.esperaRespuestaMs - (Date.now() - new Date(desde).getTime());

            if (restanteEsperaMs <= 0) {
              const pedirCalificacion = await fueTomadaPorSucursal(conv.id);
              console.log('🔍 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — la farmacia no respondió a tiempo, se cierra', conv.id, '— con encuesta:', pedirCalificacion);
              // Motivo vacío: "Tu consulta ha finalizado." (no "por
              // inactividad", que culparía al cliente, que estaba esperando).
              await finalizarConversacion(conv.id, conv.client_phone, '', { pedirCalificacion });
              cerradasPorExpiracion.push(conv.id);
              continue;
            }

            proximoChequeoMs = Math.min(proximoChequeoMs, restanteEsperaMs);
            continue;
          }
        } else if (lastMsg.sender_type === 'client') {
          // Modo bot con el último mensaje del cliente (el bot todavía no le
          // contestó): no hay inactividad que penalizar de su lado.
          continue;
        }

        const lastActivity = lastMsg.created_at;
        const elapsedMs = Date.now() - new Date(lastActivity).getTime();
        const restanteMs = tiempos.sessionTimeoutMs - elapsedMs;

        // Modo bot ('open') sin que ninguna sucursal la haya tomado nunca: la
        // consulta fue sólo con el bot, así que se cierra en silencio y sin
        // "¿Seguís ahí?" (cero mensajes cobrados).
        const soloConElBot = conv.status !== 'esperando' && !(await fueTomadaPorSucursal(conv.id));

        if (restanteMs <= 0) {
          console.log('🔍 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — inactividad vencida en', conv.id, '— sólo con el bot (sin encuesta):', soloConElBot);
          await finalizarConversacion(conv.id, conv.client_phone, 'por inactividad', { pedirCalificacion: !soloConElBot });
          cerradasPorExpiracion.push(conv.id);
          continue;
        }

        proximoChequeoMs = Math.min(proximoChequeoMs, restanteMs);

        if (soloConElBot) {
          continue;
        }

        // No tiene sentido preguntarle "¿seguís ahí?" a alguien que ya pagó o
        // cuya venta ya se concretó: el pedido sigue su curso aunque el
        // cliente no vuelva a escribir, así que ese aviso solo generaría
        // ruido. La consulta igual puede cerrarse sola por inactividad más
        // arriba; esto sólo frena el mensaje.
        const pedidoYaResuelto = conv.payment_status === 'confirmado' || conv.sale_status === 'concretada';

        if (tiempos.sessionPrewarningMs > 0 && !conv.prewarning_sent_at && restanteMs <= tiempos.sessionPrewarningMs && !pedidoYaResuelto) {
          await enviarAvisoInactividad(conv.id, conv.client_phone);
        }
      } catch (err) {
        // Una falla acá en una conversación (ej. error de la API de Meta) no debe frenar el chequeo del resto
        console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error procesando conversación', conv.id, ':', err?.message, err?.stack);
        console.error(`[SESSION EXPIRY] Error procesando la conversación ${conv.id}:`, err.message || err);
      }
    }

    console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — conversaciones cerradas por expiración en esta corrida:', cerradasPorExpiracion);

    const resultado = Math.max(MIN_WAIT_MS, Math.min(MAX_WAIT_MS, proximoChequeoMs));
    console.log('✅ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — resultado a devolver (ms hasta el próximo chequeo):', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] checkExpiredSessions() — error inesperado:', err?.message, err?.stack);
    throw err;
  }
};

const programarProximoChequeo = () => {
  console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] programarProximoChequeo() — invocado en:', new Date().toISOString());
  // Pedidos de nombre a clientes nuevos cuyo timer se perdió (ver
  // pedirNombresPendientes en bot.js). Independiente del chequeo de
  // expiración: si falla, no debe cortarlo.
  pedirNombresPendientes()
    .catch(err => console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] programarProximoChequeo() — error en pedirNombresPendientes:', err?.message, err?.stack));
  checkExpiredSessions()
    .catch(err => {
      console.error('❌ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] programarProximoChequeo() — error en el ciclo de chequeo:', err?.message, err?.stack);
      console.error('[SESSION EXPIRY] Error en el ciclo de chequeo:', err);
      return MAX_WAIT_MS;
    })
    .then(delayMs => {
      console.log('⏱️ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] programarProximoChequeo() — próximo chequeo programado en', delayMs, 'ms');
      setTimeout(programarProximoChequeo, delayMs);
    });
};

export const startSessionExpiryChecker = () => {
  console.log('🔍 [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] startSessionExpiryChecker() — iniciando checker');
  console.log(`[SESSION EXPIRY] Checker adaptativo de expiración iniciado (chequea justo cuando vence la próxima consulta, máximo cada ${MAX_WAIT_MS / 1000}s).`);
  programarProximoChequeo();
  console.log('✅ [DEBUG-SERVICE-SESSIONEXPIRYCHECKER] startSessionExpiryChecker() — checker iniciado, sin valor de retorno');
};
