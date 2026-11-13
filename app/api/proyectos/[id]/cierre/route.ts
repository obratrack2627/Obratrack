import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { civilDay, chileToday } from "@/lib/work-calendar";
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { client, user } = await authorizeAI(request);
    const body = await request.json();
    civilDay(body.fecha);
    if (
      typeof body.id !== "string" ||
      !body.id ||
      body.id.length > 150 ||
      body.fecha > chileToday() ||
      typeof body.nota !== "string" ||
      body.nota.length > 4000
    )
      throw new AIError(
        "CLOSE_INVALID",
        "Revisa la fecha y la observación de la jornada.",
        422,
      );
    const project = await client
      .from("proyectos")
      .select("id")
      .eq("id", params.id)
      .eq("empresa_id", user.empresa_id)
      .maybeSingle();
    if (project.error || !project.data)
      throw new AIError(
        "PROJECT_FORBIDDEN",
        "La obra no está disponible.",
        403,
      );
    const saved = await client.rpc("confirmar_cierre_diario", {
      p_id: body.id,
      p_proyecto: params.id,
      p_fecha: body.fecha,
      p_nota: body.nota,
    });
    if (saved.error)
      throw new AIError(
        "CLOSE_SAVE",
        "No se pudo confirmar el cierre. Reintenta; se conserva el mismo registro.",
        503,
      );
    return NextResponse.json({ documento: saved.data });
  } catch (error) {
    return errorJSON(error);
  }
}
