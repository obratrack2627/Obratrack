import { createClient } from '@supabase/supabase-js';

// Configuración de producción para ObraTrack en Supabase
const DEFAULT_SUPABASE_URL = 'https://gaoxbkvhtdsgqxjihlrv.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhb3hia3ZodGRzZ3F4amlobHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMDc3NzgsImV4cCI6MjEwNzU4Mzc3OH0.EpdmT70H2KZ4iZ87H24QZG4NnTOjsldzDzhRCnnpKks';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const getSupabaseClient = () => supabase;