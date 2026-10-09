import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase variables are missing in .env')
}

// Pase de Supabase que entrega el backend al iniciar sesión (ver
// generarTokenSupabase en server/services/adminAuth.js). Con las políticas de
// supabase/seguridad_solo_usuarios_logueados.sql, la anon key sola ya no puede
// leer ni escribir nada: todas las consultas y el Realtime viajan con este
// pase. Mientras no haya pase (sin sesión, o el backend todavía sin
// SUPABASE_JWT_SECRET) se usa la anon key, igual que antes.
const SUPABASE_TOKEN_KEY = 'botsito_supabase_token'

const leerTokenGuardado = () => {
  try {
    return localStorage.getItem(SUPABASE_TOKEN_KEY) || null
  } catch {
    return null
  }
}

let supabaseToken = leerTokenGuardado()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => supabaseToken
})

// Cambia el pase en uso (null = volver a la anon key) y se lo pasa también a
// los canales de Realtime ya abiertos, para que no queden con el anterior.
export const setSupabaseToken = (token) => {
  supabaseToken = token || null
  try {
    if (supabaseToken) localStorage.setItem(SUPABASE_TOKEN_KEY, supabaseToken)
    else localStorage.removeItem(SUPABASE_TOKEN_KEY)
  } catch {
    // Sin localStorage (modo privado estricto): el pase igual queda en memoria.
  }
  supabase.realtime.setAuth().catch((err) => console.error('❌ [DEBUG-LIB-SUPABASE] setSupabaseToken() — error actualizando el pase de Realtime:', err))
}
