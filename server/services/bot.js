import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { buscarProductos } from './productos.js';
import { getBotKeyword } from './appConfig.js';
import { getBotSchedule, getHumanSchedule, isWithinSchedule, renderScheduleMessage } from './scheduleConfig.js';
import { agregarAlCarrito, obtenerCarrito, eliminarItemCarrito, vaciarCarrito, formatearCarrito } from './cart.js';
import { getSucursalesActivas, formatearMensajeSucursales } from './sucursales.js';
import { getCliente, tieneRegistroCompleto, guardarDatoCliente } from './clientes.js';
import { asignarSucursalParaPedido } from './pedidoAsignacion.js';

// Todas las opciones del bot se muestran como texto plano dentro del propio chat
// (nada de botones/listas nativas de Meta). Cada mensaje separa con saltos de línea
// el contenido (catálogo, resumen, etc.) de las instrucciones y de las opciones de
// navegación, para que nunca quede todo amontonado en una sola oración. Las opciones
// de navegación secundarias (ver carrito / volver al menú) usan siempre el mismo
// formato de letra: "c." para carrito, "m." para menú de inicio.
export const MENSAJE_BIENVENIDA = '¡Hola! Soy el bot de la Farmacia. 💊\n\n¿Qué querés hacer?\na. Consultar precios e info\nb. Hablar con un humano\nc. Ver mi carrito\nd. Horarios y sucursales\ne. Actualizar mis datos';

const MENSAJE_ERROR_SUCURSALES = 'Tuvimos un problema consultando las sucursales.\n\nPor favor, intentá de nuevo en un momento.';

// Registro de datos personales: se le pide al cliente la primera vez que
// escribe (antes de mostrarle el menú) y puede volver a hacerse desde
// "5. Actualizar mis datos". Cada dato se guarda apenas se confirma (no se
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

const MENSAJE_PEDIR_PRODUCTO = '¿Qué producto o medicamento estás buscando?\n\nEscribí el nombre bien completo y sin errores de tipeo, para encontrar una coincidencia exacta en nuestro catálogo (por ejemplo: "Ibuprofeno").';
const MENSAJE_ERROR_BUSQUEDA = 'Tuvimos un problema buscando en nuestro sistema.\n\nPor favor, intentá de nuevo escribiendo el nombre del producto.';
const MENSAJE_TEXTO_VACIO = 'Por favor escribí el nombre del producto que buscás.';
const MENSAJE_ERROR_CARRITO = 'Tuvimos un problema con tu carrito.\n\nPor favor, intentá de nuevo en un momento.';

const OPCIONES_NO_ENCONTRADO = 'a. Volver a ingresar el nombre del producto\nb. Volver al menú principal';
const mensajeNoEncontrado = (texto) => `No encontramos "${texto}" en nuestro catálogo.\n\n¿Qué querés hacer?\n${OPCIONES_NO_ENCONTRADO}`;
const MENSAJE_OPCION_INVALIDA_NO_ENCONTRADO = `No entendí tu respuesta.\n\nPor favor, elegí una opción válida:\n${OPCIONES_NO_ENCONTRADO}`;

// Formato exacto pedido para catálogo + opciones: resultados numerados, instrucción
// principal, y un bloque separado de "Otras opciones" con los atajos de letra.
// stockDisponible es null si todavía no hay una sucursal de referencia
// configurada (ver Configuración > Administración > Sincronización Plex);
// en ese caso no mostramos la línea de stock en vez de inventar un dato.
const mensajeResultadoBusqueda = (texto, productos) => {
  const lista = productos
    .map((p, idx) => {
      const precio = `$${Number(p.precio).toLocaleString('es-AR')}`;
      const stockTexto = p.stockDisponible == null
        ? ''
        : p.stockDisponible > 0
          ? ` — Stock: ${p.stockDisponible} unidades`
          : ' — Sin stock disponible';
      return `${idx + 1}. ${p.nombre} — ${precio}${stockTexto}`;
    })
    .join('\n\n');
  return `Esto encontramos para "${texto}":\n\n${lista}\n\nPara agregar un producto a tu carrito, escribí el número correspondiente (por ejemplo: 1).\n\nOtras opciones:\nc. Ver carrito\nm. Menú de inicio`;
};

const MENSAJE_OPCION_INVALIDA_RESULTADO = 'No entendí tu respuesta.\n\nPara agregar un producto a tu carrito, escribí el número correspondiente.\n\nOtras opciones:\nc. Ver carrito\nm. Menú de inicio';

const OPCIONES_CARRITO = 'a. Agregar otro producto\nb. Eliminar un producto\nc. Vaciar el carrito\nd. Confirmar pedido\ne. Volver al menú principal';
const MENSAJE_OPCION_INVALIDA_CARRITO = `No entendí tu respuesta.\n\nPor favor, elegí una opción válida:\n${OPCIONES_CARRITO}`;
const MENSAJE_CARRITO_VACIO = 'Tu carrito está vacío.';

// Tras confirmar el pedido, pedimos la ubicación para asignar la sucursal
// más cercana que tenga stock completo (no un texto: tiene que ser el
// mensaje nativo de "Ubicación" de WhatsApp, con latitud/longitud reales).
const MENSAJE_PEDIR_UBICACION = 'Para asignarte la sucursal más cercana con stock disponible, compartí tu ubicación 📍\n\nEn WhatsApp: tocá el ícono de "+" o el clip 📎 → Ubicación → Ubicación actual.';
const MENSAJE_UBICACION_INVALIDA = `No pudimos leer tu ubicación.\n\n${MENSAJE_PEDIR_UBICACION}`;

const mensajeCarrito = (items, prefijo = '') => {
  const { texto, total, envioGratisTexto } = formatearCarrito(items);
  return `${prefijo}🛒 Tu carrito:\n\n${texto}\n\nTotal: $${total.toLocaleString('es-AR')}\n\n${envioGratisTexto}\n\n¿Qué querés hacer?\n${OPCIONES_CARRITO}`;
};

const mensajePedirEliminacion = (items) => {
  const { texto } = formatearCarrito(items);
  return `¿Qué producto querés eliminar?\n\n${texto}\n\nIngresá la letra correspondiente, o escribí "cancelar" para volver al carrito.`;
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

    if (estado === 'awaiting_product_search') {
      if (!t) {
        await enviarMensajeBot(conversationId, telefono, MENSAJE_TEXTO_VACIO);
        return;
      }
      await manejarBusquedaProducto(conversationId, telefono, t);
      return;
    }

    if (estado === 'product_not_found') {
      const tLower = t.toLowerCase();
      if (tLower === 'a') {
        await supabase.from('conversations').update({ bot_state: 'awaiting_product_search' }).eq('id', conversationId);
        await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_PRODUCTO);
      } else if (tLower === 'b') {
        await volverAlMenuPrincipal(conversationId, telefono);
      } else {
        await enviarMensajeBot(conversationId, telefono, MENSAJE_OPCION_INVALIDA_NO_ENCONTRADO);
      }
      return;
    }

    if (estado === 'product_found_menu') {
      await manejarSeleccionResultado(conversationId, telefono, t, conv?.bot_context);
      return;
    }

    if (estado === 'cart_menu') {
      await manejarMenuCarrito(conversationId, telefono, t);
      return;
    }

    if (estado === 'awaiting_remove_item') {
      await manejarEliminarItem(conversationId, telefono, t);
      return;
    }

    if (estado === 'awaiting_location') {
      await manejarUbicacionRecibida(conversationId, telefono, t);
      return;
    }

    if (estado === 'registro_nombre' || estado === 'registro_dni' || estado === 'registro_obra_social') {
      await manejarPasoRegistro(conversationId, telefono, t, estado, conv?.bot_context);
      return;
    }

    // Estado normal: menú principal
    const tLower = t.toLowerCase();
    if (tLower === 'a') {
      await supabase.from('conversations').update({ bot_state: 'awaiting_product_search', bot_context: null }).eq('id', conversationId);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_PRODUCTO);
    } else if (tLower === 'b') {
      const humanSchedule = await getHumanSchedule();
      if (!isWithinSchedule(humanSchedule)) {
        console.log(`[BOT] Se pidió un humano fuera de su horario de atención para ${conversationId}.`);
        await enviarMensajeBot(conversationId, telefono, renderScheduleMessage(humanSchedule));
        return;
      }

      const botKeyword = await getBotKeyword();
      await enviarMensajeBot(conversationId, telefono, mensajeDerivacionHumano(botKeyword));

      console.log(`[BOT] Actualizando estado de la conversación a 'esperando' para ID: ${conversationId}`);
      await supabase
        .from('conversations')
        .update({ status: 'esperando', bot_state: null, bot_context: null })
        .eq('id', conversationId);
    } else if (tLower === 'c') {
      await mostrarCarrito(conversationId, telefono);
    } else if (tLower === 'd') {
      await mostrarSucursales(conversationId, telefono);
    } else if (tLower === 'e') {
      await iniciarRegistro(conversationId, telefono, true, null);
    } else {
      await enviarMensajeBot(conversationId, telefono, MENSAJE_BIENVENIDA);
    }
  } catch (error) {
    console.error(`[BOT] Error procesando mensaje del bot:`, error);
  }
};

const manejarBusquedaProducto = async (conversationId, telefono, texto) => {
  const { data: productos, error } = await buscarProductos(texto);

  if (error) {
    console.error('[BOT] Error buscando productos en Supabase:', error);
    // No cambiamos el bot_state: el cliente se queda en "awaiting_product_search" y puede reintentar.
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_BUSQUEDA);
    return;
  }

  if (!productos || productos.length === 0) {
    await supabase.from('conversations').update({ bot_state: 'product_not_found', bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, mensajeNoEncontrado(texto));
    return;
  }

  // Guardamos los códigos en orden para poder mapear "1", "2"... a un producto
  // concreto (cod_producto real de Plex) cuando el cliente elija cuál agregar.
  await supabase
    .from('conversations')
    .update({ bot_state: 'product_found_menu', bot_context: { productIds: productos.map(p => p.cod_producto) } })
    .eq('id', conversationId);
  await enviarMensajeBot(conversationId, telefono, mensajeResultadoBusqueda(texto, productos));
};

const manejarSeleccionResultado = async (conversationId, telefono, t, botContext) => {
  const productIds = botContext?.productIds || [];
  const tLower = t.toLowerCase();

  if (tLower === 'c' || tLower === 'carrito') {
    await mostrarCarrito(conversationId, telefono);
    return;
  }
  if (tLower === 'm' || tLower === 'menu') {
    await volverAlMenuPrincipal(conversationId, telefono);
    return;
  }

  const indice = Number(t) - 1;
  if (!Number.isInteger(indice) || indice < 0 || indice >= productIds.length) {
    await enviarMensajeBot(conversationId, telefono, MENSAJE_OPCION_INVALIDA_RESULTADO);
    return;
  }

  try {
    await agregarAlCarrito(telefono, productIds[indice]);
  } catch (err) {
    console.error('[BOT] Error agregando producto al carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  await mostrarCarrito(conversationId, telefono, '✅ Agregado a tu carrito.\n\n');
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
// actualización voluntaria desde "5. Actualizar mis datos": en la actualización
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
  await supabase.from('conversations').update({ status: 'open', bot_state: null, bot_context: null }).eq('id', conversationId);
  await enviarMensajeBot(
    conversationId,
    telefono,
    `${esActualizacion ? '✅ ¡Listo! Actualizamos tus datos.' : '✅ ¡Gracias! Ya registramos tus datos.'}\n\n${MENSAJE_BIENVENIDA}`
  );
};

const mostrarCarrito = async (conversationId, telefono, prefijo = '') => {
  let items;
  try {
    items = await obtenerCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error obteniendo el carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  if (items.length === 0) {
    // El carrito vacío deja al cliente en el estado de menú principal: "a" ya
    // dispara la búsqueda de productos y cualquier otra entrada (incluida "m")
    // vuelve a mostrar este mismo menú, así que ambos atajos ya funcionan.
    await supabase.from('conversations').update({ bot_state: null, bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(
      conversationId,
      telefono,
      `${prefijo}${MENSAJE_CARRITO_VACIO}\n\n¿Qué querés hacer?\na. Buscar un producto\nm. Menú de inicio`
    );
    return;
  }

  await supabase.from('conversations').update({ bot_state: 'cart_menu', bot_context: null }).eq('id', conversationId);
  await enviarMensajeBot(conversationId, telefono, mensajeCarrito(items, prefijo));
};

const manejarMenuCarrito = async (conversationId, telefono, t) => {
  const tLower = t.toLowerCase();
  if (tLower === 'a') {
    await supabase.from('conversations').update({ bot_state: 'awaiting_product_search', bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_PRODUCTO);
    return;
  }

  if (tLower === 'b') {
    let items;
    try {
      items = await obtenerCarrito(telefono);
    } catch (err) {
      console.error('[BOT] Error obteniendo el carrito:', err);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
      return;
    }
    if (items.length === 0) {
      await mostrarCarrito(conversationId, telefono);
      return;
    }
    await supabase
      .from('conversations')
      .update({ bot_state: 'awaiting_remove_item', bot_context: { cartItemIds: items.map(i => i.id) } })
      .eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, mensajePedirEliminacion(items));
    return;
  }

  if (tLower === 'c') {
    try {
      await vaciarCarrito(telefono);
    } catch (err) {
      console.error('[BOT] Error vaciando el carrito:', err);
      await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
      return;
    }
    await supabase.from('conversations').update({ bot_state: null, bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, `🗑️ Vaciamos tu carrito.\n\n${MENSAJE_BIENVENIDA}`);
    return;
  }

  if (tLower === 'd') {
    await confirmarPedido(conversationId, telefono);
    return;
  }

  if (tLower === 'e') {
    await volverAlMenuPrincipal(conversationId, telefono);
    return;
  }

  await enviarMensajeBot(conversationId, telefono, MENSAJE_OPCION_INVALIDA_CARRITO);
};

const manejarEliminarItem = async (conversationId, telefono, t) => {
  if (t.toLowerCase() === 'cancelar') {
    await mostrarCarrito(conversationId, telefono);
    return;
  }

  let items;
  try {
    items = await obtenerCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error obteniendo el carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  const letra = t.toLowerCase();
  const indice = letra.charCodeAt(0) - 97;
  if (letra.length !== 1 || indice < 0 || indice >= items.length) {
    await enviarMensajeBot(conversationId, telefono, `No entendí tu respuesta.\n\n${mensajePedirEliminacion(items)}`);
    return;
  }

  try {
    await eliminarItemCarrito(telefono, items[indice].id);
  } catch (err) {
    console.error('[BOT] Error eliminando producto del carrito:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  await mostrarCarrito(conversationId, telefono, `🗑️ Eliminamos "${items[indice].plex_productos?.nombre}" de tu carrito.\n\n`);
};

// Confirmar pedido: en vez de derivar directo a un humano, primero le pedimos
// la ubicación al cliente para poder asignarle la sucursal más cercana que
// tenga stock completo del pedido (ver manejarUbicacionRecibida). El carrito
// se mantiene intacto hasta que la ubicación llegue y se resuelva la asignación.
const confirmarPedido = async (conversationId, telefono) => {
  let items;
  try {
    items = await obtenerCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error obteniendo el carrito para confirmar el pedido:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  if (items.length === 0) {
    await mostrarCarrito(conversationId, telefono);
    return;
  }

  await supabase
    .from('conversations')
    .update({ bot_state: 'awaiting_location', bot_context: null })
    .eq('id', conversationId);

  await enviarMensajeBot(conversationId, telefono, MENSAJE_PEDIR_UBICACION);
};

// Se dispara cuando llega la ubicación pedida tras confirmar el pedido. Corre
// el motor de cercanía + stock ("todo o nada") y recién ahí deriva la
// conversación a un asesor humano, ya con la sucursal asignada (o sin
// asignar, si ninguna cubre el pedido completo, para que un humano lo resuelva).
const manejarUbicacionRecibida = async (conversationId, telefono, texto) => {
  let ubicacion = null;
  try {
    ubicacion = JSON.parse(texto);
  } catch {
    ubicacion = null;
  }

  if (!ubicacion || typeof ubicacion.lat !== 'number' || typeof ubicacion.lng !== 'number') {
    await enviarMensajeBot(conversationId, telefono, MENSAJE_UBICACION_INVALIDA);
    return;
  }

  let items;
  try {
    items = await obtenerCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error obteniendo el carrito para asignar sucursal:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  if (items.length === 0) {
    // Caso raro: el cliente vació el carrito desde otro lado mientras esperábamos su ubicación.
    await supabase.from('conversations').update({ bot_state: null, bot_context: null }).eq('id', conversationId);
    await enviarMensajeBot(conversationId, telefono, `${MENSAJE_CARRITO_VACIO}\n\n${MENSAJE_BIENVENIDA}`);
    return;
  }

  const itemsParaAsignacion = items.map(item => ({
    cod_producto: item.plex_productos?.cod_producto,
    cantidad: item.quantity,
    unidades_por_caja: item.plex_productos?.unidades_por_caja
  }));

  let sucursalAsignada = null;
  try {
    sucursalAsignada = await asignarSucursalParaPedido(ubicacion.lat, ubicacion.lng, itemsParaAsignacion);
  } catch (err) {
    console.error('[BOT] Error asignando sucursal por cercanía/stock:', err);
    await enviarMensajeBot(conversationId, telefono, MENSAJE_ERROR_CARRITO);
    return;
  }

  const { texto: textoCarrito, total, envioGratisTexto } = formatearCarrito(items);
  const botKeyword = await getBotKeyword();

  const pendingOrderItems = items.map(item => ({
    name: item.quantity > 1 ? `${item.plex_productos?.nombre || 'Producto'} x${item.quantity}` : (item.plex_productos?.nombre || 'Producto'),
    price: (Number(item.plex_productos?.precio) || 0) * item.quantity
  }));

  const updates = {
    status: 'esperando',
    bot_state: null,
    bot_context: null,
    pending_order: { items: pendingOrderItems, total, confirmedAt: new Date().toISOString() }
  };

  let mensaje =
    `✅ ¡Gracias por tu pedido! Este es el resumen:\n\n${textoCarrito}\n\nTotal: $${total.toLocaleString('es-AR')}\n\n${envioGratisTexto}\n\n`;

  if (sucursalAsignada) {
    updates.sucursal_id = sucursalAsignada.id;
    mensaje += `📍 Tu pedido fue asignado a nuestra sucursal *${sucursalAsignada.nombre}* (la más cercana con stock disponible).\n\n`;
  } else {
    mensaje += `⚠️ Ninguna de nuestras sucursales tiene stock completo de tu pedido en este momento. Te derivamos igual con un asesor humano para resolverlo.\n\n`;
  }

  mensaje +=
    `Te estamos derivando con un asesor humano para coordinar el pago y la entrega.\n\n` +
    `En breve se pondrán en contacto contigo. Si en cualquier momento querés volver a hablar con el bot, escribí la palabra "${botKeyword}".`;

  // Persistimos la transición de estado, el pedido confirmado y vaciamos el carrito
  // ANTES de intentar enviar el mensaje: el pedido ya quedó confirmado del lado del
  // cliente, así que un fallo transitorio de envío a Meta no debe impedir que pase
  // a "Atendiendo" ni que el operador vea el pedido en el Cotizador.
  console.log(`[BOT] Pedido confirmado para ${conversationId}. Sucursal asignada: ${sucursalAsignada?.nombre || 'ninguna (sin stock completo)'}.`);
  await supabase.from('conversations').update(updates).eq('id', conversationId);

  // Registro histórico permanente para las métricas de ventas (ticket promedio,
  // volumen de ítems, ranking de productos, y ahora también qué sucursal lo
  // atendió): a diferencia de cart_items y pending_order, nunca se vacía.
  try {
    await supabase.from('pedidos_confirmados').insert([{
      conversation_id: conversationId,
      client_phone: telefono,
      sucursal_id: sucursalAsignada?.id || null,
      items: items.map(item => ({
        product_id: item.plex_productos?.cod_producto || null,
        nombre: item.plex_productos?.nombre || 'Producto',
        cantidad: item.quantity,
        precio_unitario: Number(item.plex_productos?.precio) || 0,
        subtotal: (Number(item.plex_productos?.precio) || 0) * item.quantity
      })),
      total
    }]);
  } catch (err) {
    console.error('[BOT] Error registrando el pedido en el histórico de métricas:', err);
  }

  try {
    await vaciarCarrito(telefono);
  } catch (err) {
    console.error('[BOT] Error vaciando el carrito tras confirmar el pedido:', err);
  }

  await enviarMensajeBot(conversationId, telefono, mensaje);
};

const volverAlMenuPrincipal = async (conversationId, telefono) => {
  // 'open' saca a la conversación del modo humano ('esperando') y la vuelve a
  // dejar en la cola de "Entrantes" (bot respondiendo automáticamente).
  await supabase.from('conversations').update({ status: 'open', bot_state: null, bot_context: null }).eq('id', conversationId);
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
