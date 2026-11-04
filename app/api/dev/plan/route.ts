import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
export async function PATCH(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    if (user.is_dev !== true) throw new AIError('DEV_REQUIRED', 'Esta opción es exclusiva para desarrolladores.', 403);
    const { plan } = await request.json();
    if (!['gratis', 'pro', 'pro_ia'].includes(plan)) throw new AIError('PLAN_INVALID', 'Plan no válido.', 422);
    const { data, error } = await client.rpc('cambiar_plan_desarrollo', { p_plan: plan });
    if (error || data?.plan_id !== plan) throw new AIError('PLAN_SAVE', 'No se pudo confirmar el cambio de plan.', 503);
    return NextResponse.json({ plan_id: data.plan_id });
  } catch (error) { return errorJSON(error); }
}
