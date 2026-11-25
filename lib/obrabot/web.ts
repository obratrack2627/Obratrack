import type { NextRequest } from 'next/server';
import { authorizeAI } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { requireSupabaseAdmin } from '@/lib/supabase/admin';

export async function authorizeQuoteWeb(request: NextRequest, options?: { allowSupervisor?: boolean }) {
  const { client, user } = await authorizeAI(request, { adminOnly: !options?.allowSupervisor });
  if (options?.allowSupervisor && !['admin', 'supervisor'].includes(user.rol)) {
    throw new AIError('OBRABOT_ADMIN', 'La preparación de cotizaciones corresponde al supervisor o administrador.', 403);
  }
  const result = await client.from('empresas').select('plan_id').eq('id', user.empresa_id).maybeSingle();
  if (result.error) throw new AIError('OBRABOT_QUOTE_DB', 'No pude verificar el plan de la empresa.', 503);
  if (!['pro', 'pro_ia'].includes(result.data?.plan_id)) throw new AIError('PLAN_REQUIRED', 'ObraBot requiere el plan Pro o Pro IA.', 403);
  return { actor: user, client, db: requireSupabaseAdmin(), plan: result.data?.plan_id };
}
