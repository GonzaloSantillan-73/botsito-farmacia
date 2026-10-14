import { useState, useRef, useEffect } from 'react';

// Desde el 1/10/2026 Meta cobra cada mensaje que sale del número, así que los
// mensajes que el operador escribe no salen apenas los manda: esperan acá
// ESPERA_AGRUPAR_MS y, si en ese lapso manda otro, se suman al pendiente (un
// solo mensaje cobrado, con las partes separadas por salto de línea). Con los
// datos de octubre, una espera de 10s junta ~16% de los mensajes de sucursal
// (con 3s eran apenas ~4%).
export const ESPERA_AGRUPAR_MS = 10 * 1000;

// Límite de texto de WhatsApp para un mensaje de texto y para el caption de
// un adjunto, respectivamente.
export const MAX_TEXTO_WHATSAPP = 4096;
export const MAX_CAPTION_WHATSAPP = 1024;

const SEPARADOR = '\n';

// `enviar(conv, texto)` es el envío real (devuelve true si salió bien).
// `onFalla(conv, texto)` se llama si ese envío falla, para no perder el texto.
// Hay una sola bandeja a la vez: el operador escribe en un chat por vez, y
// cambiar de chat la vacía (ver App.jsx).
export function useBandejaSalida(enviar, onFalla) {
  const [pendiente, setPendiente] = useState(null); // { conv, partes: string[], venceEn: number }
  const pendienteRef = useRef(null);
  const timerRef = useRef(null);
  const enviarRef = useRef(enviar);
  const onFallaRef = useRef(onFalla);
  enviarRef.current = enviar;
  onFallaRef.current = onFalla;

  const actualizar = (valor) => {
    pendienteRef.current = valor;
    setPendiente(valor);
  };

  // Saca lo pendiente de la bandeja SIN enviarlo (lo usa el envío de un
  // adjunto, que lo manda como caption, y el botón "Editar").
  const tomar = () => {
    clearTimeout(timerRef.current);
    const actual = pendienteRef.current;
    actualizar(null);
    return actual;
  };

  // Envía ya lo que haya pendiente. Se puede llamar aunque no haya nada.
  const enviarPendiente = async () => {
    const actual = tomar();
    if (!actual) return;
    const texto = actual.partes.join(SEPARADOR);
    const ok = await enviarRef.current(actual.conv, texto);
    if (!ok) onFallaRef.current?.(actual.conv, texto);
  };

  const encolar = async (conv, texto) => {
    const actual = pendienteRef.current;
    const juntoExcede = actual && [...actual.partes, texto].join(SEPARADOR).length > MAX_TEXTO_WHATSAPP;
    if (actual && (actual.conv.id !== conv.id || juntoExcede)) {
      await enviarPendiente();
    }
    const base = pendienteRef.current;
    actualizar({ conv, partes: [...(base?.partes || []), texto], venceEn: Date.now() + ESPERA_AGRUPAR_MS });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { enviarPendiente(); }, ESPERA_AGRUPAR_MS);
  };

  // Si se cierra o recarga la pestaña con algo pendiente, se envía en ese
  // momento: el fetch del envío va con keepalive (ver App.jsx), así que el
  // navegador lo completa aunque la página ya se esté descargando.
  useEffect(() => {
    const alSalir = () => {
      if (pendienteRef.current) enviarPendiente();
    };
    window.addEventListener('pagehide', alSalir);
    return () => {
      window.removeEventListener('pagehide', alSalir);
      clearTimeout(timerRef.current);
    };
  }, []);

  return {
    pendiente,
    pendienteRef,
    encolar,
    enviarPendiente,
    tomar
  };
}
