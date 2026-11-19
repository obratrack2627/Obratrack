import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordSecurityEvent } from "@/lib/security/audit-log";
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

export async function DELETE(req: NextRequest) {
  try {
    const { client, user } = await authorizeAI(req);
    if (!["admin", "supervisor"].includes(user.rol)) {
      throw new AIError(
        "ROLE_FORBIDDEN",
        "Solo administración y supervisión pueden eliminar avisos.",
        403,
      );
    }

    let avisoId = (req.nextUrl.searchParams.get("id") || "").trim();
    if (!avisoId) {
      const body = await req.json().catch(() => null);
      avisoId = typeof body?.id === "string" ? body.id.trim() : "";
    }
    if (!/^[a-f0-9-]{36}$/i.test(avisoId)) {
      throw new AIError("INVALID_REQUEST", "Selecciona un aviso válido para eliminar.", 400);
    }

    const db = getSupabaseAdmin() || client;
    const { data: existing, error: readError } = await db
      .from("whatsapp_avisos")
      .select("id, empresa_id")
      .eq("empresa_id", user.empresa_id)
      .eq("id", avisoId)
      .maybeSingle();

    if (readError) {
      throw new AIError("OUTBOX_DELETE", "No se pudo consultar el aviso seleccionado.", 503);
    }
    if (!existing) {
      throw new AIError("AVISO_NOT_FOUND", "El aviso no existe o no pertenece a tu empresa.", 404);
    }

    const { error: deleteError } = await db
      .from("whatsapp_avisos")
      .delete()
      .eq("empresa_id", user.empresa_id)
      .eq("id", avisoId);

    if (deleteError) {
      throw new AIError("OUTBOX_DELETE", "No se pudo eliminar el aviso. Intenta nuevamente.", 503);
    }

    await recordSecurityEvent(db, {
      empresaId: user.empresa_id,
      actorId: user.id,
      eventType: "aviso.deleted",
      resourceType: "whatsapp_avisos",
      resourceId: avisoId,
    });

    return NextResponse.json(
      { deleted: true, id: avisoId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorJSON(e);
  }
}
