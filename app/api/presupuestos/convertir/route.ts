import { NextRequest, NextResponse } from 'next/server';
import { authorizeAI, errorJSON } from '@/lib/ai/server';
import { AIError } from '@/lib/ai/errors';
import { findBudget, budgetGroup, budgetRPCError } from '@/lib/presupuestos';
import { budgetApplication } from '@/lib/quotes/application';
import { loadAIContext } from '@/lib/ai/context';
import { snapshot, changesBetween } from '@/lib/ai/rows';
import { convertirPresupuestoEnObra } from '@/lib/presupuestos-to-obra';
import { sendAcceptedQuotePdfToWhatsApp } from '@/lib/whatsapp/quote-document';
import { logServerError } from '@/lib/security/audit-log';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Completa valores NOT NULL obligatorios en proyectos para jsonb_populate_record en Postgres. */
function withProjectColumnDefaults(payload: Record<string, any>) {
  if (!Array.isArray(payload?.proyectos) || payload.proyectos.length === 0) return payload;
  return {
    ...payload,
    proyectos: payload.proyectos.map((proj: Record<string, any>) => ({
      finalizada_automaticamente: false,
      recepcion_estado: 'pendiente',
      ...proj,
      dias_laborales:
        Array.isArray(proj.dias_laborales) && proj.dias_laborales.length > 0
          ? proj.dias_laborales
          : [1, 2, 3, 4, 5],
      fechas_no_laborales: Array.isArray(proj.fechas_no_laborales) ? proj.fechas_no_laborales : [],
    })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    if (!['admin', 'supervisor'].includes(user.rol)) {
      throw new AIError('BUDGET_FORBIDDEN', 'Solo administración y supervisión pueden convertir presupuestos.', 403);
    }
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== 'string' || body.id.length > 250 || typeof body.updated_at !== 'string') {
      throw new AIError('INVALID_REQUEST', 'Selecciona un presupuesto guardado.', 400);
    }
    const budget = await findBudget(client, user.empresa_id, body.id);
    if (!budget) throw new AIError('BUDGET_FORBIDDEN', 'El presupuesto no está disponible para tu cuenta.', 403);
    let payload: Record<string, any> = {};
    if (budget.proyecto_id && budget.grupo_id) {
      const { service } = await loadAIContext(client, user);
      const project = service.getProyectoById(budget.proyecto_id);
      if (!project) throw new AIError('PROJECT_FORBIDDEN', 'La obra no está disponible.', 403);
      payload = budgetApplication(
        budget.cotizacion,
        project,
        service.getActividades(),
        await budgetGroup(client, user.empresa_id, budget),
        body,
      );
    }
    if (!budget.proyecto_id) {
      if (['rechazada', 'anulada'].includes(budget.estado)) {
        throw new AIError('BUDGET_STATE', 'Cambia el estado del presupuesto antes de convertirlo en obra.', 409);
      }
      if (budget.updated_at !== body.updated_at) {
        throw new AIError('BUDGET_CONFLICT', 'El presupuesto cambió. Actualiza el listado antes de convertirlo.', 409);
      }
      const { service } = await loadAIContext(client, user);
      const before = snapshot(service, user.empresa_id);
      service.runLocalAI(() =>
        convertirPresupuestoEnObra(budget.cotizacion, {
          service,
          incluirGantt: body.incluir_gantt !== false,
          incluirMateriales: body.incluir_materiales !== false,
        }),
      );
      payload = withProjectColumnDefaults(changesBetween(before, snapshot(service, user.empresa_id)).changed);
    }
    const { data, error } = await client.rpc('convertir_presupuesto_obra', {
      p_id: budget.id,
      p_version: body.updated_at,
      p_payload: payload,
    });
    if (error) {
      logServerError('budget_convert_rpc_error', error);
      if (budget.grupo_id) budgetRPCError(error);
      const code = [
        'BUDGET_CONFLICT',
        'BUDGET_STATE',
        'PLAN_LIMIT',
        'BUDGET_FORBIDDEN',
        'WEB_ROLE_FORBIDDEN',
        'INVALID_PAYLOAD',
        'AMOUNT_INVALID',
      ].find((c) => error.message?.includes(c));
      if (code === 'PLAN_LIMIT') {
        throw new AIError(code, 'El Plan Gratis admite una obra en curso. Cierra la obra actual o cambia de plan.', 409);
      }
      if (code === 'BUDGET_FORBIDDEN' || code === 'WEB_ROLE_FORBIDDEN') {
        throw new AIError(code, 'No tienes permisos para convertir este presupuesto en obra.', 403);
      }
      if (code === 'INVALID_PAYLOAD' || code === 'AMOUNT_INVALID' || error.code === '22001') {
        throw new AIError(
          code || 'BUDGET_INVALID',
          'Revisa los montos, cantidades o textos del presupuesto antes de convertirlo.',
          400,
        );
      }
      if (code) {
        throw new AIError(code, 'El presupuesto cambió o no está disponible. Actualiza el listado.', 409);
      }
      throw new AIError(
        'BUDGET_CONVERSION',
        'No se pudo convertir el presupuesto. No se guardaron cambios parciales; puedes reintentar.',
        503,
      );
    }
    const whatsappPdfSent = await sendAcceptedQuotePdfToWhatsApp(client, { user, cotizacion: budget.cotizacion });
    return NextResponse.json({ ...data, whatsapp_pdf_enviado: whatsappPdfSent });
  } catch (error) {
    return errorJSON(error);
  }
}
