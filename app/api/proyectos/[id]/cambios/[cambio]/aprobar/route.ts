import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { notifyPushOnChangeApproval } from "@/lib/push/events";
export async function POST(
  request: NextRequest,
  { params: parameters }: { params: Promise<{ id: string; cambio: string }> },
) {
  const params = await parameters;
  try {
    const { client, user } = await authorizeAI(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AIError("INVALID_REQUEST", "Revisa los datos enviados para aprobar el cambio.", 400);
    }
    const current = await client
      .from("reclamos_cambios_obra")
      .select("id,titulo")
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
      p_respaldo: typeof body.respaldo_mandante === "string" ? body.respaldo_mandante : "",
    });
    if (result.error) {
      const msg = String(result.error.message || "");
      const status = msg.includes("FORBIDDEN")
        ? 403
        : msg.includes("NOT_FOUND")
          ? 404
          : result.error.code === "22P02" || msg.includes("INVALID")
            ? 422
            : 409;
      throw new AIError(
        "CHANGE_SAVE",
        "No se pudo confirmar la resolución. Reintenta; no se duplicarán los materiales.",
        status,
      );
    }
    notifyPushOnChangeApproval(client, {
      empresaId: user.empresa_id,
      projectId: params.id,
      projectName: result.data?.nombre,
      titulo: current.data.titulo,
      actorId: user.id,
    });
    return NextResponse.json({ proyecto: result.data });
  } catch (error) {
    return errorJSON(error);
  }
}
