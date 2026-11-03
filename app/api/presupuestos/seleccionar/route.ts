import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { findBudget, budgetGroup, budgetRPCError } from '@/lib/presupuestos';
import { loadAIContext } from '@/lib/ai/context';
import { budgetApplication } from '@/lib/quotes/application';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    if (!['admin', 'supervisor'].includes(user.rol)) throw new AIError('BUDGET_FORBIDDEN', 'Tu perfil no puede elegir presupuestos.', 403);
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== 'string' || body.id.length > 250 || typeof body.updated_at !== 'string' || !['principal','complementario'].includes(body.tipo || 'principal')) throw new AIError('INVALID_REQUEST', 'Selecciona un presupuesto guardado.', 400);
    const row = await findBudget(client, user.empresa_id, body.id);
    if (!row || !row.proyecto_id) throw new AIError('BUDGET_NEEDS_PROJECT', 'Asocia este presupuesto a una obra o crea la obra con la opción elegida.', 409);
    const group = await budgetGroup(client, user.empresa_id, row);
    const { service } = await loadAIContext(client, user);
    const project = service.getProyectoById(row.proyecto_id);
    if (!project) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible.', 403);
    const payload = budgetApplication(row.cotizacion, project, service.getActividades(), group, body);
    const { data, error } = await client.rpc('seleccionar_presupuesto', { p_id: row.id, p_version: body.updated_at, p_payload: payload, p_tipo: body.tipo || 'principal' });
    if (error) budgetRPCError(error);
    return NextResponse.json(data);
  } catch (error) { return errorJSON(error); }
}
