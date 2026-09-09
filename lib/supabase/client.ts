import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://guouimnywtmnfzgocksr.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3VpbW55d3RtbmZ6Z29ja3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjQ5MjUsImV4cCI6MjEwNDUwMDkyNX0.PZTxOfJs0MBCC3ZtPMIwaKSZUwBoQ4Q_XvtyMV6ae2I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const getSupabaseClient = () => supabase;