import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase variables are missing in .env')
}

console.log('🔍 [DEBUG-LIB-SUPABASE] creando cliente de Supabase — url:', supabaseUrl, '| anonKey presente:', !!supabaseAnonKey);
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
console.log('✅ [DEBUG-LIB-SUPABASE] cliente de Supabase creado');
