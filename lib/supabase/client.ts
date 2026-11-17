import { createClient } from '@supabase/supabase-js';

// Las variables públicas deben provenir del entorno de despliegue (Vercel / .env.local).
const BUILD_TIME_FALLBACK_URL = 'https://placeholder.supabase.co';
const BUILD_TIME_FALLBACK_ANON_KEY = 'placeholder-anon-key';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || BUILD_TIME_FALLBACK_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || BUILD_TIME_FALLBACK_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const getSupabaseClient = () => supabase;