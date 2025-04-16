import { createClient } from '@supabase/supabase-js';

// Tipos para las variables de entorno
const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: window.sessionStorage, // Usar sessionStorage en lugar de localStorage
    storageKey: `sb-session-${Math.random().toString(36).substring(7)}`, // Clave única por sesión
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  // Configuración global para manejo de sesiones
  global: {
    headers: {
      'X-Client-Info': 'supabase-js-v2',
    },
  },
});

export default supabase;
