import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan las variables de entorno de Supabase");
  process.exit(1);
}

// Para un bot real en producción, siempre deberías usar el SERVICE_ROLE_KEY
// para sobrepasar el RLS (Row Level Security).
export const supabase = createClient(supabaseUrl, supabaseKey);
