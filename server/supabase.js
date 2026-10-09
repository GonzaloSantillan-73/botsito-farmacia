import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 [DEBUG-SUPABASE-CLIENT] Inicializando cliente de Supabase, __dirname:', __dirname);

console.log('🔍 [DEBUG-SUPABASE-CLIENT] Cargando dotenv desde:', path.join(__dirname, '../.env'));
dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('✅ [DEBUG-SUPABASE-CLIENT] dotenv cargado');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('🔍 [DEBUG-SUPABASE-CLIENT] SUPABASE_URL presente:', !!process.env.SUPABASE_URL);
console.log('🔍 [DEBUG-SUPABASE-CLIENT] VITE_SUPABASE_URL presente:', !!process.env.VITE_SUPABASE_URL);
console.log('🔍 [DEBUG-SUPABASE-CLIENT] SUPABASE_SERVICE_ROLE_KEY presente:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('🔍 [DEBUG-SUPABASE-CLIENT] VITE_SUPABASE_ANON_KEY presente:', !!process.env.VITE_SUPABASE_ANON_KEY);
console.log('🔍 [DEBUG-SUPABASE-CLIENT] supabaseUrl resuelto (valor no sensible, es URL pública):', supabaseUrl);
console.log('🔍 [DEBUG-SUPABASE-CLIENT] supabaseKey resuelta - presente:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ [DEBUG-SUPABASE-CLIENT] Faltan variables de entorno de Supabase - supabaseUrl presente:', !!supabaseUrl, 'supabaseKey presente:', !!supabaseKey);
  console.error("Faltan las variables de entorno de Supabase");
  console.error('❌ [DEBUG-SUPABASE-CLIENT] Terminando proceso con process.exit(1)');
  process.exit(1);
}

// Con las políticas de supabase/seguridad_solo_usuarios_logueados.sql la anon
// key ya no puede leer ni escribir nada: si el backend cae en este fallback,
// el bot deja de funcionar. Se avisa fuerte en el log para detectarlo enseguida.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('🚨 [DEBUG-SUPABASE-CLIENT] Falta SUPABASE_SERVICE_ROLE_KEY: el backend está usando la anon key y no va a poder leer/escribir la base (las tablas están cerradas a usuarios anónimos).');
}

// Para un bot real en producción, siempre deberías usar el SERVICE_ROLE_KEY
// para sobrepasar el RLS (Row Level Security).
console.log('🔍 [DEBUG-SUPABASE-CLIENT] Creando cliente de Supabase con createClient()');
export const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ [DEBUG-SUPABASE-CLIENT] Cliente de Supabase creado exitosamente');
