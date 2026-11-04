import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/client';
import { canAccessWeb } from './access';

// Compatible con Edge: la cookie contiene un JWT que Auth valida, nunca un ID de usuario.
export async function verifyWebSession(token: string, fetcher: typeof fetch = fetch) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher, headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const result = await client.from('usuarios').select('id,empresa_id,rol,is_dev')
    .or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`).maybeSingle();
  if (result.error || !result.data?.empresa_id) return null;
  return { user: result.data, allowed: canAccessWeb(result.data) };
}
