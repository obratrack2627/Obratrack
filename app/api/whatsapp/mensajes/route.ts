import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordSecurityEvent } from "@/lib/security/audit-log";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const params = request.nextUrl.searchParams;
    const page = Math.max(
      0,
      Math.min(Math.floor(Number(params.get("pagina")) || 0), 10000),
    );
    let query = client
      .from("whatsapp_mensajes")
      .select(
        "message_id,actor_id,texto,respuesta,cotizacion,acciones,adjunto,aviso_id,categoria,proyectos_ids,sent_at,created_at,revision_resuelta_at",
        { count: "exact" },
      )
      .eq("empresa_id", user.empresa_id);
    const staff = ["admin", "supervisor"].includes(user.rol);
    if (!staff) query = query.eq("actor_id", user.id);
    if (staff && params.get("autor"))
      query = query.eq("actor_id", params.get("autor")!);
    const category = params.get("tipo");
    if (category === "revision_humana") query = query.not("acciones->>derivacion_humana", "is", null);
    if (
      category &&
      [
        "consulta",
        "registro",
        "cotizacion",
        "fotografia",
        "datos_obra",
        "aviso",
      ].includes(category)
    )
      query = query.eq("categoria", category);
    const project = params.get("obra");
    if (project) query = query.contains("proyectos_ids", [project]);
    const search = (params.get("buscar") || "")
      .slice(0, 100)
      .replace(/[(),%_*\\]/g, "")
      .trim();
    if (search)
      query = query.or(`texto.ilike.%${search}%,respuesta.ilike.%${search}%`);
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(page * 20, page * 20 + 19);
    if (error)
      throw new AIError(
        "WHATSAPP_INBOX",
        "No se pudieron cargar los registros de WhatsApp.",
        503,
      );
    const { data: authors, error: authorError } = await client
      .from("usuarios")
      .select("id,nombre,rol")
      .eq("empresa_id", user.empresa_id);
    if (authorError)
      throw new AIError(
        "WHATSAPP_INBOX",
        "No se pudieron cargar los autores de los registros.",
        503,
      );
    const { data: projects, error: projectError } = await client
      .from("proyectos")
      .select("id,nombre")
      .eq("empresa_id", user.empresa_id);
    if (projectError)
      throw new AIError(
        "WHATSAPP_INBOX",
        "No se pudieron cargar las obras de los registros.",
        503,
      );
    let visibleProjects = projects || [];
    if (!staff) {
      const { data: assigned, error: assignedError } = await client
        .from("proyecto_trabajadores")
        .select("proyecto_id")
        .eq("usuario_id", user.id);
      if (assignedError)
        throw new AIError(
          "WHATSAPP_INBOX",
          "No se pudieron consultar las obras asignadas.",
          503,
        );
      const ids = new Set(assigned?.map((r) => r.proyecto_id));
      visibleProjects = visibleProjects.filter((p) => ids.has(p.id));
    }
    const messages = (data || []).map((m) => ({
      ...m,
      autor: authors?.find((a) => a.id === m.actor_id) || null,
      obras: visibleProjects.filter((p) =>
        (m.proyectos_ids || []).includes(p.id),
      ),
    }));
    return NextResponse.json(
      {
        mensajes: messages,
        total: count || 0,
        pagina: page,
        autores: staff ? authors : authors?.filter((a) => a.id === user.id),
        obras: visibleProjects,
        gestion: staff,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorJSON(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await authorizeAI(request);
    if (user.rol !== 'admin') throw new AIError('REPORT_FORBIDDEN', 'Solo administración puede cerrar esta revisión.', 403);
    const id = (await request.json().catch(() => null))?.message_id;
    if (typeof id !== 'string' || !id || id.length > 256) throw new AIError('INVALID_REQUEST', 'Selecciona una revisión válida.', 400);
    const db = getSupabaseAdmin();
    if (!db) throw new AIError('WHATSAPP_INBOX', 'No se pudo acceder a la revisión.', 503);
    const { data, error } = await db.from('whatsapp_mensajes').update({ revision_resuelta_at: new Date().toISOString() })
      .eq('empresa_id', user.empresa_id).eq('message_id', id).not('acciones->>derivacion_humana', 'is', null).select('message_id').maybeSingle();
    if (error) throw new AIError('WHATSAPP_INBOX', 'No se pudo cerrar la revisión.', 503);
    if (!data) throw new AIError('REPORT_NOT_FOUND', 'La revisión no está disponible.', 404);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorJSON(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    if (!["admin", "supervisor"].includes(user.rol)) {
      throw new AIError(
        "REPORT_FORBIDDEN",
        "Solo administración y supervisión pueden eliminar reportes.",
        403,
      );
    }
    let messageId = (request.nextUrl.searchParams.get("id") || "").trim();
    if (!messageId) {
      const body = await request.json().catch(() => null);
      messageId = typeof body?.message_id === "string" ? body.message_id.trim() : "";
    }
    if (!messageId || messageId.length > 200) {
      throw new AIError("INVALID_REQUEST", "Selecciona un reporte válido para eliminar.", 400);
    }

    const db = getSupabaseAdmin() || client;
    const { data: existing, error: readError } = await db
      .from("whatsapp_mensajes")
      .select("message_id, empresa_id, adjunto")
      .eq("empresa_id", user.empresa_id)
      .eq("message_id", messageId)
      .maybeSingle();
    if (readError) {
      throw new AIError("WHATSAPP_INBOX", "No se pudo consultar el reporte seleccionado.", 503);
    }
    if (!existing) {
      throw new AIError("REPORT_NOT_FOUND", "El reporte no existe o no pertenece a tu empresa.", 404);
    }

    const { error: deleteError } = await db
      .from("whatsapp_mensajes")
      .delete()
      .eq("empresa_id", user.empresa_id)
      .eq("message_id", messageId);
    if (deleteError) {
      throw new AIError("WHATSAPP_INBOX", "No se pudo eliminar el reporte. Intenta nuevamente.", 503);
    }

    // Limpiar archivo en Storage solo si ya no está referenciado por bitácora, documentos ni otros mensajes.
    const adjPath = typeof existing?.adjunto?.path === "string" ? existing.adjunto.path : "";
    if (adjPath && adjPath.startsWith(`${user.empresa_id}/`) && db.storage?.from) {
      try {
        const evidenceRef = `whatsapp-evidencias:${adjPath}`;
        const [bitRef, docRef, msgRef] = await Promise.all([
          db.from("bitacora_entradas").select("id").eq("foto_url", evidenceRef).limit(1),
          db.from("documentos_obra").select("id").eq("empresa_id", user.empresa_id).eq("archivo_url", evidenceRef).limit(1),
          db.from("whatsapp_mensajes").select("message_id").eq("empresa_id", user.empresa_id).contains("adjunto", { path: adjPath }).limit(1),
        ]);
        const stillReferenced =
          Boolean(bitRef?.data?.length) ||
          Boolean(docRef?.data?.length) ||
          Boolean(msgRef?.data?.length);
        if (!stillReferenced) {
          await db.storage.from("whatsapp-evidencias").remove([adjPath]);
        }
      } catch {
        // Limpieza best-effort para no fallar una eliminación ya confirmada.
      }
    }

    await recordSecurityEvent(db, {
      empresaId: user.empresa_id,
      actorId: user.id,
      eventType: "report.deleted",
      resourceType: "whatsapp_mensajes",
      resourceId: messageId,
    });

    return NextResponse.json(
      { deleted: true, message_id: messageId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorJSON(error);
  }
}
