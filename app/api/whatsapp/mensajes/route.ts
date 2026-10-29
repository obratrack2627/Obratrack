import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
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
        "message_id,actor_id,texto,respuesta,cotizacion,acciones,adjunto,aviso_id,categoria,proyectos_ids,sent_at,created_at",
        { count: "exact" },
      )
      .eq("empresa_id", user.empresa_id);
    const staff = ["admin", "supervisor"].includes(user.rol);
    if (!staff) query = query.eq("actor_id", user.id);
    if (staff && params.get("autor"))
      query = query.eq("actor_id", params.get("autor")!);
    const category = params.get("tipo");
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
