import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { findBudget, budgetGroup, budgetRPCError } from '@/lib/presupuestos';
import { budgetApplication } from '@/lib/quotes/application';
import { loadAIContext } from '@/lib/ai/context';
import { snapshot, changesBetween } from '@/lib/ai/rows';
import { convertirPresupuestoEnObra } from '@/lib/presupuestos-to-obra';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    if (!['admin', 'supervisor'].includes(user.rol)) throw new AIError('BUDGET_FORBIDDEN', 'Solo administración y supervisión pueden convertir presupuestos.', 403);
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== 'string' || body.id.length > 250 || typeof body.updated_at !== 'string') throw new AIError('INVALID_REQUEST', 'Selecciona un presupuesto guardado.', 400);
    const budget = await findBudget(client, user.empresa_id, body.id);
    if (!budget) throw new AIError('BUDGET_FORBIDDEN', 'El presupuesto no está disponible para tu cuenta.', 403);
    let payload = {};
    if (budget.proyecto_id && budget.grupo_id) {
      const { service } = await loadAIContext(client, user);
      const project = service.getProyectoById(budget.proyecto_id);
      if (!project) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible.', 403);
      payload = budgetApplication(budget.cotizacion, project, service.getActividades(), await budgetGroup(client, user.empresa_id, budget), body);
    }
    if (!budget.proyecto_id) {
      if (['rechazada', 'anulada'].includes(budget.estado)) throw new AIError('BUDGET_STATE', 'Cambia el estado del presupuesto antes de convertirlo en obra.', 409);
      if (budget.updated_at !== body.updated_at) throw new AIError('BUDGET_CONFLICT', 'El presupuesto cambió. Actualiza el listado antes de convertirlo.', 409);
      const { service } = await loadAIContext(client, user);
      const before = snapshot(service, user.empresa_id);
      service.runLocalAI(() => convertirPresupuestoEnObra(budget.cotizacion, { service, incluirGantt: body.incluir_gantt !== false, incluirMateriales: body.incluir_materiales !== false }));
      payload = changesBetween(before, snapshot(service, user.empresa_id)).changed;
    }
    const { data, error } = await client.rpc('convertir_presupuesto_obra', { p_id: budget.id, p_version: body.updated_at, p_payload: payload });
    if (error) {
      if (budget.grupo_id) budgetRPCError(error);
      const code = ['BUDGET_CONFLICT', 'BUDGET_STATE', 'PLAN_LIMIT', 'BUDGET_FORBIDDEN'].find((c) => error.message?.includes(c));
      if (code) throw new AIError(code, code === 'PLAN_LIMIT' ? 'El Plan Gratis admite una obra en curso. Cierra la obra actual o cambia de plan.' : 'El presupuesto cambió o no está disponible. Actualiza el listado.', code === 'BUDGET_FORBIDDEN' ? 403 : 409);
      throw new AIError('BUDGET_CONVERSION', 'No se pudo convertir el presupuesto. No se guardaron cambios parciales; puedes reintentar.', 503);
    }
    return NextResponse.json(data);
  } catch (error) { return errorJSON(error); }
}
