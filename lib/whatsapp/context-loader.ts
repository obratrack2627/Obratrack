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
export async function loadWhatsAppContext(sb: any, user: any, users: any[]) {
  const companyResult = Promise.resolve(
    sb.from("empresas").select("id,plan_id").eq("id", user.empresa_id),
  );
  const projectResult = Promise.resolve(
    sb.from("proyectos").select("*").eq("empresa_id", user.empresa_id),
  );

  // Las tablas de obra dependen de sus IDs, pero no del historial ni del plan.
  const tablesResult = projectResult.then(async (result) => {
    const projects = checked(result);
    const ids = projects.map((p) => p.id);
    const names = [
      "clientes",
      "agenda_eventos",
      ...whatsappChildTables,
      "proyecto_trabajadores",
    ];
    const results = await Promise.all([
      sb.from("clientes").select("*").eq("empresa_id", user.empresa_id),
      sb.from("agenda_eventos").select("*").eq("empresa_id", user.empresa_id),
      ...[...whatsappChildTables, "proyecto_trabajadores"].map((table) =>
        ids.length
          ? sb.from(table).select("*").in("proyecto_id", ids)
          : Promise.resolve({ data: [] }),
      ),
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
