import { AIError } from "@/lib/ai/errors";
import type { CotizacionEstimacion } from "@/types/database";

export const budgetStatuses = [
  "borrador",
  "enviada",
  "aprobada",
  "rechazada",
  "anulada",
  "no_elegida",
] as const;
export type BudgetStatus = (typeof budgetStatuses)[number];
export interface Presupuesto {
  grupo_id?: string | null;
  nombre_alternativa?: string | null;
  grupo?: BudgetGroup | null;
  id: string;
  empresa_id: string;
  creado_por: string;
  proyecto_id: string | null;
  estado: BudgetStatus;
  origen: "plataforma" | "whatsapp";
  cotizacion: CotizacionEstimacion;
  created_at: string;
  updated_at: string;
}
export interface BudgetGroup {
  id: string; empresa_id: string; proyecto_id: string | null; nombre: string;
  tipo: 'principal' | 'complementario'; seleccionado_id: string | null;
  aplicado: boolean; monto_aplicado: number;
  ejecucion: { actividades?: Record<string, any>[]; materiales_proyecto?: Record<string, any>[] };
}
export async function budgetGroup(client: any, company: string, row: Presupuesto) {
  if (!row.grupo_id) return null;
  const { data, error } = await client.from('presupuesto_grupos').select('*').eq('empresa_id', company).eq('id', row.grupo_id).maybeSingle();
  if (error || !data) throw new AIError('BUDGET_READ', 'No se pudo consultar el grupo de alternativas.', 503);
  return data as BudgetGroup;
}
export function budgetRPCError(error: any): never {
  const codes: Record<string, string> = {
    BUDGET_CONFLICT: 'El presupuesto cambió en otro dispositivo. Actualiza el listado.',
    BUDGET_EXECUTION_CHANGED: 'Esta alternativa ya tiene compras, avances o ajustes de ejecución. Revisa esos registros antes de sustituirla; no se modificó la obra.',
    BUDGET_PRIMARY_EXISTS: 'Esta obra ya tiene un presupuesto principal. Crea una alternativa de ese presupuesto o un alcance complementario.',
    BUDGET_LOCKED: 'Este presupuesto ya está aplicado a la obra. Crea una alternativa para revisar el cambio antes de actualizarla.',
    BUDGET_USE_SELECTION: 'Usa «Elegir y aplicar» para actualizar la opción aprobada de este alcance.',
    BUDGET_STATE: 'El presupuesto está rechazado o anulado. Cambia su estado antes de elegirlo.',
    BUDGET_NEEDS_PROJECT: 'Asocia primero este grupo a una obra o crea la obra con la alternativa elegida.',
    BUDGET_FORBIDDEN: 'El presupuesto o la obra no están disponibles para tu cuenta.',
    PLAN_LIMIT: 'El Plan Gratis admite una obra activa.',
    BUDGET_INVALID: 'Revisa los datos del presupuesto y sus materiales.',
    BUDGET_OPTION_NAME: 'Ya existe una alternativa con ese nombre. Elige un nombre distinto.',
  };
  const code = Object.keys(codes).find((c) => error?.message?.includes(c));
  if (code) throw new AIError(code, codes[code], code === 'BUDGET_FORBIDDEN' ? 403 : 409);
  throw new AIError('BUDGET_SAVE', 'No se pudo confirmar el cambio del presupuesto. Actualiza antes de reintentar.', 503);
}
// WhatsApp usa un ID de registro wa:..., distinto del ID del documento cot-....
export async function findBudget(client: any, company: string, id: string) {
  let result = await client.from('presupuestos').select('*').eq('empresa_id', company).eq('id', id).maybeSingle();
  if (!result.error && !result.data) result = await client.from('presupuestos').select('*').eq('empresa_id', company).eq('cotizacion->>id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new AIError('BUDGET_READ', 'No se pudo consultar el presupuesto guardado.', 503);
  return result.data as Presupuesto | null;
}
export async function saveBudget(
  client: any,
  user: any,
  cotizacion: CotizacionEstimacion,
  projectId?: string,
  source?: Presupuesto | null,
) {
  if (!["admin", "supervisor"].includes(user.rol))
    throw new AIError(
      "BUDGET_FORBIDDEN",
      "Solo administración y supervisión pueden gestionar presupuestos.",
      403,
    );
  if (cotizacion.alternativas?.length || source) {
    const options = [{ ...cotizacion, alternativas: undefined }, ...(cotizacion.alternativas || [])];
    const { data, error } = await client.rpc('guardar_alternativas_presupuesto', {
      p_origen_id: source?.id || null, p_version: source?.updated_at || null,
      p_cotizaciones: options, p_proyecto: source ? source.proyecto_id : projectId || null,
      p_nombre: source?.cotizacion.titulo_proyecto || cotizacion.titulo_proyecto, p_tipo: 'principal',
    });
    if (error) budgetRPCError(error);
    cotizacion.grupo_presupuesto_id = data.grupo.id;
    for (const q of cotizacion.alternativas || []) q.grupo_presupuesto_id = data.grupo.id;
    return;
  }
  const { error } = await client.from("presupuestos").upsert(
    {
      id: cotizacion.id,
      empresa_id: user.empresa_id,
      creado_por: user.id,
      proyecto_id: projectId || null,
      origen: "plataforma",
      cotizacion,
    },
    { onConflict: "id" },
  );
  if (error)
    throw new AIError(
      "BUDGET_SAVE",
      "No se pudo guardar el presupuesto. Intenta nuevamente.",
      503,
    );
}
