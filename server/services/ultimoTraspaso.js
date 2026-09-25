import { supabase } from '../supabase.js';

// Registra el último movimiento de traspaso de una conversación ('derivado' o
// 'devuelto', ver supabase/conversations_ultimo_traspaso.sql), que la pestaña
// "Global" del admin muestra arriba del nombre de la sucursal actual.
// Va en un UPDATE aparte y no crítico, a propósito: si todavía no se corrió
// esa migración, falla solo esta marca y la derivación/devolución (que ya
// quedó confirmada antes de llamar acá) sigue funcionando igual.
export const registrarUltimoTraspaso = async (conversationId, tipo) => {
  const { error } = await supabase
    .from('conversations')
    .update({ ultimo_traspaso: tipo })
    .eq('id', conversationId);
  if (error) {
    console.error('❌ [DEBUG-SERVICE-ULTIMOTRASPASO] registrarUltimoTraspaso() — error (no crítico):', { conversationId, tipo, error });
  }
};
