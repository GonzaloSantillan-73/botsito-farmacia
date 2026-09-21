// Vacía por completo el bucket de Storage "media" (fotos de recetas, audios,
// videos, PDFs y documentos adjuntados en el chat). El bucket no tiene
// subcarpetas (ver server/services/moderacion.js), así que un solo list()
// paginado alcanza para recorrerlo entero.
//
// Se corre a mano, junto con supabase/limpiar_datos_clientes.sql: ese script
// vacía las tablas (messages, clientes, conversations, etc.) pero no toca
// Storage, así que sin esto los archivos quedan huérfanos en el bucket.
//
// ADVERTENCIA: esto es IRREVERSIBLE. Borra los archivos para siempre.
//
// Uso: node vaciar_bucket_media.js
import { supabase } from './server/supabase.js';

const BUCKET = 'media';
const PAGE_SIZE = 100;

const listarTodosLosArchivos = async () => {
  const archivos = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
      throw new Error(`Error listando el bucket "${BUCKET}": ${error.message}`);
    }
    if (!data || data.length === 0) break;

    archivos.push(...data.map((archivo) => archivo.name));
    offset += data.length;

    if (data.length < PAGE_SIZE) break;
  }

  return archivos;
};

const main = async () => {
  console.log(`🔍 Listando archivos del bucket "${BUCKET}"...`);
  const archivos = await listarTodosLosArchivos();

  if (archivos.length === 0) {
    console.log('✅ El bucket ya está vacío. Nada para borrar.');
    return;
  }

  console.log(`🗑️  Se encontraron ${archivos.length} archivos. Borrando en lotes de ${PAGE_SIZE}...`);

  let borrados = 0;
  for (let i = 0; i < archivos.length; i += PAGE_SIZE) {
    const lote = archivos.slice(i, i + PAGE_SIZE);
    const { error } = await supabase.storage.from(BUCKET).remove(lote);
    if (error) {
      throw new Error(`Error borrando lote (${i}-${i + lote.length}): ${error.message}`);
    }
    borrados += lote.length;
    console.log(`   ...${borrados}/${archivos.length}`);
  }

  console.log(`✅ Listo. Se borraron ${borrados} archivos del bucket "${BUCKET}".`);
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Falló la limpieza del bucket:', err.message);
    process.exit(1);
  });
