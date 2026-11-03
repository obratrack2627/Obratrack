import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { budgetStatuses, findBudget, budgetGroup, budgetRPCError } from "@/lib/presupuestos";
import { normalizeQuote } from '@/lib/ai/protocol';
import { reviseQuote } from "@/lib/quotes/revise";
export const dynamic = "force-dynamic";

async function access(request: NextRequest) {
  const auth = await authorizeAI(request);
  if (!["admin", "supervisor"].includes(auth.user.rol))
    throw new AIError(
      "BUDGET_FORBIDDEN",
      "Tu perfil no tiene acceso a los presupuestos.",
      403,
    );
  return auth;
}
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await access(request);
    const documentId = request.nextUrl.searchParams.get('id');
    if (documentId) {
      const row = await findBudget(client, user.empresa_id, documentId);
      const group = row ? await budgetGroup(client, user.empresa_id, row) : null;
      let revisions: any[] = [];
      let alternatives: any[] = [];
      if (row?.grupo_id && request.nextUrl.searchParams.get('alternativas') === '1') {
        const result = await client.from('presupuestos').select('*').eq('empresa_id', user.empresa_id).eq('grupo_id', row.grupo_id).order('created_at');
        if (result.error) throw new AIError('BUDGET_READ', 'No se pudieron cargar las opciones.', 503);
        alternatives = result.data || [];
      }
      if (row && request.nextUrl.searchParams.get('historial') === '1') {
        const result = await client.from('presupuesto_revisiones').select('*').eq('empresa_id', user.empresa_id).eq('presupuesto_id', row.id).order('created_at', { ascending: false });
        if (result.error) throw new AIError('BUDGET_READ', 'No se pudo cargar el historial.', 503);
        revisions = result.data || [];
      }
      return NextResponse.json({ presupuestos: row ? [{ ...row, grupo: group }] : [], revisiones: revisions, alternativas: alternatives });
    }
    let query = client
      .from("presupuestos")
      .select("*")
      .eq("empresa_id", user.empresa_id)
      .order("created_at", { ascending: false });
    const projectId = request.nextUrl.searchParams.get("proyecto_id");
    if (projectId) query = query.eq("proyecto_id", projectId);
    const id = request.nextUrl.searchParams.get("id");
    if (id) query = query.eq("id", id);
    const { data, error } = await query;
    if (error)
      throw new AIError(
        "BUDGET_READ",
        "No se pudieron cargar los presupuestos.",
        503,
      );
    const groupIds = Array.from(new Set((data || []).map((r: any) => r.grupo_id).filter(Boolean)));
    let groups: any[] = [];
    if (groupIds.length) {
      const result = await client.from('presupuesto_grupos').select('*').eq('empresa_id', user.empresa_id).in('id', groupIds);
      if (result.error) throw new AIError('BUDGET_READ', 'No se pudieron consultar las alternativas.', 503);
      groups = result.data || [];
    }
    return NextResponse.json({ presupuestos: (data || []).map((r: any) => ({ ...r, grupo: groups.find((g) => g.id === r.grupo_id) || null })), grupos: groups });
  } catch (error) {
    return errorJSON(error);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const { client, user } = await access(request);
    const raw = await request.text();
    if (raw.length > 400000) throw new AIError("REQUEST_TOO_LARGE", "El presupuesto es demasiado extenso.", 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { body = null; }
    if (
      typeof body?.id !== "string" ||
      (Object.hasOwn(body, "estado") && !budgetStatuses.includes(body.estado)) ||
      typeof body.updated_at !== "string"
    )
      throw new AIError(
        "INVALID_REQUEST",
        "Revisa el estado del presupuesto.",
        400,
      );
    const updates: Record<string, any> = {};
    const existing = await findBudget(client, user.empresa_id, body.id);
    if (!existing) throw new AIError('BUDGET_FORBIDDEN', 'El presupuesto no está disponible para tu cuenta.', 403);
    const group = await budgetGroup(client, user.empresa_id, existing);
    if (group && !Object.hasOwn(body, 'cotizacion')) {
      const { data, error } = await client.rpc('actualizar_grupo_presupuesto', { p_id: existing.id, p_version: body.updated_at, p_estado: body.estado ?? null, p_proyecto: body.proyecto_id ?? null, p_cambiar_proyecto: Object.hasOwn(body, 'proyecto_id') });
      if (error) budgetRPCError(error);
      return NextResponse.json({ presupuesto: { ...data, grupo: await budgetGroup(client, user.empresa_id, data) } });
    }
    if (group?.aplicado && group.seleccionado_id === existing.id && Object.hasOwn(body, 'cotizacion'))
      throw new AIError('BUDGET_LOCKED', 'Este presupuesto ya está aplicado. Crea una alternativa para revisar los cambios antes de actualizar la obra.', 409);
    if (Object.hasOwn(body, "estado")) updates.estado = body.estado;
    if (Object.hasOwn(body, "cotizacion")) {
      const { data: current, error: readError } = await client.from("presupuestos")
        .select("cotizacion").eq("empresa_id", user.empresa_id).eq("id", body.id).maybeSingle();
      if (readError) throw new AIError("BUDGET_READ", "No se pudo consultar el presupuesto guardado.", 503);
      if (!current) throw new AIError("BUDGET_FORBIDDEN", "El presupuesto no está disponible para tu cuenta.", 403);
      if (body.cotizacion?.id !== current.cotizacion.id) throw new AIError("INVALID_REQUEST", "La cotización no corresponde al presupuesto.", 400);
      updates.cotizacion = reviseQuote(current.cotizacion, body.cotizacion);
    }
    if (Object.hasOwn(body, "proyecto_id")) {
      if (
        body.proyecto_id !== null &&
        (typeof body.proyecto_id !== "string" || !body.proyecto_id)
      )
        throw new AIError(
          "INVALID_REQUEST",
          "Selecciona una obra válida.",
          400,
        );
      if (body.proyecto_id) {
        const { data, error } = await client
          .from("proyectos")
          .select("id")
          .eq("empresa_id", user.empresa_id)
          .eq("id", body.proyecto_id)
          .maybeSingle();
        if (error || !data)
          throw new AIError(
            "PROJECT_FORBIDDEN",
            "La obra no está disponible para tu cuenta.",
            403,
          );
      }
      updates.proyecto_id = body.proyecto_id;
    }
    if (!Object.keys(updates).length) throw new AIError("INVALID_REQUEST", "No hay cambios para guardar.", 400);
    const { data, error } = await client
      .from("presupuestos")
      .update(updates)
      .eq("id", body.id)
      .eq("empresa_id", user.empresa_id)
      .eq("updated_at", body.updated_at)
      .select("*")
      .maybeSingle();
    if (error) budgetRPCError(error);
    if (!data)
      throw new AIError(
        "BUDGET_CONFLICT",
        "El presupuesto cambió o ya no está disponible. Actualiza el listado.",
        409,
      );
    return NextResponse.json({ presupuesto: { ...data, grupo: group } });
  } catch (error) {
    return errorJSON(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await access(request);
    const raw = await request.text();
    if (raw.length > 400000) throw new AIError('REQUEST_TOO_LARGE', 'El presupuesto es demasiado extenso.', 413);
    let body: any; try { body = JSON.parse(raw); } catch { body = null; }
    if (!body || !['principal','complementario'].includes(body.tipo || 'principal')) throw new AIError('INVALID_REQUEST', 'Revisa el tipo de presupuesto.', 400);
    let source = null;
    if (body.origen_id) {
      if (typeof body.origen_id !== 'string' || typeof body.updated_at !== 'string') throw new AIError('INVALID_REQUEST', 'Selecciona el presupuesto de origen.', 400);
      source = await findBudget(client, user.empresa_id, body.origen_id);
      if (!source) throw new AIError('BUDGET_FORBIDDEN', 'El presupuesto no está disponible.', 403);
    }
    const rawQuote = body.cotizacion || source?.cotizacion;
    if (!rawQuote) throw new AIError('INVALID_REQUEST', 'Agrega el contenido de la cotización.', 400);
    const quote = normalizeQuote({ ...rawQuote, nombre_alternativa: body.nombre_alternativa || rawQuote.nombre_alternativa || 'Nueva alternativa' });
    if (source) quote.fecha_creacion = new Date().toISOString();
    const project = source ? source.proyecto_id : (body.proyecto_id || null);
    const { data, error } = await client.rpc('guardar_alternativas_presupuesto', {
      p_origen_id: source?.id || null, p_version: source ? body.updated_at : null,
      p_cotizaciones: [quote], p_proyecto: project, p_nombre: body.nombre_grupo || source?.grupo?.nombre || quote.titulo_proyecto,
      p_tipo: body.tipo || 'principal',
    });
    if (error) budgetRPCError(error);
    return NextResponse.json({ ...data, presupuesto: data.presupuestos.find((r: any) => r.id === quote.id) }, { status: 201 });
  } catch (error) { return errorJSON(error); }
}
