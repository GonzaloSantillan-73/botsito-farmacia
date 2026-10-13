// Nombres muy largos (a veces el cliente responde una pregunta en vez de su
// nombre) empujaban el resto de las columnas fuera de las tablas. Quien lo use
// deja el nombre completo en el tooltip (title) de la celda.
const MAX_NOMBRE = 30;

export const recortarNombre = (nombre) =>
  nombre && nombre.length > MAX_NOMBRE ? `${nombre.slice(0, MAX_NOMBRE).trimEnd()}...` : nombre;
