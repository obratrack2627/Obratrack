import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { budgetStatuses } from "@/lib/presupuestos";
import { reviseQuote } from "@/lib/quotes/revise";
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
    const id = request.nextUrl.searchParams.get("id");
    if (id) query = query.eq("id", id);
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
    const raw = await request.text();
    if (raw.length > 400000) throw new AIError("REQUEST_TOO_LARGE", "El presupuesto es demasiado extenso.", 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { body = null; }
    if (
      typeof body?.id !== "string" ||
      (Object.hasOwn(body, "estado") && !budgetStatuses.includes(body.estado)) ||
      typeof body.updated_at !== "string"
    )
      throw new AIError(
        "INVALID_REQUEST",
        "Revisa el estado del presupuesto.",
        400,
      );
    const updates: Record<string, any> = {};
    if (Object.hasOwn(body, "estado")) updates.estado = body.estado;
    if (Object.hasOwn(body, "cotizacion")) {
      const { data: current, error: readError } = await client.from("presupuestos")
        .select("cotizacion").eq("empresa_id", user.empresa_id).eq("id", body.id).maybeSingle();
      if (readError) throw new AIError("BUDGET_READ", "No se pudo consultar el presupuesto guardado.", 503);
      if (!current) throw new AIError("BUDGET_FORBIDDEN", "El presupuesto no está disponible para tu cuenta.", 403);
      if (body.cotizacion?.id !== body.id) throw new AIError("INVALID_REQUEST", "La cotización no corresponde al presupuesto.", 400);
      updates.cotizacion = reviseQuote(current.cotizacion, body.cotizacion);
    }
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
    if (!Object.keys(updates).length) throw new AIError("INVALID_REQUEST", "No hay cambios para guardar.", 400);
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
