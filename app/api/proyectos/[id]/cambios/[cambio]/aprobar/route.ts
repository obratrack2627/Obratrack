import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; cambio: string } },
) {
  try {
    const { client, user } = await authorizeAI(request);
    const body = await request.json();
    const current = await client
      .from("reclamos_cambios_obra")
      .select("id")
      .eq("id", params.cambio)
      .eq("proyecto_id", params.id)
      .eq("empresa_id", user.empresa_id)
      .maybeSingle();
    if (current.error || !current.data)
      throw new AIError(
        "CHANGE_FORBIDDEN",
        "El registro no está disponible en esta obra.",
        403,
      );
    const result = await client.rpc("aprobar_cambio_obra_constructor", {
      p_id: params.cambio,
      p_presupuesto: body.ajustar_presupuesto === true,
      p_plazo: body.ajustar_plazo === true,
      p_reprogramar: body.reprogramar === true,
      p_respaldo: body.respaldo_mandante || "",
    });
    if (result.error)
      throw new AIError(
        "CHANGE_SAVE",
        "No se pudo confirmar la resolución. Reintenta; no se duplicarán los materiales.",
        409,
      );
    return NextResponse.json({ proyecto: result.data });
  } catch (error) {
    return errorJSON(error);
  }
}
