import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { client, user } = await authorizeAI(request);
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.id !== "string" ||
      !body.id ||
      body.id.length > 150
    )
      throw new AIError(
        "GESTION_INVALID",
        "Revisa los datos de la solicitud.",
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
    let result;
    if (body.operacion === "recepcion")
      result = await client.rpc("registrar_recepcion_obra", {
        p_id: body.id,
        p_proyecto: params.id,
        p_datos: body.datos,
      });
    else if (body.operacion === "jornal") {
      const attendance = await client
        .from("asistencia_obreros")
        .select("id")
        .eq("id", body.asistencia_id)
        .eq("proyecto_id", params.id)
        .maybeSingle();
      if (attendance.error || !attendance.data)
        throw new AIError(
          "ATTENDANCE_FORBIDDEN",
          "La asistencia no está disponible en esta obra.",
          403,
        );
      result = await client.rpc("registrar_jornal_asistencia", {
        p_id: body.id,
        p_asistencia: body.asistencia_id,
        p_diario: body.valor_diario,
        p_jornada: body.jornada,
        p_extra: body.horas_extra,
        p_valor_extra: body.valor_hora_extra,
      });
    } else if (body.operacion === "reprogramar")
      result = await client.rpc("reprogramar_faenas", {
        p_id: body.id,
        p_proyecto: params.id,
        p_tareas: body.tareas,
        p_entrega: body.ajustar_entrega === true,
        p_motivo: body.motivo,
      });
    else
      throw new AIError(
        "GESTION_INVALID",
        "La operación no está disponible.",
        422,
      );
    if (result.error) {
      const code = String(result.error.message || "");
      const message = code.includes("STALE")
        ? "Las partidas cambiaron. Actualiza la propuesta antes de confirmar."
        : code.includes("ALREADY_RECORDED")
          ? "Esta asistencia ya tiene un jornal registrado. Revísalo en Gastos."
          : code.includes("UNFINISHED")
            ? "Completa las partidas antes de registrar la recepción."
            : "No se pudo confirmar el registro. Revisa los datos y reintenta.";
      throw new AIError("GESTION_SAVE", message, 409);
    }
    return NextResponse.json({ registro: result.data });
  } catch (error) {
    return errorJSON(error);
  }
}
