import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { budgetStatuses } from "@/lib/presupuestos";
export const dynamic = "force-dynamic";

async function access(request: NextRequest) {
  const auth = await authorizeAI(request);
  if (!["admin", "supervisor"].includes(auth.user.rol))
    throw new AIError(
      "BUDGET_FORBIDDEN",
      "Tu perfil no tiene acceso a los presupuestos.",
      403,
    );
  return auth;
}
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await access(request);
    let query = client
      .from("presupuestos")
      .select("*")
      .eq("empresa_id", user.empresa_id)
      .order("created_at", { ascending: false });
    const projectId = request.nextUrl.searchParams.get("proyecto_id");
    if (projectId) query = query.eq("proyecto_id", projectId);
    const { data, error } = await query;
    if (error)
      throw new AIError(
        "BUDGET_READ",
        "No se pudieron cargar los presupuestos.",
        503,
      );
    return NextResponse.json({ presupuestos: data || [] });
  } catch (error) {
    return errorJSON(error);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const { client, user } = await access(request);
    const body = await request.json().catch(() => null);
    if (
      typeof body?.id !== "string" ||
      !budgetStatuses.includes(body.estado) ||
      typeof body.updated_at !== "string"
    )
      throw new AIError(
        "INVALID_REQUEST",
        "Revisa el estado del presupuesto.",
        400,
      );
    const updates: Record<string, any> = { estado: body.estado };
    if (Object.hasOwn(body, "proyecto_id")) {
      if (
        body.proyecto_id !== null &&
        (typeof body.proyecto_id !== "string" || !body.proyecto_id)
      )
        throw new AIError(
          "INVALID_REQUEST",
          "Selecciona una obra válida.",
          400,
        );
      if (body.proyecto_id) {
        const { data, error } = await client
          .from("proyectos")
          .select("id")
          .eq("empresa_id", user.empresa_id)
          .eq("id", body.proyecto_id)
          .maybeSingle();
        if (error || !data)
          throw new AIError(
            "PROJECT_FORBIDDEN",
            "La obra no está disponible para tu cuenta.",
            403,
          );
      }
      updates.proyecto_id = body.proyecto_id;
    }
    const { data, error } = await client
      .from("presupuestos")
      .update(updates)
      .eq("id", body.id)
      .eq("empresa_id", user.empresa_id)
      .eq("updated_at", body.updated_at)
      .select("*")
      .maybeSingle();
    if (error)
      throw new AIError(
        "BUDGET_SAVE",
        "No se pudo actualizar el presupuesto.",
        503,
      );
    if (!data)
      throw new AIError(
        "BUDGET_CONFLICT",
        "El presupuesto cambió o ya no está disponible. Actualiza el listado.",
        409,
      );
    return NextResponse.json({ presupuesto: data });
  } catch (error) {
    return errorJSON(error);
  }
}
