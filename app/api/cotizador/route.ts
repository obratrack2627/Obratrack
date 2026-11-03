import { NextRequest, NextResponse } from "next/server";
import { generarCotizacionGemini } from "@/lib/gemini";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/provider";
import { saveBudget } from "@/lib/presupuestos";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const { data: company, error: companyError } = await client
      .from("empresas")
      .select("plan_id")
      .eq("id", user.empresa_id)
      .maybeSingle();
    if (companyError || !company)
      throw new AIError(
        "DATABASE_READ",
        "No se pudo confirmar el plan de tu empresa.",
        503,
      );
    if (!["admin", "supervisor"].includes(user.rol))
      throw new AIError(
        "BUDGET_FORBIDDEN",
        "Tu perfil no puede generar presupuestos.",
        403,
      );
    if (!["pro", "pro_ia"].includes(company.plan_id))
      throw new AIError(
        "PLAN_REQUIRED",
        "El cotizador con IA requiere el Plan Pro o Plan Pro IA.",
        403,
      );
    let body: any;
    try {
      body = await request.json();
    } catch {
      throw new AIError("INVALID_REQUEST", "Solicitud no válida.", 400);
    }
    if (typeof body?.descripcion !== "string" || !body.descripcion.trim())
      throw new AIError(
        "INVALID_REQUEST",
        "Describe el trabajo que quieres cotizar.",
        400,
      );
    const m2 =
        body.metros_cuadrados == null
          ? undefined
          : Number(body.metros_cuadrados),
      margen =
        body.margen_utilidad == null ? undefined : Number(body.margen_utilidad);
    if (
      (m2 !== undefined && (!Number.isFinite(m2) || m2 <= 0)) ||
      (margen !== undefined &&
        (!Number.isFinite(margen) || margen < 0 || margen > 200))
    )
      throw new AIError(
        "INVALID_REQUEST",
        "Revisa la superficie y el margen de utilidad.",
        400,
      );
    const cotizacion = await generarCotizacionGemini({
      descripcion: body.descripcion.slice(0, 6000),
      tipo_obra: String(body.tipo_obra || "General").slice(0, 100),
      metros_cuadrados: m2,
      comuna_region: String(body.comuna_region || "Chile").slice(0, 100),
      margen_utilidad: margen,
      nivel_calidad: String(body.nivel_calidad || "estandar").slice(0, 50),
    });
    await saveBudget(client, user, cotizacion);
    return NextResponse.json({
      success: true,
      source: "obratrack_ai",
      cotizacion,
    });
  } catch (error) {
    return errorJSON(error);
  }
}
