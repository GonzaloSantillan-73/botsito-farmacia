import { supabase } from '../supabase.js';
import { getSessionTimeoutMs } from './appConfig.js';

// Estados que representan una consulta ya cerrada (por inactividad, por el agente, o rechazada)
export const TERMINAL_STATUSES = ['finalizada', 'resolved', 'rejected'];

export const getLastActivityTime = async (conversation) => {
  const { data } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at || conversation.created_at;
};

export const isSessionExpired = async (conversation) => {
  const [lastActivity, sessionTimeoutMs] = await Promise.all([
    getLastActivityTime(conversation),
    getSessionTimeoutMs()
  ]);
  return (Date.now() - new Date(lastActivity).getTime()) > sessionTimeoutMs;
};

// Busca la última consulta del cliente. Si sigue activa, la reutiliza; si expiró o
// está cerrada, la marca como 'finalizada' (si corresponde) y arranca una consulta nueva.
export const findOrCreateSession = async (clientPhone, clientName) => {
  const last10 = clientPhone.slice(-10);

  const { data: candidates, error: searchError } = await supabase
    .from('conversations')
    .select('id, status, client_phone, created_at')
    .ilike('client_phone', `%${last10}%`)
    .order('created_at', { ascending: false });

  if (searchError) throw searchError;

  let latest = null;
  if (candidates && candidates.length > 0) {
    latest = candidates.find(c => {
      const clean = c.client_phone.replace(/[\s\+\-]/g, '');
      return clean.includes(last10) || clientPhone.includes(clean);
    }) || candidates[0];
  }

  if (latest) {
    const isTerminal = TERMINAL_STATUSES.includes(latest.status);

    if (!isTerminal) {
      const expired = await isSessionExpired(latest);
      if (!expired) {
        console.log(`[SESSION] Consulta activa reutilizada: ${latest.id}`);
        return { conversation: latest, isNewSession: false };
      }
      console.log(`[SESSION] La consulta ${latest.id} expiró por inactividad. Marcando como 'finalizada'.`);
      await supabase.from('conversations').update({ status: 'finalizada' }).eq('id', latest.id);
    }
  }

  console.log(`[SESSION] Iniciando nueva consulta para ${clientPhone}.`);
  const { data: newConv, error: convError } = await supabase
    .from('conversations')
    .insert([{ client_phone: clientPhone, client_name: clientName, status: 'open' }])
    .select()
    .single();

  if (convError) throw convError;
  return { conversation: newConv, isNewSession: true };
};
