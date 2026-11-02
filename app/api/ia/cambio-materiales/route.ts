import { NextRequest, NextResponse } from "next/server";
import { sugerirMaterialesCambioGemini } from "@/lib/gemini";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";

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
    if (!["pro", "pro_ia"].includes(company.plan_id))
      throw new AIError(
        "PLAN_REQUIRED",
        "La estimación con IA requiere el Plan Pro o Plan Pro IA.",
        403,
      );
    if (!["admin", "supervisor"].includes(user.rol))
      throw new AIError(
        "ROLE_FORBIDDEN",
        "Tu perfil no puede calcular cambios de presupuesto.",
        403,
      );
    const body = await request.json();
    const { titulo, descripcion, nombreObra } = body;
    if (
      (titulo != null && typeof titulo !== "string") ||
      (descripcion != null && typeof descripcion !== "string") ||
      (typeof titulo === "string" && titulo.length > 300) ||
      (typeof descripcion === "string" && descripcion.length > 6000)
    )
      throw new AIError(
        "INVALID_REQUEST",
        "Describe el cambio en hasta 6000 caracteres.",
        400,
      );
    let project: any;
    if (body.proyecto_id) {
      const { data, error } = await client
        .from("proyectos")
        .select("id,nombre,comuna")
        .eq("id", body.proyecto_id)
        .eq("empresa_id", user.empresa_id)
        .maybeSingle();
      if (error || !data)
        throw new AIError(
          "PROJECT_FORBIDDEN",
          "La obra no está disponible para tu cuenta.",
          403,
        );
      project = data;
    }

    if (!titulo && !descripcion) {
      return NextResponse.json(
        {
          error: "Debes indicar el título o descripción de la nueva necesidad.",
        },
        { status: 400 },
      );
    }

    const resultado = await sugerirMaterialesCambioGemini({
      titulo: titulo || "Solicitud adicional",
      descripcion: descripcion || titulo,
      nombreObra:
        project?.nombre ||
        (typeof nombreObra === "string" ? nombreObra.slice(0, 150) : undefined),
      comuna: project?.comuna,
    });

    return NextResponse.json({
      success: true,
      ...resultado,
    });
  } catch (err: any) {
    return errorJSON(err);
  }
}
