import { NextRequest, NextResponse } from "next/server";
import { sugerirMaterialesCambioGemini } from "@/lib/gemini";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";

export async function POST(request: NextRequest) {
  try {
    const { user } = await authorizeAI(request);
    if (!["admin", "supervisor"].includes(user.rol))
      throw new AIError(
        "ROLE_FORBIDDEN",
        "Tu perfil no puede calcular cambios de presupuesto.",
        403,
      );
    const body = await request.json();
    const { titulo, descripcion, nombreObra } = body;

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
      nombreObra,
    });

    return NextResponse.json({
      success: true,
      ...resultado,
    });
  } catch (err: any) {
    return errorJSON(err);
  }
}
