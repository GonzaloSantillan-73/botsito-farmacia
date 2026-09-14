import { supabase } from '../supabase.js';
import { getSessionTimeoutMs } from './appConfig.js';
import { finalizarConversacion } from './ratingSurvey.js';

// Estados que representan una consulta ya cerrada (por inactividad, por el agente, o rechazada)
export const TERMINAL_STATUSES = ['finalizada', 'resolved', 'rejected'];

export const getLastActivityTime = async (conversation) => {
  console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] getLastActivityTime() — conversation:', conversation);
  try {
    console.log('📡 [DEBUG-SERVICE-SESSIONMANAGER] getLastActivityTime() — SELECT messages, filtros: { conversation_id:', conversation.id, ' }, order created_at desc, limit 1');
    const { data, error } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    console.log('📡 [DEBUG-SERVICE-SESSIONMANAGER] getLastActivityTime() — resultado SELECT messages — data:', data, 'error:', error);

    const resultado = data?.created_at || conversation.created_at;
    console.log('✅ [DEBUG-SERVICE-SESSIONMANAGER] getLastActivityTime() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-SESSIONMANAGER] getLastActivityTime() — error:', err?.message, err?.stack);
    throw err;
  }
};

export const isSessionExpired = async (conversation) => {
  console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] isSessionExpired() — conversation:', conversation);
  try {
    const [lastActivity, sessionTimeoutMs] = await Promise.all([
      getLastActivityTime(conversation),
      getSessionTimeoutMs()
    ]);
    console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] isSessionExpired() — lastActivity:', lastActivity, 'sessionTimeoutMs:', sessionTimeoutMs);

    const resultado = (Date.now() - new Date(lastActivity).getTime()) > sessionTimeoutMs;
    console.log('✅ [DEBUG-SERVICE-SESSIONMANAGER] isSessionExpired() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-SESSIONMANAGER] isSessionExpired() — error:', err?.message, err?.stack);
    throw err;
  }
};

// Busca la última consulta del cliente. Si sigue activa, la reutiliza; si expiró o
// está cerrada, la marca como 'finalizada' (si corresponde) y arranca una consulta nueva.
export const findOrCreateSession = async (clientPhone, clientName) => {
  console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — clientPhone:', clientPhone, 'clientName:', clientName);
  try {
    const last10 = clientPhone.slice(-10);
    console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — last10:', last10);

    console.log('📡 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — SELECT conversations, filtros: ilike client_phone %', last10, '%, order created_at desc');
    const { data: candidates, error: searchError } = await supabase
      .from('conversations')
      .select('id, status, client_phone, created_at')
      .ilike('client_phone', `%${last10}%`)
      .order('created_at', { ascending: false });
    console.log('📡 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — resultado SELECT conversations — data:', candidates, 'error:', searchError);

    if (searchError) {
      console.error('❌ [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — searchError:', searchError);
      throw searchError;
    }

    let latest = null;
    if (candidates && candidates.length > 0) {
      latest = candidates.find(c => {
        const clean = c.client_phone.replace(/[\s\+\-]/g, '');
        return clean.includes(last10) || clientPhone.includes(clean);
      }) || candidates[0];
    }
    console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — conversación candidata más reciente (latest):', latest);

    if (latest) {
      const isTerminal = TERMINAL_STATUSES.includes(latest.status);
      console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — latest.status:', latest.status, 'isTerminal:', isTerminal);

      if (!isTerminal) {
        const expired = await isSessionExpired(latest);
        console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — expired:', expired);
        if (!expired) {
          console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — CAMBIO DE ESTADO — ninguno: se reutiliza la conversación activa', latest.id);
          console.log(`[SESSION] Consulta activa reutilizada: ${latest.id}`);
          const resultado = { conversation: latest, isNewSession: false };
          console.log('✅ [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — resultado a devolver:', resultado);
          return resultado;
        }
        console.log(`⏱️ [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — CAMBIO DE ESTADO — conversación ${latest.id} expiró por inactividad, se marcará como 'finalizada'`);
        console.log(`[SESSION] La consulta ${latest.id} expiró por inactividad. Marcando como 'finalizada'.`);
        await finalizarConversacion(latest.id, latest.client_phone, 'por inactividad');
      }
    }

    console.log('🔍 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — CAMBIO DE ESTADO — se creará una nueva conversación en estado "open" para', clientPhone);
    console.log(`[SESSION] Iniciando nueva consulta para ${clientPhone}.`);
    console.log('📡 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — INSERT conversations, valores:', { client_phone: clientPhone, client_name: clientName, status: 'open' });
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert([{ client_phone: clientPhone, client_name: clientName, status: 'open' }])
      .select()
      .single();
    console.log('📡 [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — resultado INSERT conversations — data:', newConv, 'error:', convError);

    if (convError) {
      console.error('❌ [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — convError:', convError);
      throw convError;
    }

    const resultado = { conversation: newConv, isNewSession: true };
    console.log('✅ [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — resultado a devolver:', resultado);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-SESSIONMANAGER] findOrCreateSession() — error:', err?.message, err?.stack);
    throw err;
  }
};
