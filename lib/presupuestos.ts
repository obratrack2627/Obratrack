import { AIError } from "@/lib/ai/errors";
import type { CotizacionEstimacion } from "@/types/database";

export const budgetStatuses = [
  "borrador",
  "enviada",
  "aprobada",
  "rechazada",
  "anulada",
] as const;
export type BudgetStatus = (typeof budgetStatuses)[number];
export interface Presupuesto {
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
export async function saveBudget(
  client: any,
  user: any,
  cotizacion: CotizacionEstimacion,
  projectId?: string,
) {
  if (!["admin", "supervisor"].includes(user.rol))
    throw new AIError(
      "BUDGET_FORBIDDEN",
      "Solo administración y supervisión pueden gestionar presupuestos.",
      403,
    );
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
