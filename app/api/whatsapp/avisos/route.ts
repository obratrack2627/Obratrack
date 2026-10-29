import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { client, user } = await authorizeAI(req);
    if (!["admin", "supervisor"].includes(user.rol))
      throw new AIError(
        "ROLE_FORBIDDEN",
        "Tu perfil no puede consultar los envíos al equipo.",
        403,
      );
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const { data, error } = await client
        .from("whatsapp_envios")
        .select("id,nombre,rol,telefono,estado,error_detalle,updated_at")
        .eq("empresa_id", user.empresa_id)
        .eq("aviso_id", id)
        .order("nombre")
        .limit(200);
      if (error)
        throw new AIError(
          "OUTBOX_READ",
          "No se pudo consultar el estado de los destinatarios.",
          503,
        );
      return NextResponse.json({ envios: data || [] });
    }
    const page = Math.max(
      0,
      Math.min(Number(req.nextUrl.searchParams.get("pagina")) || 0, 10000),
    );
    const { data, error, count } = await client
      .from("whatsapp_avisos_resumen")
      .select("*", { count: "exact" })
      .eq("empresa_id", user.empresa_id)
      .order("created_at", { ascending: false })
      .range(page * 20, page * 20 + 19);
    if (error)
      throw new AIError(
        "OUTBOX_READ",
        "No se pudieron cargar los avisos.",
        503,
      );
    return NextResponse.json(
      { avisos: data || [], total: count || 0, pagina: page },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorJSON(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await authorizeAI(req);
    if (!["admin", "supervisor"].includes(user.rol))
      throw new AIError(
        "ROLE_FORBIDDEN",
        "Tu perfil no puede reintentar avisos.",
        403,
      );
    const body = await req.json();
    if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id))
      throw new AIError("INVALID_REQUEST", "Selecciona un aviso válido.", 400);
    const { data, error } = await client.rpc("reintentar_aviso_equipo", {
      p_id: body.id,
    });
    if (error)
      throw new AIError("OUTBOX_RETRY", "No se pudo reintentar el aviso.", 503);
    return NextResponse.json({ reintentados: data });
  } catch (e) {
    return errorJSON(e);
  }
}
