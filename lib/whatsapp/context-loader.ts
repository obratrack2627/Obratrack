import { completeRows, completeProjectRows } from '@/lib/supabase/pagination';
import { AIError } from "@/lib/ai/errors";

export const whatsappChildTables = [
  "actividades",
  "materiales_proyecto",
  "pagos",
  "bitacora_entradas",
  "imprevistos",
  "asistencia_obreros",
  "reclamos_cambios_obra",
  "documentos_obra",
];

function checked(result: any): any[] {
  if (result.error)
    throw new AIError(
      "WHATSAPP_DATABASE_READ",
      "No se pudo consultar la información de la obra.",
      503,
    );
  return result.data || [];
}

/** Lecturas actuales por mensaje; sin caché de roles, permisos o conversaciones. */
export async function loadWhatsAppContext(
  sb: any,
  user: any,
  users: any[],
  options?: { lightweightIfIdle?: boolean },
) {
  const companyResult = Promise.resolve(
    sb.from("empresas").select("id,plan_id").eq("id", user.empresa_id),
  );
  const projectResult = Promise.resolve(
    completeRows(() => sb.from("proyectos").select("*").eq("empresa_id", user.empresa_id)),
  );
  // Solo se consulta el historial cuando el plan vigente habilita el canal.
  const historyResult = companyResult.then((result) => {
    const company = checked(result)[0];
    return company?.plan_id === "pro_ia"
      ? sb
          .from("whatsapp_mensajes")
          .select("*")
          .eq("empresa_id", user.empresa_id)
          .eq("actor_id", user.id)
          .order("created_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] });
  });

  // Las tablas hijas pesadas se omiten en saludos o toques de menú cuando no hay borrador ni pausa activa.
  const tablesResult = Promise.all([projectResult, historyResult]).then(async ([projRes, histRes]) => {
    const projects = checked(projRes);
    const historyRows = checked(histRes);
    const ids = projects.map((p) => p.id);
    const names = [
      "clientes",
      "agenda_eventos",
      ...whatsappChildTables,
      "proyecto_trabajadores",
    ];
    const latest = historyRows.find((r) => r.acciones?.tipo !== "agrupado_en_lote");
    const hasPendingFlow = Boolean(
      latest?.borrador_obra ||
        latest?.acciones?.pausa_humana ||
        latest?.acciones?.borrador_registro ||
        latest?.acciones?.detalles?.borrador ||
        latest?.acciones?.detalles?.borrador_registro ||
        latest?.acciones?.edicion_nombre_pendiente,
    );
    if (options?.lightweightIfIdle && !hasPendingFlow) {
      const crewRes = ids.length
        ? await completeProjectRows(sb, "proyecto_trabajadores", ids, ["proyecto_id", "usuario_id"])
        : { data: [] };
      const tables: Record<string, any[]> = {
        usuarios: users.filter((u) => u.empresa_id === user.empresa_id),
        proyectos: projects,
      };
      for (const name of names) {
        tables[name] = name === "proyecto_trabajadores" ? checked(crewRes) : [];
      }
      return tables;
    }

    const results = await Promise.all([
      completeRows(() => sb.from("clientes").select("*").eq("empresa_id", user.empresa_id)),
      completeRows(() => sb.from("agenda_eventos").select("*").eq("empresa_id", user.empresa_id)),
      ...[...whatsappChildTables, "proyecto_trabajadores"].map((table) => {
        if (!ids.length) return Promise.resolve({ data: [] });
        return completeProjectRows(sb, table, ids, table === 'proyecto_trabajadores' ? ['proyecto_id','usuario_id'] : table === 'materiales_proyecto' ? ['created_at','id'] : ['id']);
      }),
    ]);
    const tables: Record<string, any[]> = {
      usuarios: users.filter((u) => u.empresa_id === user.empresa_id),
      proyectos: projects,
    };
    names.forEach((name, i) => {
      tables[name] = checked(results[i]);
    });
    return tables;
  });

  const [company, tables, history] = await Promise.all([
    companyResult,
    tablesResult,
    historyResult,
  ]);
  return {
    company: checked(company)[0],
    tables,
    conversationRows: checked(history),
  };
}
