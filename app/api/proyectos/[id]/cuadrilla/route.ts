import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";

async function assign(
  request: NextRequest,
  projectId: string,
  adding: boolean,
) {
  try {
    const { client, user } = await authorizeAI(request);
    const input = await request.json().catch(() => null);
    if (
      !input ||
      typeof input.usuario_id !== "string" ||
      !input.usuario_id ||
      input.usuario_id.length > 100
    )
      throw new AIError(
        "CREW_INVALID",
        "Selecciona un integrante del equipo.",
        422,
      );
    const [project, member] = await Promise.all([
      client
        .from("proyectos")
        .select("id")
        .eq("id", projectId)
        .eq("empresa_id", user.empresa_id)
        .maybeSingle(),
      client
        .from("usuarios")
        .select("id,rol")
        .eq("id", input.usuario_id)
        .eq("empresa_id", user.empresa_id)
        .maybeSingle(),
    ]);
    if (project.error || member.error)
      throw new AIError("CREW_READ", "No se pudo verificar la cuadrilla.", 503);
    if (!project.data || !member.data)
      throw new AIError(
        "CREW_FORBIDDEN",
        "La obra o el integrante no están disponibles en tu empresa.",
        403,
      );
    if (adding && !["terreno", "supervisor"].includes(member.data.rol))
      throw new AIError(
        "CREW_ROLE",
        "Selecciona un trabajador de terreno o supervisor.",
        422,
      );
    const change = adding
      ? client
          .from("proyecto_trabajadores")
          .upsert(
            { proyecto_id: projectId, usuario_id: input.usuario_id },
            { onConflict: "proyecto_id,usuario_id" },
          )
      : client
          .from("proyecto_trabajadores")
          .delete()
          .eq("proyecto_id", projectId)
          .eq("usuario_id", input.usuario_id);
    const saved = await change;
    if (saved.error)
      throw new AIError(
        "CREW_SAVE",
        "No se pudo confirmar la asignación. Reintenta.",
        503,
      );
    const current = await client
      .from("proyecto_trabajadores")
      .select("usuario_id")
      .eq("proyecto_id", projectId);
    if (current.error)
      throw new AIError(
        "CREW_READ",
        "El cambio se guardó, pero no se pudo actualizar la cuadrilla. Reintenta para verificarla.",
        503,
      );
    const ids = (current.data || []).map(
      (row: { usuario_id: string }) => row.usuario_id,
    );
    if (ids.includes(input.usuario_id) !== adding)
      throw new AIError(
        "CREW_VERIFY",
        "No se pudo verificar la cuadrilla guardada. Reintenta.",
        503,
      );
    return NextResponse.json({ proyecto_id: projectId, trabajadores_ids: ids });
  } catch (error) {
    return errorJSON(error);
  }
}
export function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return assign(request, params.id, true);
}
export function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return assign(request, params.id, false);
}
