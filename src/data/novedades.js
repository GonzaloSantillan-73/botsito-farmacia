// Buzón de novedades: lo nuevo, lo mejorado y lo corregido del CRM, contado
// para las sucursales. Se agrega una entrada por cada cambio que se despliega
// (las más nuevas arriba). Ver INSTRUCCIONES_PARA_CLAUDE.md.
//
// Campos:
// - id: único y fijo (no cambiarlo nunca: con él se recuerda qué ya leyó cada usuario).
// - fecha: 'AAAA-MM-DD' del cambio.
// - tipo: 'nuevo' | 'mejora' | 'correccion'.
// - para: 'todos' (sucursales y administración) | 'admin' (sólo administración).
// - titulo: corto.
// - detalle: lista de párrafos cortos, en lenguaje simple (admite *negrita* como en WhatsApp).
export const NOVEDADES = [
  {
    id: '2026-10-19-ubicacion-sin-menu',
    fecha: '2026-10-19',
    tipo: 'mejora',
    para: 'todos',
    titulo: 'El bot ayuda mejor a quien no usa los botones',
    detalle: [
      'Si el cliente escribe dos veces en vez de tocar un botón, el bot ya no le dice "¡Perfecto!": le contesta "¡No hay problema! 😊 Te paso directo con nuestra farmacia más cercana a vos para que te atienda una persona" y le pide la ubicación.'
    ]
  },
  {
    id: '2026-10-19-buzon-novedades',
    fecha: '2026-10-19',
    tipo: 'nuevo',
    para: 'todos',
    titulo: 'Buzón de novedades',
    detalle: [
      'Este buzón. Acá vas a ver cada cosa nueva, mejorada o corregida del CRM, con su fecha.',
      'Cuando haya novedades sin leer, el ícono del regalo 🎁 de arriba muestra un número rojo.'
    ]
  },
  {
    id: '2026-10-19-menu-botones',
    fecha: '2026-10-19',
    tipo: 'nuevo',
    para: 'todos',
    titulo: 'El menú del bot ahora tiene botones',
    detalle: [
      'El cliente ya no tiene que escribir un número: toca *Hablar con un asesor*, *Horarios y locales* o *Cambiar mi nombre*.',
      'Si escribe en vez de tocar, el bot le recuerda que toque un botón. Si vuelve a escribir, le pide la ubicación para pasarlo con una farmacia.',
      'En el chat del panel vas a ver los botones debajo del mensaje del bot, y lo que tocó el cliente aparece como su mensaje.',
      'Cada botón sirve una sola vez: si el cliente toca uno viejo, queda en el chat pero el bot no responde.'
    ]
  },
  {
    id: '2026-10-19-casilla-encuesta',
    fecha: '2026-10-19',
    tipo: 'nuevo',
    para: 'todos',
    titulo: 'Elegí si el cliente califica la atención',
    detalle: [
      'Al *Finalizar Consulta* hay una casilla nueva: *Pedirle al cliente que califique la atención*.',
      'Marcada (viene así siempre): el cliente recibe el mensaje de cierre y la encuesta. Desmarcada: la consulta se cierra sin mandarle nada.',
      'Desmarcala cuando la encuesta no tenga sentido, por ejemplo si el cliente solo escribió "gracias" o fue un mensaje equivocado.'
    ]
  },
  {
    id: '2026-10-19-encuesta-lista',
    fecha: '2026-10-19',
    tipo: 'mejora',
    para: 'todos',
    titulo: 'La encuesta se responde con una lista',
    detalle: [
      'El cliente toca *Calificar* y elige de *5️⃣ Muy satisfecho* a *1️⃣ Muy insatisfecho*. Si escribe el número, también vale.'
    ]
  },
  {
    id: '2026-10-19-cierre-sin-respuesta',
    fecha: '2026-10-19',
    tipo: 'mejora',
    para: 'todos',
    titulo: 'Si no le respondés al cliente, la consulta se cierra sola',
    detalle: [
      'Cuando un cliente está esperando una respuesta de la farmacia y nadie le contesta, la consulta se cierra sola a las *12 horas* de su último mensaje.',
      'Si la consulta ya la había tomado una sucursal, al cliente se le pide que califique la atención.',
      'El reloj del chat se pone *en rojo* y muestra cuánto falta. ¡Respondé antes de que llegue a cero!',
      'Si solo habló con el bot, o nadie tomó la consulta, se cierra sin mandarle mensajes.'
    ]
  },
  {
    id: '2026-10-19-seguis-ahi',
    fecha: '2026-10-19',
    tipo: 'mejora',
    para: 'todos',
    titulo: 'El aviso "¿Seguís necesitando ayuda?" es más claro',
    detalle: [
      'Se manda solo cuando le respondiste al cliente y él no contesta. Ahora le explica que, si ya terminó, no responda nada (ni "no" ni "nada"), así la consulta se cierra sola.'
    ]
  },
  {
    id: '2026-10-19-cambiar-nombre',
    fecha: '2026-10-19',
    tipo: 'mejora',
    para: 'todos',
    titulo: 'El cliente cambia su nombre más fácil',
    detalle: [
      'La opción del menú ahora se llama *Cambiar mi nombre*: le muestra su nombre actual y le pide el nuevo directamente.'
    ]
  },
  {
    id: '2026-10-19-correccion-botones',
    fecha: '2026-10-19',
    tipo: 'correccion',
    para: 'todos',
    titulo: 'Botones viejos ya no causan respuestas equivocadas',
    detalle: [
      'Tocar un botón de un mensaje viejo ya no se guarda como una calificación ni hace que el bot responda algo que no corresponde.'
    ]
  },
  {
    id: '2026-10-19-numero-prueba',
    fecha: '2026-10-19',
    tipo: 'nuevo',
    para: 'admin',
    titulo: 'Número de prueba',
    detalle: [
      'En *Configuración → Ajustes de Chat* podés cargar un número con sus propios tiempos de cierre (por ejemplo, 2 minutos), para probar el bot sin afectar a los clientes reales.',
      'Los tiempos de cierre ahora se configuran en horas, minutos y segundos.'
    ]
  },
  {
    id: '2026-10-18-mensajes-bot',
    fecha: '2026-10-18',
    tipo: 'mejora',
    para: 'todos',
    titulo: 'Mensajes del bot más claros',
    detalle: [
      'El pedido de ubicación explica paso a paso cómo mandarla: clip 📎 → Ubicación → Enviar tu ubicación actual.',
      'Al pasar al cliente con un asesor, el bot le pide que vaya escribiendo *todo* lo que necesita mientras espera. Así, cuando abrís el chat, ya tenés la consulta completa.',
      'A los clientes nuevos el bot les pide nombre y apellido con un ejemplo, y espera 40 segundos antes de preguntar, para no cortarles lo que están escribiendo.'
    ]
  },
  {
    id: '2026-10-14-responder-citando',
    fecha: '2026-10-14',
    tipo: 'nuevo',
    para: 'todos',
    titulo: 'Responder a un mensaje puntual',
    detalle: [
      'Pasá el mouse por un mensaje y tocá la flechita ↩ para responderlo citado, como en WhatsApp.',
      'Cuando el cliente responde citando un mensaje, en el panel ves la cita arriba. Tocándola, el chat salta al mensaje original.'
    ]
  },
  {
    id: '2026-10-14-ctrl-enter',
    fecha: '2026-10-14',
    tipo: 'nuevo',
    para: 'todos',
    titulo: 'Ctrl + Enter para enviar, y mensajes agrupados',
    detalle: [
      '*Enter* ahora hace un salto de línea; para enviar usá *Ctrl + Enter* o el botón de enviar.',
      'Lo que enviás espera unos segundos en una burbuja punteada (podés *Editar* o *Enviar ya*). Si escribís algo más en ese tiempo, sale todo junto en un solo mensaje.',
      'Cada mensaje que se le manda al cliente tiene costo: escribí la respuesta completa en un solo mensaje en vez de varios cortos.'
    ]
  },
  {
    id: '2026-10-14-contador-mensajes',
    fecha: '2026-10-14',
    tipo: 'nuevo',
    para: 'todos',
    titulo: 'Contador de mensajes en cada chat',
    detalle: [
      'Arriba del chat, el contador verde muestra cuántos mensajes le mandó el bot 🤖 y cuántos la sucursal 🏪 en esa consulta.'
    ]
  },
  {
    id: '2026-10-14-metricas-mensajes',
    fecha: '2026-10-14',
    tipo: 'nuevo',
    para: 'admin',
    titulo: 'Mensajes del bot y de la sucursal en Métricas',
    detalle: [
      'En *Métricas → Detalle de consultas* (y en el Excel) hay dos columnas nuevas: *Msjs Bot* y *Msjs Sucursal*.'
    ]
  }
];
