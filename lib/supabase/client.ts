import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEYS = {
  URL: 'obratrack_custom_supabase_url',
  ANON_KEY: 'obratrack_custom_supabase_anon_key',
};

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (typeof window !== 'undefined') {
    const savedUrl = localStorage.getItem(STORAGE_KEYS.URL);
    const savedKey = localStorage.getItem(STORAGE_KEYS.ANON_KEY);
    if (savedUrl && savedKey) {
      url = savedUrl;
      anonKey = savedKey;
    }
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) return false;
  if (url.includes('your-project-id') || url.includes('placeholder')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function saveCustomSupabaseCredentials(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.URL, url.trim());
    localStorage.setItem(STORAGE_KEYS.ANON_KEY, anonKey.trim());
    window.dispatchEvent(new CustomEvent('obratrack_supabase_configured', { detail: { url, anonKey } }));
  }
}

export function clearCustomSupabaseCredentials(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.URL);
    localStorage.removeItem(STORAGE_KEYS.ANON_KEY);
    window.dispatchEvent(new CustomEvent('obratrack_supabase_configured', { detail: null }));
  }
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();
  if (!isSupabaseConfigured()) return null;

  try {
    if (!supabaseInstance) {
      supabaseInstance = createSupabaseJsClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    }
    return supabaseInstance;
  } catch (err) {
    console.error('Error al inicializar cliente Supabase:', err);
    return null;
  }
}

export function createClient() {
  const { url, anonKey } = getSupabaseCredentials();
  const safeUrl = isSupabaseConfigured() ? url : 'https://placeholder.supabase.co';
  const safeKey = isSupabaseConfigured() ? anonKey : 'placeholder-key';
  return createBrowserClient(safeUrl, safeKey);
}
